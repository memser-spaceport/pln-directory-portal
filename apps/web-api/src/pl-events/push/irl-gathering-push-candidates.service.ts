import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { IrlGatheringPushRuleKind, PushNotificationCategory } from '@prisma/client';
import { IrlGatheringPushConfigService } from './irl-gathering-push-config.service';


type ActiveDbConfig = {
  uid: string;
  enabled: boolean;
  upcomingWindowDays: number;
  reminderDaysBefore: number;
  minAttendeesPerEvent: number;
};

type TopAttendee = {
  memberUid: string;
  imageUrl?: string | null;
  displayName?: string | null;
  eventsCount: number;
};

@Injectable()
export class IrlGatheringPushCandidatesService {
  private readonly logger = new Logger(IrlGatheringPushCandidatesService.name);

  /**
   * Must match payload version in IrlGatheringPushNotificationsProcessor.
   * Used to locate already-existing notifications to refresh.
   */
  private readonly payloadVersion = 1;

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
   * attendeeCount:
   * - counts DISTINCT members for the event
   * - excludes members with accessLevel in ['L0','L1','Rejected']
   *
   * Idempotency:
   * - Uses upsert on (ruleKind, eventUid), so it never creates duplicates.
   * - If no longer qualifies, deletes both UPCOMING and REMINDER rows for that event.
   */
  async refreshCandidatesForEvents(eventUids: string[]): Promise<void> {
    const inputCount = Array.isArray(eventUids) ? eventUids.length : 0;
    const uniqueEventUids = [...new Set((eventUids ?? []).filter(Boolean))];

    this.logger.log(
      `[candidates] refreshCandidatesForEvents() called; inputCount=${inputCount} uniqueCount=${uniqueEventUids.length}`
    );

    if (uniqueEventUids.length === 0) {
      this.logger.log('[candidates] no eventUids after normalization -> nothing to do');
      return;
    }

    const cfg = (await this.configService.getActiveConfigOrNull()) as ActiveDbConfig | null;
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

    const events = await this.prisma.pLEvent.findMany({
      where: { uid: { in: uniqueEventUids }, isDeleted: false },
      select: { uid: true, startDate: true, endDate: true, locationUid: true },
    });

    // attendee counts: distinct members, excluding L0/L1/Rejected
    const counts = await this.prisma.$queryRaw<
      Array<{ eventUid: string; cnt: bigint }>
    >`
      select
        g."eventUid" as "eventUid",
        count(distinct g."memberUid") as cnt
      from "PLEventGuest" g
      join "Member" m on m.uid = g."memberUid"
      where g."eventUid" = any(${uniqueEventUids}::text[])
        and m."accessLevel" not in ('L0','L1','Rejected')
      group by g."eventUid";
    `;

    const countByEventUid = new Map<string, number>();
    for (const r of counts) countByEventUid.set(r.eventUid, Number(r.cnt ?? 0n));

    const upserts: Promise<any>[] = [];
    const deletes: Promise<any>[] = [];

    for (const ev of events) {
      const attendeeCount = countByEventUid.get(ev.uid) ?? 0;

      const hasGathering = Boolean(ev.locationUid);
      const startDate = ev.startDate ? new Date(ev.startDate) : null;
      const endDate = ev.endDate ? new Date(ev.endDate) : null;

      // Use endDate to include in-progress events.
      const notEnded = !!endDate && endDate.getTime() >= now.getTime();
      const withinUpcomingWindow = !!endDate && endDate.getTime() <= windowEnd.getTime();
      const meetsThreshold = attendeeCount >= cfg.minAttendeesPerEvent;

      const qualifiesUpcoming = hasGathering && notEnded && withinUpcomingWindow && meetsThreshold;

      // REMINDER candidates only for events that haven't started yet
      const notStartedYet = !!startDate && startDate.getTime() > now.getTime();
      const qualifiesReminder = qualifiesUpcoming && notStartedYet;

      if (qualifiesUpcoming) {
        upserts.push(
          this.prisma.irlGatheringPushCandidate.upsert({
            where: {
              ruleKind_eventUid: { ruleKind: IrlGatheringPushRuleKind.UPCOMING, eventUid: ev.uid },
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

        if (qualifiesReminder) {
          upserts.push(
            this.prisma.irlGatheringPushCandidate.upsert({
              where: {
                ruleKind_eventUid: { ruleKind: IrlGatheringPushRuleKind.REMINDER, eventUid: ev.uid },
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
              where: { ruleKind: IrlGatheringPushRuleKind.REMINDER, eventUid: ev.uid },
            })
          );
        }
      } else {
        deletes.push(
          this.prisma.irlGatheringPushCandidate.deleteMany({
            where: {
              ruleKind: { in: [IrlGatheringPushRuleKind.UPCOMING, IrlGatheringPushRuleKind.REMINDER] },
              eventUid: ev.uid,
            },
          })
        );
      }
    }

    this.logger.log(`[candidates] executing DB writes; upserts=${upserts.length}, deletes=${deletes.length}`);
    await Promise.all([...upserts, ...deletes]);
  }

  /**
   * Convenience wrapper used by write-paths (adding/removing guests attached to events).
   *
   * IMPORTANT:
   * - This does NOT create new push notifications.
   * - It only refreshes candidates + updates already-existing IRL_GATHERING pushes (if they exist).
   * - We DO NOT bump createdAt/sentAt and DO NOT reset read statuses here.
   */
  async refreshCandidatesForEventsAndUpdateNotifications(eventUids: string[]): Promise<void> {
    await this.refreshCandidatesForEvents(eventUids);
    await this.updateAlreadySentNotificationsForEvents(eventUids);
  }

  /**
   * When a guest is created/updated/deleted at a location WITHOUT eventUid (location-level attendee),
   * we still need to update attendee counters for already-sent IRL_GATHERING pushes for this location.
   *
   * IMPORTANT:
   * - Does NOT create any new notifications.
   * - Does NOT bump createdAt/sentAt.
   * - Does NOT reset read statuses.
   */
  async refreshNotificationsForLocation(locationUid: string): Promise<void> {
    await this.updateAlreadySentNotificationsForLocation(locationUid);
  }

  private async updateAlreadySentNotificationsForEvents(eventUids: string[]): Promise<void> {
    const uniqueEventUids = [...new Set((eventUids ?? []).filter(Boolean))];
    if (uniqueEventUids.length === 0) return;

    const cfg = (await this.configService.getActiveConfigOrNull()) as ActiveDbConfig | null;
    if (!cfg || !cfg.enabled) return;

    const events = await this.prisma.pLEvent.findMany({
      where: { uid: { in: uniqueEventUids }, isDeleted: false },
      select: { locationUid: true },
    });

    const locationUids = [...new Set(events.map((e) => e.locationUid).filter(Boolean))] as string[];
    for (const locationUid of locationUids) {
      await this.updateAlreadySentNotificationsForLocation(locationUid);
    }
  }

  /**
   * Rebuilds payload for already-sent IRL_GATHERING notifications for a location.
   * Used by:
   * - guests added/removed for events (via impacted location list)
   * - guests added/removed with eventUid=null (location-only)
   */
  private async updateAlreadySentNotificationsForLocation(locationUid: string): Promise<void> {
    const cfg = (await this.configService.getActiveConfigOrNull()) as ActiveDbConfig | null;
    if (!cfg || !cfg.enabled) return;

    // Find all already-existing pushes for this location (any ruleKind), versioned.
    const pushes = await this.prisma.pushNotification.findMany({
      where: {
        category: PushNotificationCategory.IRL_GATHERING,
        AND: [
          { metadata: { path: ['gatheringUid'], equals: locationUid } },
          { metadata: { path: ['version'], equals: this.payloadVersion } },
        ],
      },
      select: { uid: true, metadata: true },
    });

    if (pushes.length === 0) {
      // IMPORTANT: do nothing. We never create new notifications from “refresh”.
      return;
    }

    for (const p of pushes) {
      const ruleKind = (p.metadata as any)?.ruleKind as IrlGatheringPushRuleKind | undefined;
      if (!ruleKind) continue;

      const payload = await this.buildLocationPayload(cfg, ruleKind, locationUid);
      if (!payload || !payload.events?.eventUids?.length) continue;

      // Keep title/description in sync, but do NOT bump createdAt/sentAt and do NOT clear read statuses.
      const title =
        ruleKind === IrlGatheringPushRuleKind.REMINDER
          ? `Reminder: IRL Gathering in ${payload.location?.name ?? payload.location?.id ?? 'this location'}`
          : payload.location?.name
            ? `IRL gathering in ${payload.location.name}`
            : 'IRL gathering';

      const description =
        ruleKind === IrlGatheringPushRuleKind.REMINDER
          ? (() => {
              const startIso = payload?.events?.dates?.start ?? null;
              const days = this.daysUntil(startIso);
              return `Reminder: IRL Gathering in ${payload.location?.name ?? payload.location?.id ?? 'this location'} starts in ${this.humanDays(days)}.`;
            })()
          : payload.location?.description && String(payload.location.description).trim().length > 0
            ? String(payload.location.description).trim()
            : payload.events?.total != null
              ? `${payload.events.total} upcoming event(s) • ${payload.attendees.total} attendee(s)`
              : 'Upcoming IRL gathering';

      await this.prisma.pushNotification.update({
        where: { uid: p.uid },
        data: {
          title,
          description,
          metadata: payload as any,
        },
      });

      this.logger.log(
        `[candidates] refreshed existing pushNotification uid=${p.uid} locationUid=${locationUid} ruleKind=${ruleKind} attendeesTotal=${payload.attendees?.total}`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Payload helpers (match IRL Gatherings page attendees logic)
  // ---------------------------------------------------------------------------

  private normalizeResources(raw: any): any[] {
    if (!raw) return [];

    const tryParse = (v: any) => {
      if (typeof v !== 'string') return v;
      const s = v.trim();
      if (!s) return null;
      try {
        return JSON.parse(s);
      } catch {
        return { raw: s };
      }
    };

    if (Array.isArray(raw)) {
      const out: any[] = [];
      for (const item of raw) {
        const p1 = tryParse(item);
        if (p1 == null) continue;

        // unwrap one extra layer if needed
        if (typeof p1 === 'string') {
          const p2 = tryParse(p1);
          if (p2 != null) out.push(p2);
          continue;
        }

        out.push(p1);
      }
      return out;
    }

    if (typeof raw === 'string') {
      const p = tryParse(raw);
      if (p == null) return [];
      return Array.isArray(p) ? p : [p];
    }

    return [raw];
  }

  private parseYmd(v: any): Date | null {
    if (!v || typeof v !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo, d));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  private overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
    return aStart.getTime() <= bEnd.getTime() && aEnd.getTime() >= bStart.getTime();
  }

  private daysUntil(startIso: string | null | undefined): number | null {
    if (!startIso) return null;
    const start = new Date(startIso);
    if (Number.isNaN(start.getTime())) return null;
    const diffMs = start.getTime() - new Date().getTime();
    return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  }

  private humanDays(days: number | null): string {
    if (days == null) return 'soon';
    if (days === 0) return 'today';
    if (days === 1) return '1 day';
    return `${days} days`;
  }

  /**
   * Builds payload for FE modal:
   * - includes location resources (twitter/telegram/etc)
   * - includes event resources
   * - attendees.total matches IRL Gatherings page logic:
   *   distinct members across selected events + location-only guests overlapping the events window
   *
   * IMPORTANT:
   * - Event list is derived from the LOCATION + ruleKind window (not from candidates table),
   *   so payload stays consistent with the location page.
   */
  private async buildLocationPayload(cfg: ActiveDbConfig, ruleKind: IrlGatheringPushRuleKind, locationUid: string): Promise<any> {
    const now = new Date();
    const msInDay = 24 * 60 * 60 * 1000;

    const endUpcoming = new Date(now.getTime() + cfg.upcomingWindowDays * msInDay);
    const endReminder = new Date(now.getTime() + cfg.reminderDaysBefore * msInDay);

    const eventWhere =
      ruleKind === IrlGatheringPushRuleKind.REMINDER
        ? { isDeleted: false, locationUid, startDate: { gte: now, lte: endReminder } }
        : { isDeleted: false, locationUid, endDate: { gte: now, lte: endUpcoming } };

    const events = await this.prisma.pLEvent.findMany({
      where: eventWhere as any,
      select: {
        uid: true,
        slugURL: true,
        name: true,
        startDate: true,
        endDate: true,
        websiteURL: true,
        telegramId: true,
        resources: true,
        logo: { select: { url: true } },
      },
      orderBy: [{ startDate: 'asc' }],
    });

    const eventUids = events.map((e) => e.uid);
    if (eventUids.length === 0) return null;

    const location = await this.prisma.pLEventLocation.findUnique({
      where: { uid: locationUid },
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
        resources: true,
      },
    });

    // per-event attendee counts (distinct members; excludes L0/L1/Rejected)
    const perEvent = await this.prisma.$queryRaw<Array<{ eventUid: string; cnt: bigint }>>`
      select
        g."eventUid" as "eventUid",
        count(distinct g."memberUid") as cnt
      from "PLEventGuest" g
      join "Member" m on m.uid = g."memberUid"
      where g."eventUid" = any(${eventUids}::text[])
        and m."accessLevel" not in ('L0','L1','Rejected')
      group by g."eventUid";
    `;
    const perEventMap = new Map(perEvent.map((r) => [r.eventUid, Number(r.cnt ?? 0n)]));

    const eventSummaries = events.map((ev) => ({
      uid: ev.uid,
      slug: ev.slugURL,
      name: ev.name,
      startDate: ev.startDate.toISOString(),
      endDate: ev.endDate.toISOString(),
      attendeeCount: perEventMap.get(ev.uid) ?? 0,
      logoUrl: ev.logo?.url ?? null,
      websiteURL: (ev as any).websiteURL ?? null,
      telegramId: (ev as any).telegramId ?? null,
      resources: this.normalizeResources((ev as any).resources),
    }));

    const dateStart = eventSummaries.length ? eventSummaries[0].startDate : null;
    const dateEnd = eventSummaries.length ? eventSummaries[eventSummaries.length - 1].endDate : null;

    const windowStart = dateStart ? new Date(dateStart) : null;
    const windowEnd = dateEnd ? new Date(dateEnd) : null;

    // distinct attendees across events
    const distinctEventAttendees = await this.prisma.$queryRaw<Array<{ memberUid: string }>>`
      select distinct g."memberUid" as "memberUid"
      from "PLEventGuest" g
      join "Member" m on m.uid = g."memberUid"
      where g."eventUid" = any(${eventUids}::text[])
        and m."accessLevel" not in ('L0','L1','Rejected');
    `;
    const eventAttendeeUids = new Set(distinctEventAttendees.map((r) => r.memberUid));

    // location-only guests (eventUid=null) that overlap the events window (or included if dates missing)
    const locationOnly = await this.prisma.pLEventGuest.findMany({
      where: { locationUid, eventUid: null },
      select: { memberUid: true, additionalInfo: true },
    });

    const locationOnlyUids = new Set<string>();
    for (const g of locationOnly) {
      // filter out blocked access levels
      const m = await this.prisma.member.findUnique({ where: { uid: g.memberUid }, select: { accessLevel: true } });
      if (!m || ['L0','L1','Rejected'].includes(String(m.accessLevel))) continue;

      if (!windowStart || !windowEnd) {
        locationOnlyUids.add(g.memberUid);
        continue;
      }

      const ai: any = g.additionalInfo ?? {};
      const ci = this.parseYmd(ai?.checkInDate);
      const co = this.parseYmd(ai?.checkOutDate);

      // If we cannot parse -> include (best effort)
      if (!ci && !co) {
        locationOnlyUids.add(g.memberUid);
        continue;
      }

      const gStart = ci ?? (co as Date);
      const gEnd = co ?? (ci as Date);

      if (this.overlaps(gStart, gEnd, windowStart, windowEnd)) locationOnlyUids.add(g.memberUid);
    }

    const allUids = new Set<string>(eventAttendeeUids);
    for (const uid of locationOnlyUids) allUids.add(uid);

    const uniqueAttendeeCount = allUids.size;

    // Top attendees: count distinct events per member + (+1 if location-only overlap)
    const topEventCounts = await this.prisma.$queryRaw<Array<{ memberUid: string; cnt: bigint }>>`
      select
        g."memberUid" as "memberUid",
        count(distinct g."eventUid") as cnt
      from "PLEventGuest" g
      join "Member" m on m.uid = g."memberUid"
      where g."eventUid" = any(${eventUids}::text[])
        and m."accessLevel" not in ('L0','L1','Rejected')
      group by g."memberUid"
      order by cnt desc
      limit 50;
    `;

    const countsByMember = new Map<string, number>();
    for (const r of topEventCounts) countsByMember.set(r.memberUid, Number(r.cnt ?? 0n));
    for (const uid of locationOnlyUids) countsByMember.set(uid, (countsByMember.get(uid) ?? 0) + 1);

    const topCombined = [...countsByMember.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([memberUid, eventsCount]) => ({ memberUid, eventsCount }));

    const topMemberUids = topCombined.map((t) => t.memberUid);
    const topMembers = topMemberUids.length
      ? await this.prisma.member.findMany({
          where: { uid: { in: topMemberUids } },
          select: { uid: true, name: true, image: { select: { url: true } } },
        })
      : [];

    const memberByUid = new Map(topMembers.map((m) => [m.uid, m]));
    const topAttendees: TopAttendee[] = topCombined.map((row) => {
      const mm = memberByUid.get(row.memberUid);
      return {
        memberUid: row.memberUid,
        eventsCount: row.eventsCount,
        imageUrl: mm?.image?.url ?? null,
        displayName: mm?.name ?? null,
      };
    });

    return {
      version: this.payloadVersion,
      ruleKind,
      gatheringUid: locationUid,
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
            resources: this.normalizeResources((location as any).resources),
          }
        : null,
      events: {
        total: eventSummaries.length,
        eventUids,
        dates: { start: dateStart, end: dateEnd },
        items: eventSummaries,
      },
      attendees: {
        total: uniqueAttendeeCount,
        topAttendees,
      },
      ui: {
        locationUid,
        eventSlugs: eventSummaries.map((e) => e.slug),
      },
    };
  }
}
