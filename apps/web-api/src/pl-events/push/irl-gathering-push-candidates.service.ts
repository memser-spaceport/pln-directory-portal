import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { IrlGatheringPushRuleKind, PushNotificationCategory } from '@prisma/client';
import { IrlGatheringPushConfigService } from './irl-gathering-push-config.service';

type CandidateRow = {
  eventUid: string;
  eventStartDate: Date;
  eventEndDate: Date;
  attendeeCount: number;
};

@Injectable()
export class IrlGatheringPushCandidatesService {
  private readonly logger = new Logger(IrlGatheringPushCandidatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: IrlGatheringPushConfigService
  ) {}

  /**
   * Recomputes push candidates for provided event UIDs.
   *
   * Qualification rules (DB-configurable):
   * - config.enabled == true
   * - event.isDeleted == false
   * - event.locationUid is present (has gathering)
   * - event.endDate is in the future (includes in-progress events)
   * - event.endDate <= now + upcomingWindowDays
   * - attendeeCount >= minAttendeesPerEvent
   *
   * Idempotency:
   * - Uses upsert on (ruleKind, eventUid), so it never creates duplicates.
   * - If no longer qualifies, deletes both UPCOMING and REMINDER rows for that event.
   */
  async refreshCandidatesForEvents(eventUids: string[]): Promise<void> {
    const inputCount = Array.isArray(eventUids) ? eventUids.length : 0;
    this.logger.log(`[candidates] refreshCandidatesForEvents() called; inputCount=${inputCount}`);

    const uniqueEventUids = [...new Set((eventUids ?? []).filter(Boolean))];
    this.logger.log(
      `[candidates] normalized eventUids; uniqueCount=${uniqueEventUids.length}, removed=${Math.max(0, inputCount - uniqueEventUids.length)}`
    );

    if (uniqueEventUids.length === 0) {
      this.logger.log('[candidates] no eventUids after normalization -> nothing to do');
      return;
    }

    const cfg = await this.configService.getActiveConfigOrNull();
    if (!cfg) {
      this.logger.warn('[candidates] active config not found -> skipping refresh');
      return;
    }

    if (!cfg.enabled) {
      this.logger.warn(`[candidates] config.enabled=false (uid=${cfg.uid}) -> skipping refresh`);
      return;
    }

    const now = new Date();
    const windowEnd = new Date(now.getTime() + cfg.upcomingWindowDays * 24 * 60 * 60 * 1000);

    this.logger.log(
      `[candidates] config in effect; uid=${cfg.uid} now=${now.toISOString()} windowEnd=${windowEnd.toISOString()} ` +
      `minAttendeesPerEvent=${cfg.minAttendeesPerEvent} upcomingWindowDays=${cfg.upcomingWindowDays} reminderDaysBefore=${cfg.reminderDaysBefore}`
    );

    this.logger.log('[candidates] fetching events from DB...');
    const events = await this.prisma.pLEvent.findMany({
      where: {
        uid: { in: uniqueEventUids },
        isDeleted: false,
      },
      select: {
        uid: true,
        startDate: true,
        endDate: true,
        locationUid: true,
      },
    });

    this.logger.log(`[candidates] events fetched; found=${events.length}, requested=${uniqueEventUids.length}`);

    if (events.length !== uniqueEventUids.length) {
      const foundSet = new Set(events.map(e => e.uid));
      const missing = uniqueEventUids.filter(uid => !foundSet.has(uid));
      this.logger.warn(`[candidates] missing/deleted events; missingCount=${missing.length}, missing=${missing.join(',')}`);
    }

    this.logger.log('[candidates] counting attendees per event via groupBy...');
    const attendeeCounts = await this.prisma.pLEventGuest.groupBy({
      by: ['eventUid'],
      where: { eventUid: { in: uniqueEventUids } },
      _count: { _all: true },
    });

    this.logger.log(`[candidates] attendee counts fetched; rows=${attendeeCounts.length}`);

    const countByEventUid = new Map<string, number>();
    for (const row of attendeeCounts) {
      if (!row.eventUid) continue;
      countByEventUid.set(row.eventUid, row._count._all);
    }

    this.logger.log('[candidates] building upsert/delete operations...');
    const upserts: Promise<any>[] = [];
    const deletes: Promise<any>[] = [];

    for (const ev of events) {
      const attendeeCount = countByEventUid.get(ev.uid) ?? 0;

      const hasGathering = Boolean(ev.locationUid);
      const startDate = ev.startDate ? new Date(ev.startDate) : null;
      const endDate = ev.endDate ? new Date(ev.endDate) : null;

      // Use endDate to include in-progress events. An event is "relevant" if it hasn't ended yet.
      const notEnded = !!endDate && endDate.getTime() >= now.getTime();

      // Upcoming window is also based on end date so that ongoing events are included.
      const withinUpcomingWindow = !!endDate && endDate.getTime() <= windowEnd.getTime();
      const meetsThreshold = attendeeCount >= cfg.minAttendeesPerEvent;

      // UPCOMING should include in-progress + future events.
      const qualifiesUpcoming = hasGathering && notEnded && withinUpcomingWindow && meetsThreshold;

      // REMINDER should only apply for events that haven't started yet.
      const notStartedYet = !!startDate && startDate.getTime() > now.getTime();
      const qualifiesReminder = qualifiesUpcoming && notStartedYet;

      this.logger.log(
        `[candidates] evaluate event=${ev.uid} ` +
        `hasGathering=${hasGathering} ` +
        `startDate=${startDate ? startDate.toISOString() : 'null'} endDate=${endDate ? endDate.toISOString() : 'null'} ` +
        `notEnded=${notEnded} withinUpcomingWindow=${withinUpcomingWindow} ` +
        `attendeeCount=${attendeeCount} meetsThreshold=${meetsThreshold} ` +
        `qualifiesUpcoming=${qualifiesUpcoming} qualifiesReminder=${qualifiesReminder}`
      );

      if (qualifiesUpcoming) {
        // UPCOMING candidate
        upserts.push(
          this.prisma.irlGatheringPushCandidate.upsert({
            where: {
              ruleKind_eventUid: {
                ruleKind: IrlGatheringPushRuleKind.UPCOMING,
                eventUid: ev.uid,
              },
            },
            create: {
              ruleKind: IrlGatheringPushRuleKind.UPCOMING,
              gatheringUid: ev.locationUid!,
              eventUid: ev.uid,
              eventStartDate: ev.startDate,
              eventEndDate: ev.endDate,
              attendeeCount,
              processedAt: null,
              isSuppressed: false,
            },
            update: {
              gatheringUid: ev.locationUid!,
              eventStartDate: ev.startDate,
              eventEndDate: ev.endDate,
              attendeeCount,
              processedAt: null,
            },
          })
        );

        // REMINDER candidate (only when event hasn't started)
        if (qualifiesReminder) {
          upserts.push(
          this.prisma.irlGatheringPushCandidate.upsert({
            where: {
              ruleKind_eventUid: {
                ruleKind: IrlGatheringPushRuleKind.REMINDER,
                eventUid: ev.uid,
              },
            },
            create: {
              ruleKind: IrlGatheringPushRuleKind.REMINDER,
              gatheringUid: ev.locationUid!,
              eventUid: ev.uid,
              eventStartDate: ev.startDate,
              eventEndDate: ev.endDate,
              attendeeCount,
              processedAt: null,
              isSuppressed: false,
            },
            update: {
              gatheringUid: ev.locationUid!,
              eventStartDate: ev.startDate,
              eventEndDate: ev.endDate,
              attendeeCount,
              processedAt: null,
            },
          })
          );
        } else {
          // Ensure stale reminder candidates are removed for in-progress events.
          deletes.push(
            this.prisma.irlGatheringPushCandidate.deleteMany({
              where: {
                ruleKind: IrlGatheringPushRuleKind.REMINDER,
                eventUid: ev.uid,
              },
            })
          );
        }

        this.logger.log(
          `[candidates] event=${ev.uid} qualifies -> scheduling UPSERT (UPCOMING${qualifiesReminder ? ' + REMINDER' : ''})`
        );
      } else {
        deletes.push(
          this.prisma.irlGatheringPushCandidate.deleteMany({
            where: {
              ruleKind: { in: [IrlGatheringPushRuleKind.UPCOMING, IrlGatheringPushRuleKind.REMINDER] },
              eventUid: ev.uid,
            },
          })
        );

        this.logger.log(`[candidates] event=${ev.uid} does NOT qualify -> scheduling DELETE (UPCOMING + REMINDER)`);
      }
    }

    this.logger.log(`[candidates] executing DB writes; upserts=${upserts.length}, deletes=${deletes.length}`);
    await Promise.all([...upserts, ...deletes]);

    // Optional post-check (useful during debugging; remove later)
    const postCount = await this.prisma.irlGatheringPushCandidate.count({
      where: {
        eventUid: { in: uniqueEventUids },
        ruleKind: { in: [IrlGatheringPushRuleKind.UPCOMING, IrlGatheringPushRuleKind.REMINDER] },
      },
    });

    this.logger.log(
      `[candidates] done; refreshed events=${uniqueEventUids.length} upserts=${upserts.length} deletes=${deletes.length} ` +
      `postCount(candidates for provided eventUids)=${postCount}`
    );
  }

  /**
   * Convenience wrapper used by write-paths (e.g., adding/removing guests).
   *
   * Why:
   * - Candidates are recomputed on every guest change.
   * - If a push notification for the affected gathering was already sent, we want its metadata (attendee counts)
   *   to be refreshed immediately, not only when the cron job runs next.
   */
  async refreshCandidatesForEventsAndUpdateNotifications(eventUids: string[]): Promise<void> {
    await this.refreshCandidatesForEvents(eventUids);
    await this.updateAlreadySentNotificationsForEvents(eventUids);
  }

  private async updateAlreadySentNotificationsForEvents(eventUids: string[]): Promise<void> {
    const uniqueEventUids = [...new Set((eventUids ?? []).filter(Boolean))];
    if (uniqueEventUids.length === 0) return;

    const cfg = await this.configService.getActiveConfigOrNull();
    if (!cfg || !cfg.enabled) return;

    const now = new Date();
    const msInDay = 24 * 60 * 60 * 1000;
    const windowEnd = new Date(now.getTime() + cfg.upcomingWindowDays * msInDay);

    // Resolve gatherings impacted by these events.
    const events = await this.prisma.pLEvent.findMany({
      where: { uid: { in: uniqueEventUids }, isDeleted: false },
      select: { uid: true, locationUid: true },
    });

    const gatheringUids = [...new Set(events.map((e) => e.locationUid).filter(Boolean))] as string[];
    if (gatheringUids.length === 0) return;

    for (const gatheringUid of gatheringUids) {
      // Check if there are already-sent notifications for this gathering.
      // We update both rule kinds if present.
      const sent = await this.prisma.pushNotification.findMany({
        where: {
          category: PushNotificationCategory.IRL_GATHERING,
          AND: [
            { metadata: { path: ['gatheringUid'], equals: gatheringUid } },
            { metadata: { path: ['version'], equals: 1 } },
          ],
        },
        select: { uid: true, metadata: true },
      });

      if (sent.length === 0) continue;

      for (const row of sent) {
        const ruleKind = (row.metadata as any)?.ruleKind as IrlGatheringPushRuleKind | undefined;
        if (!ruleKind) continue;

        // Candidates we should show in the notification payload.
        // We use eventEndDate window so in-progress events are included.
        const candidates = await this.prisma.irlGatheringPushCandidate.findMany({
          where: {
            gatheringUid,
            ruleKind,
            isSuppressed: false,
            eventEndDate: { gte: now, lte: windowEnd },
          },
          orderBy: [{ eventStartDate: 'asc' }],
          select: {
            eventUid: true,
            eventStartDate: true,
            eventEndDate: true,
            attendeeCount: true,
          },
        });

        if (candidates.length === 0) continue;

        const payload = await this.buildLocationPayload(gatheringUid, candidates);

        const title = payload.location?.name ? `IRL gathering in ${payload.location.name}` : 'IRL gathering';
        const description =
          (payload.location?.description && String(payload.location.description).trim().length > 0)
            ? String(payload.location.description).trim()
            : payload.events?.total != null
              ? `${payload.events.total} upcoming event(s) • ${payload.attendees.total} attendee(s)`
              : 'Upcoming IRL gathering';

        await this.prisma.pushNotification.update({
          where: { uid: row.uid },
          data: { title, description, metadata: { ...payload, ruleKind } as any },
        });

        this.logger.log(
          `[candidates] updated sent pushNotification uid=${row.uid} gatheringUid=${gatheringUid} ruleKind=${ruleKind}`
        );
      }
    }
  }

  private async buildLocationPayload(gatheringUid: string, candidates: CandidateRow[]): Promise<any> {
    const eventUids = [...new Set(candidates.map((c) => c.eventUid).filter(Boolean))];

    const location = await this.prisma.pLEventLocation.findUnique({
      where: { uid: gatheringUid },
      select: {
        uid: true,
        location: true,
        description: true,
        country: true,
        timezone: true,
        latitude: true,
        longitude: true,
        flag: true,
        icon: true,
      },
    });

    const events = await this.prisma.pLEvent.findMany({
      where: { uid: { in: eventUids }, isDeleted: false },
      select: {
        uid: true,
        slugURL: true,
        name: true,
        startDate: true,
        endDate: true,
        logo: { select: { url: true } },
      },
      orderBy: [{ startDate: 'asc' }],
    });

    const attendeeCountByEventUid = new Map<string, number>();
    for (const c of candidates) attendeeCountByEventUid.set(c.eventUid, c.attendeeCount);

    const eventSummaries = events.map((ev) => ({
      uid: ev.uid,
      slug: ev.slugURL,
      name: ev.name,
      startDate: ev.startDate.toISOString(),
      endDate: ev.endDate.toISOString(),
      attendeeCount: attendeeCountByEventUid.get(ev.uid) ?? 0,
      logoUrl: ev.logo?.url ?? null,
    }));

    const dateStart = eventSummaries.length ? eventSummaries[0].startDate : null;
    const dateEnd = eventSummaries.length ? eventSummaries[eventSummaries.length - 1].endDate : null;

    const distinctAttendees = await this.prisma.pLEventGuest.findMany({
      where: { eventUid: { in: eventUids } },
      distinct: ['memberUid'],
      select: { memberUid: true },
    });

    const top = await this.prisma.pLEventGuest.groupBy({
      by: ['memberUid'],
      where: { eventUid: { in: eventUids } },
      _count: { eventUid: true },
      orderBy: { _count: { eventUid: 'desc' } },
      take: 6,
    });

    const topMemberUids = top.map((t) => t.memberUid);
    const topMembers = topMemberUids.length
      ? await this.prisma.member.findMany({
        where: { uid: { in: topMemberUids } },
        select: { uid: true, name: true, image: { select: { url: true } } },
      })
      : [];

    const memberByUid = new Map(topMembers.map((m) => [m.uid, m]));
    const topAttendees = top.map((row) => {
      const m = memberByUid.get(row.memberUid);
      return {
        memberUid: row.memberUid,
        eventsCount: row._count.eventUid,
        imageUrl: m?.image?.url ?? null,
        displayName: m?.name ?? null,
      };
    });

    return {
      version: 1,
      gatheringUid,
      location: location
        ? {
          id: location.uid,
          name: location.location,
          description: location.description,
          country: location.country,
          timezone: location.timezone,
          latitude: location.latitude,
          longitude: location.longitude,
          flag: location.flag,
          icon: location.icon,
        }
        : null,
      events: {
        total: eventSummaries.length,
        eventUids,
        dates: { start: dateStart, end: dateEnd },
        items: eventSummaries,
      },
      attendees: {
        total: distinctAttendees.length,
        topAttendees,
      },
      ui: {
        locationUid: gatheringUid,
        eventSlugs: eventSummaries.map((e) => e.slug),
      },
    };
  }
}
