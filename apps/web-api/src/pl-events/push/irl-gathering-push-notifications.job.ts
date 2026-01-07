import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../shared/prisma.service';
import { PushNotificationsService } from '../../push-notifications/push-notifications.service';
import { IrlGatheringPushRuleKind, PushNotificationCategory } from '@prisma/client';
import { IrlGatheringPushConfigService } from './irl-gathering-push-config.service';

type LocationInfo = {
  uid: string;
  location: string;
  country?: string | null;
  timezone?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  flag?: string | null;
  icon?: string | null;
};

type EventSummary = {
  uid: string;
  slug: string;
  name: string;
  startDate: string;
  endDate: string;
  attendeeCount: number;
  logoUrl?: string | null;
};

type TopAttendee = {
  memberUid: string;
  imageUrl?: string | null;
  displayName?: string | null;
  eventsCount: number;
};

// Cron schedule can't be dynamic from DB. Keep it in env.
const IRL_GATHERING_PUSH_CRON = process.env.IRL_GATHERING_PUSH_CRON ?? '*/5 * * * *';

type ActiveDbConfig = {
  uid: string;
  enabled: boolean;
  upcomingWindowDays: number;
  reminderDaysBefore: number;
  minAttendeesPerEvent: number;
  isActive: boolean;
};

@Injectable()
export class IrlGatheringPushNotificationsJob {
  private readonly logger = new Logger(IrlGatheringPushNotificationsJob.name);

  // Increment this when you change notification payload shape.
  private readonly payloadVersion = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotificationsService: PushNotificationsService,
    private readonly irlGatheringPushConfigService: IrlGatheringPushConfigService
  ) {}

  @Cron(IRL_GATHERING_PUSH_CRON, {
    name: 'IrlGatheringPushNotificationsJob',
  })
  async run(): Promise<void> {
    const cfg = (await this.irlGatheringPushConfigService.getActiveConfigOrNull()) as ActiveDbConfig | null;

    if (!cfg) {
      this.logger.log('[IRL push job] No active config in DB. Exiting.');
      return;
    }

    const now = new Date();

    this.logger.log('[IRL push job] Starting IRL gathering push notifications job');
    this.logger.log(
      `[IRL push job] Active DB config: uid=${cfg.uid}, enabled=${cfg.enabled}, upcomingWindowDays=${cfg.upcomingWindowDays}, reminderDaysBefore=${cfg.reminderDaysBefore}`
    );

    if (!cfg.enabled) {
      this.logger.log('[IRL push job] Job disabled (DB config). Exiting.');
      return;
    }

    // Load candidates that were not processed yet.
    const candidates = await this.prisma.irlGatheringPushCandidate.findMany({
      where: {
        processedAt: null,
        isSuppressed: false,
      },
      orderBy: [{ eventStartDate: 'asc' }],
      select: {
        uid: true,
        ruleKind: true,
        gatheringUid: true,
        eventUid: true,
        eventStartDate: true,
        attendeeCount: true,
      },
    });

    this.logger.log(`[IRL push job] Loaded candidates: ${candidates.length}`);

    if (candidates.length === 0) {
      this.logger.log('[IRL push job] No candidates to process. Exiting.');
      return;
    }

    // Group candidates by (ruleKind, gatheringUid) so that we send one notification per location.
    const groups = new Map<string, typeof candidates>();
    for (const c of candidates) {
      const key = `${c.ruleKind}::${c.gatheringUid}`;
      const existing = groups.get(key) ?? [];
      existing.push(c);
      groups.set(key, existing);
    }

    this.logger.log(`[IRL push job] Candidate groups: ${groups.size}`);

    for (const [groupKey, groupCandidates] of groups.entries()) {
      const [ruleKindRaw, gatheringUid] = groupKey.split('::');
      const ruleKind = ruleKindRaw as IrlGatheringPushRuleKind;

      this.logger.log(`[IRL push job] Processing group: ruleKind=${ruleKind}, gatheringUid=${gatheringUid}`);
      this.logger.log(`[IRL push job] Group candidates: ${groupCandidates.length}`);

      try {
        // Window check:
        // - UPCOMING: only if earliest eventStartDate <= now + upcomingWindowDays
        // - REMINDER: only if earliest eventStartDate is within reminderDaysBefore days (job controls exact date)
        const startDates = groupCandidates.map((c) => c.eventStartDate);
        const windowOk = this.matchesWindow(ruleKind, startDates, now, cfg);

        if (!windowOk) {
          this.logger.log(
            `[IRL push job] Group skipped (does not match time window): ruleKind=${ruleKind}, gatheringUid=${gatheringUid}`
          );
          await this.markCandidatesProcessed(groupCandidates.map((c) => c.uid));
          continue;
        }

        // De-duplication: do not send the same notification multiple times.
        // We key by (category, ruleKind, gatheringUid, payloadVersion).
        this.logger.log(
          `[IRL push job] Dedup check: category=IRL_GATHERING, ruleKind=${ruleKind}, gatheringUid=${gatheringUid}, version=${this.payloadVersion}`
        );

        const alreadySent = await this.prisma.pushNotification.findFirst({
          where: {
            category: PushNotificationCategory.IRL_GATHERING,
            AND: [
              { metadata: { path: ['ruleKind'], equals: ruleKind } },
              { metadata: { path: ['gatheringUid'], equals: gatheringUid } },
              { metadata: { path: ['version'], equals: this.payloadVersion } },
            ],
          },
          select: { id: true, uid: true, createdAt: true },
        });

        if (alreadySent) {
          this.logger.log(
            `[IRL push job] Notification already sent for group. Skipping. notificationUid=${alreadySent.uid}, createdAt=${alreadySent.createdAt.toISOString()}`
          );
          await this.markCandidatesProcessed(groupCandidates.map((c) => c.uid));
          continue;
        }

        // Build payload summary for this location.
        const payload = await this.buildLocationPayload(ruleKind, gatheringUid, groupCandidates);

        // A human-readable title/description; UI can ignore and fully rely on metadata payload.
        const title = payload.location?.name ? `IRL gathering in ${payload.location.name}` : 'IRL gathering';
        const description =
          payload.events?.total != null
            ? `${payload.events.total} upcoming event(s) • ${payload.attendees.total} attendee(s)`
            : 'Upcoming IRL gathering';

        this.logger.log(`[IRL push job] Creating push notification: title="${title}"`);
        this.logger.log(
          `[IRL push job] Payload summary: events=${payload.events.total}, attendees=${payload.attendees.total}`
        );

        const created = await this.pushNotificationsService.create({
          category: PushNotificationCategory.IRL_GATHERING,
          title,
          description,
          metadata: payload,
          isPublic: true,
        });

        this.logger.log(
          `[IRL push job] Notification stored: uid=${created.uid}, ruleKind=${ruleKind}, gatheringUid=${gatheringUid}`
        );

        await this.markCandidatesProcessed(groupCandidates.map((c) => c.uid));
      } catch (err: any) {
        this.logger.error(
          `[IRL push job] Failed processing group: ruleKind=${ruleKind}, gatheringUid=${gatheringUid}. Error: ${err?.message || err}`
        );
        // Do NOT mark as processed on error, so we can retry on next run.
      }
    }

    this.logger.log('[IRL push job] Completed IRL gathering push notifications job');
  }

  private matchesWindow(
    ruleKind: IrlGatheringPushRuleKind,
    startDates: Date[],
    now: Date,
    cfg: Pick<ActiveDbConfig, 'upcomingWindowDays' | 'reminderDaysBefore'>
  ): boolean {
    // For a grouped notification we consider the earliest event (closest upcoming).
    const earliest = startDates
      .filter(Boolean)
      .map((d) => new Date(d))
      .sort((a, b) => a.getTime() - b.getTime())[0];

    if (!earliest) {
      this.logger.log(`[IRL push job] Window check: ruleKind=${ruleKind}, earliest=<none> -> false`);
      return false;
    }

    this.logger.log(`[IRL push job] Window check: ruleKind=${ruleKind}, earliest=${earliest.toISOString()}`);

    const msInDay = 24 * 60 * 60 * 1000;

    if (ruleKind === IrlGatheringPushRuleKind.UPCOMING) {
      const windowEnd = new Date(now.getTime() + cfg.upcomingWindowDays * msInDay);
      this.logger.log(`[IRL push job] UPCOMING windowEnd=${windowEnd.toISOString()}`);
      return earliest.getTime() <= windowEnd.getTime();
    }

    // REMINDER: fire when event is within N days (inclusive).
    if (ruleKind === IrlGatheringPushRuleKind.REMINDER) {
      const reminderStart = new Date(now.getTime());
      const reminderEnd = new Date(now.getTime() + cfg.reminderDaysBefore * msInDay);
      this.logger.log(
        `[IRL push job] REMINDER window=[${reminderStart.toISOString()}..${reminderEnd.toISOString()}]`
      );
      return earliest.getTime() >= reminderStart.getTime() && earliest.getTime() <= reminderEnd.getTime();
    }

    return false;
  }

  private async markCandidatesProcessed(candidateUids: string[]): Promise<void> {
    if (!candidateUids?.length) return;
    await this.prisma.irlGatheringPushCandidate.updateMany({
      where: { uid: { in: candidateUids } },
      data: { processedAt: new Date() },
    });
    this.logger.log(`[IRL push job] Marked candidates processed: ${candidateUids.length}`);
  }

  /**
   * Builds a rich metadata payload for one location ("gathering") and ruleKind.
   *
   * Important: this payload is what the Notification Service stores and what UI consumes.
   * The Notification Service should remain data-agnostic and not fetch Directory data.
   */
  private async buildLocationPayload(
    ruleKind: IrlGatheringPushRuleKind,
    gatheringUid: string,
    groupCandidates: Array<{
      eventUid: string;
      eventStartDate: Date;
      attendeeCount: number;
    }>
  ): Promise<any> {
    const eventUids = [...new Set(groupCandidates.map((c) => c.eventUid).filter(Boolean))];
    this.logger.log(
      `[IRL push job] Building payload: ruleKind=${ruleKind}, gatheringUid=${gatheringUid}, eventUids=${eventUids.length}`
    );

    const location = await this.prisma.pLEventLocation.findUnique({
      where: { uid: gatheringUid },
      select: {
        uid: true,
        location: true,
        country: true,
        timezone: true,
        latitude: true,
        longitude: true,
        flag: true,
        icon: true,
      },
    });

    this.logger.log(`[IRL push job] Location loaded: ${location ? 'yes' : 'no'} uid=${gatheringUid}`);

    const locationInfo: LocationInfo | null = location
      ? {
        uid: location.uid,
        location: location.location,
        country: location.country,
        timezone: location.timezone,
        latitude: location.latitude,
        longitude: location.longitude,
        flag: location.flag,
        icon: location.icon,
      }
      : null;

    const events = await this.prisma.pLEvent.findMany({
      where: {
        uid: { in: eventUids },
        isDeleted: false,
      },
      select: {
        uid: true,
        slugURL: true,
        name: true,
        startDate: true,
        endDate: true,
        locationUid: true,
        logo: { select: { url: true } },
      },
      orderBy: [{ startDate: 'asc' }],
    });

    this.logger.log(`[IRL push job] Loaded events for payload: ${events.length}`);

    // Candidate attendeeCount is authoritative (already computed by refreshCandidatesForEvents).
    const attendeeCountByEventUid = new Map<string, number>();
    for (const c of groupCandidates) {
      attendeeCountByEventUid.set(c.eventUid, c.attendeeCount);
    }

    const eventSummaries: EventSummary[] = events.map((ev) => ({
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

    // Unique attendee count across all events (not a sum).
    const distinctAttendees = await this.prisma.pLEventGuest.findMany({
      where: { eventUid: { in: eventUids } },
      distinct: ['memberUid'],
      select: { memberUid: true },
    });
    const uniqueAttendeeCount = distinctAttendees.length;

    // Top attendees = members who attend most events in this location group.
    const top = await this.prisma.pLEventGuest.groupBy({
      by: ['memberUid'],
      where: {
        eventUid: { in: eventUids },
      },
      _count: {
        eventUid: true, // count rows via a concrete field
      },
      orderBy: {
        _count: {
          eventUid: 'desc',
        },
      },
      take: 6,
    });

    const topMemberUids = top.map((t) => t.memberUid);

    const topMembers = topMemberUids.length
      ? await this.prisma.member.findMany({
        where: { uid: { in: topMemberUids } },
        select: {
          uid: true,
          name: true,
          image: { select: { url: true } },
        },
      })
      : [];

    const memberByUid = new Map(topMembers.map((m) => [m.uid, m]));

    const topAttendees: TopAttendee[] = top.map((row) => {
      const m = memberByUid.get(row.memberUid);
      return {
        memberUid: row.memberUid,
        eventsCount: row._count.eventUid,
        imageUrl: m?.image?.url ?? null,
        displayName: m?.name ?? null,
      };
    });

    this.logger.log(
      `[IRL push job] Payload computed: uniqueAttendees=${uniqueAttendeeCount}, topAttendees=${topAttendees.length}`
    );

    if (topAttendees.length > 0) {
      this.logger.log(
        `[IRL push job] Top attendees: ${topAttendees.map((t) => `${t.memberUid}:${t.eventsCount}`).join(', ')}`
      );
    }

    return {
      version: this.payloadVersion,
      ruleKind,
      gatheringUid,
      location: locationInfo
        ? {
          id: locationInfo.uid,
          name: locationInfo.location,
          country: locationInfo.country,
          timezone: locationInfo.timezone,
          latitude: locationInfo.latitude,
          longitude: locationInfo.longitude,
          flag: locationInfo.flag,
          icon: locationInfo.icon,
        }
        : null,
      events: {
        total: eventSummaries.length,
        eventUids,
        dates: {
          start: dateStart,
          end: dateEnd,
        },
        items: eventSummaries,
      },
      attendees: {
        total: uniqueAttendeeCount,
        topAttendees,
      },
      // Future-proof: allow UI to render more contextual UX.
      ui: {
        // For example: route to IRL location page.
        // UI can derive final route based on its own routing rules.
        locationUid: gatheringUid,
        eventSlugs: eventSummaries.map((e) => e.slug),
      },
    };
  }
}
