import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { PushNotificationsService } from '../../push-notifications/push-notifications.service';
import { IrlGatheringPushRuleKind, PushNotificationCategory } from '@prisma/client';
import { IrlGatheringPushConfigService } from './irl-gathering-push-config.service';
import { IrlGatheringPushCandidatesService } from './irl-gathering-push-candidates.service';

export type IrlPushTriggerResult =
  | {
      ok: true;
      action: 'created' | 'updated';
      pushUid: string;
      ruleKind: IrlGatheringPushRuleKind;
      locationUid: string;
      payloadVersion: number;
      candidates: { total: number; processed: number };
      events: { total: number; eventUids: string[]; dates: { start: string | null; end: string | null } };
      attendees: { total: number; topAttendees: number };
      updatedAt: string;
    }
  | {
      ok: false;
      action: 'skipped';
      reason:
        | 'no_active_config'
        | 'config_disabled'
        | 'no_events_in_window'
        | 'no_candidates'
        | 'window_miss'
        | 'thresholds_not_met';
      ruleKind: IrlGatheringPushRuleKind;
      locationUid: string;
      details?: any;
    };

type ActiveDbConfig = {
  uid: string;
  enabled: boolean;
  upcomingWindowDays: number;
  reminderDaysBefore: number;
  minAttendeesPerEvent: number;
  totalEventsThreshold: number;
  qualifiedEventsThreshold: number;
  isActive: boolean;
};

type TopAttendee = {
  memberUid: string;
  imageUrl?: string | null;
  displayName?: string | null;
  eventsCount: number;
};

type ProcessGroupOptions = {
  bypassGating?: boolean;
  source: 'job' | 'admin';
};

@Injectable()
export class IrlGatheringPushNotificationsProcessor {
  private readonly logger = new Logger(IrlGatheringPushNotificationsProcessor.name);

  /**
   * Increment this when you change the metadata payload shape.
   * Used for deduplication and safe updates.
   */
  private readonly payloadVersion = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotificationsService: PushNotificationsService,
    private readonly configService: IrlGatheringPushConfigService,
    private readonly candidatesService: IrlGatheringPushCandidatesService
  ) {}

  /**
   * Scheduled/automatic processing path:
   * - Loads all unprocessed candidates
   * - Groups them by (ruleKind, gatheringUid)
   * - Applies window checks + thresholds
   * - Creates/updates a single push per group
   * - Marks candidates as processed when a group is handled
   */
  async processUnprocessedCandidates(): Promise<void> {
    const cfg = (await this.configService.getActiveConfigOrNull()) as ActiveDbConfig | null;
    if (!cfg) return;
    if (!cfg.enabled) return;

    const candidates = await this.prisma.irlGatheringPushCandidate.findMany({
      where: { processedAt: null, isSuppressed: false },
      orderBy: [{ eventStartDate: 'asc' }],
      select: {
        uid: true,
        ruleKind: true,
        gatheringUid: true,
        eventUid: true,
        eventStartDate: true,
        eventEndDate: true,
        attendeeCount: true,
      },
    });

    await this.processCandidates(cfg, candidates, { markProcessed: true });
  }

  /**
   * Manual trigger path (admin/back-office):
   * - Recomputes candidates for the location's events (fresh attendee counts)
   * - Then sends/updates a push ONLY for the given (locationUid, ruleKind)
   *
   * Admin trigger bypasses window & thresholds gating: if candidates exist -> we create/update.
   */
  async triggerManual(params: { locationUid: string; kind: IrlGatheringPushRuleKind }): Promise<IrlPushTriggerResult> {
    const cfg = (await this.configService.getActiveConfigOrNull()) as ActiveDbConfig | null;

    if (!cfg) {
      return { ok: false, action: 'skipped', reason: 'no_active_config', ruleKind: params.kind, locationUid: params.locationUid };
    }
    if (!cfg.enabled) {
      return { ok: false, action: 'skipped', reason: 'config_disabled', ruleKind: params.kind, locationUid: params.locationUid };
    }

    const now = new Date();
    const msInDay = 24 * 60 * 60 * 1000;
    const windowEnd = new Date(now.getTime() + cfg.upcomingWindowDays * msInDay);

    const events = await this.prisma.pLEvent.findMany({
      where: { isDeleted: false, locationUid: params.locationUid, endDate: { gte: now, lte: windowEnd } },
      select: { uid: true },
    });

    if (!events.length) {
      return { ok: false, action: 'skipped', reason: 'no_events_in_window', ruleKind: params.kind, locationUid: params.locationUid };
    }

    await this.candidatesService.refreshCandidatesForEvents(events.map((e) => e.uid));

    const candidates = await this.prisma.irlGatheringPushCandidate.findMany({
      where: { isSuppressed: false, gatheringUid: params.locationUid, ruleKind: params.kind, processedAt: null },
      orderBy: [{ eventStartDate: 'asc' }],
      select: { uid: true, eventUid: true, eventStartDate: true, eventEndDate: true, attendeeCount: true },
    });

    if (!candidates.length) {
      return { ok: false, action: 'skipped', reason: 'no_candidates', ruleKind: params.kind, locationUid: params.locationUid };
    }

    return await this.processSingleGroup(cfg, params.kind, params.locationUid, candidates, {
      bypassGating: true,
      source: 'admin',
    });
  }

  // ---------------------------------------------------------------------------
  // CORE
  // ---------------------------------------------------------------------------

  private async processCandidates(
    cfg: ActiveDbConfig,
    candidates: Array<{
      uid: string;
      ruleKind: IrlGatheringPushRuleKind;
      gatheringUid: string;
      eventUid: string;
      eventStartDate: Date;
      eventEndDate: Date;
      attendeeCount: number;
    }>,
    opts: { markProcessed: boolean }
  ) {
    if (!candidates.length) return;

    const now = new Date();

    const groups = new Map<string, typeof candidates>();
    for (const c of candidates) {
      const key = `${c.ruleKind}::${c.gatheringUid}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
    }

    for (const [groupKey, groupCandidates] of groups.entries()) {
      const [ruleKindRaw, gatheringUid] = groupKey.split('::');
      const ruleKind = ruleKindRaw as IrlGatheringPushRuleKind;

      const windowOk = this.matchesWindow(
        ruleKind,
        groupCandidates.map((c) => c.eventStartDate),
        groupCandidates.map((c) => c.eventEndDate),
        now,
        cfg
      );

      if (!windowOk) {
        if (opts.markProcessed) await this.markCandidatesProcessed(groupCandidates.map((c) => c.uid));
        continue;
      }

      const msInDay = 24 * 60 * 60 * 1000;
      const windowEnd = new Date(now.getTime() + cfg.upcomingWindowDays * msInDay);

      const totalEventsInWindow = await this.prisma.pLEvent.count({
        where: { isDeleted: false, locationUid: gatheringUid, endDate: { gte: now, lte: windowEnd } },
      });

      const qualifiedEventsInWindow = new Set(groupCandidates.map((c) => c.eventUid)).size;

      if (totalEventsInWindow < cfg.totalEventsThreshold || qualifiedEventsInWindow < cfg.qualifiedEventsThreshold) {
        // Do NOT mark candidates processed so the group can become eligible later.
        continue;
      }

      await this.processSingleGroup(cfg, ruleKind, gatheringUid, groupCandidates, { source: 'job' });

      if (opts.markProcessed) await this.markCandidatesProcessed(groupCandidates.map((c) => c.uid));
    }
  }

  /**
   * Determines whether a candidate group is eligible based on time windows:
   * - UPCOMING: earliest end date must fall within [now..now+upcomingWindowDays]
   * - REMINDER: earliest start date must fall within [now..now+reminderDaysBefore]
   */
  private matchesWindow(
    ruleKind: IrlGatheringPushRuleKind,
    startDates: Date[],
    endDates: Date[],
    now: Date,
    cfg: Pick<ActiveDbConfig, 'upcomingWindowDays' | 'reminderDaysBefore'>
  ): boolean {
    const msInDay = 24 * 60 * 60 * 1000;

    const earliestStart = startDates
      .filter(Boolean)
      .map((d) => new Date(d))
      .sort((a, b) => a.getTime() - b.getTime())[0];

    const earliestEnd = endDates
      .filter(Boolean)
      .map((d) => new Date(d))
      .sort((a, b) => a.getTime() - b.getTime())[0];

    if (!earliestStart && !earliestEnd) return false;

    if (ruleKind === IrlGatheringPushRuleKind.UPCOMING) {
      const windowEnd = new Date(now.getTime() + cfg.upcomingWindowDays * msInDay);
      if (!earliestEnd) return false;
      return earliestEnd.getTime() >= now.getTime() && earliestEnd.getTime() <= windowEnd.getTime();
    }

    if (ruleKind === IrlGatheringPushRuleKind.REMINDER) {
      const reminderEnd = new Date(now.getTime() + cfg.reminderDaysBefore * msInDay);
      if (!earliestStart) return false;
      return earliestStart.getTime() >= now.getTime() && earliestStart.getTime() <= reminderEnd.getTime();
    }

    return false;
  }

  private async markCandidatesProcessed(candidateUids: string[]): Promise<void> {
    if (!candidateUids?.length) return;

    await this.prisma.irlGatheringPushCandidate.updateMany({
      where: { uid: { in: candidateUids } },
      data: { processedAt: new Date() },
    });
  }

  // ---------------------------------------------------------------------------
  // Resources normalization (no double parsing in FE)
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


  private formatOrdinalDate(dateIso: string | null | undefined): string {
    if (!dateIso) return 'soon';
    const d = new Date(dateIso);
    if (Number.isNaN(d.getTime())) return 'soon';

    // Use UTC to keep it stable regardless of server timezone.
    const day = d.getUTCDate();
    const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });

    const mod10 = day % 10;
    const mod100 = day % 100;
    const suffix =
      mod100 >= 11 && mod100 <= 13 ? 'th' : mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th';

    return `${day}${suffix} ${month}`;
  }

  private buildTitleAndDescription(ruleKind: IrlGatheringPushRuleKind, payload: any): { title: string; description: string } {
    const locationName = payload?.location?.name ?? payload?.location?.id ?? 'this location';

    // Description is ALWAYS location.description (if present) else the default fallback (same for Announcement + Reminder).
    const description =
      payload?.location?.description && String(payload.location.description).trim().length > 0
        ? String(payload.location.description).trim()
        : payload?.events?.total != null
          ? `${payload.events.total} upcoming event(s) • ${payload.attendees?.total ?? 0} attendee(s)`
          : 'Upcoming IRL gathering';

    if (ruleKind === IrlGatheringPushRuleKind.REMINDER) {
      const earliestStartIso: string | null | undefined = payload?.events?.dates?.start ?? null;
      const days = this.daysUntil(earliestStartIso);

      const daysText =
        days == null ? 'soon' : `${days} day${days === 1 ? '' : 's'}`;

      return {
        title: `Reminder: IRL Gathering in ${locationName} starts in ${daysText}.`,
        description,
      };
    }

    // Announcement (UPCOMING)
    const totalEvents = Number(payload?.events?.total ?? 0);
    const eventWord = totalEvents === 1 ? 'event' : 'events';
    const startDateText = this.formatOrdinalDate(payload?.events?.dates?.start ?? null);

    return {
      title: `${totalEvents} ${eventWord} happening in ${locationName} starting ${startDateText}`,
      description,
    };
  }


  // ---------------------------------------------------------------------------
  // Payload (must match IRL Gatherings page counts)
  // ---------------------------------------------------------------------------

  private async buildLocationPayload(cfg: ActiveDbConfig, ruleKind: IrlGatheringPushRuleKind, locationUid: string): Promise<any | null> {
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
    if (!eventUids.length) return null;

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

    const items = events.map((ev) => ({
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

    const dateStart = items.length ? items[0].startDate : null;
    const dateEnd = items.length ? items[items.length - 1].endDate : null;

    const windowStart = dateStart ? new Date(dateStart) : null;
    const windowEnd = dateEnd ? new Date(dateEnd) : null;

    const eventDistinct = await this.prisma.$queryRaw<Array<{ memberUid: string }>>`
      select distinct g."memberUid" as "memberUid"
      from "PLEventGuest" g
      join "Member" m on m.uid = g."memberUid"
      where g."eventUid" = any(${eventUids}::text[])
        and m."accessLevel" not in ('L0','L1','Rejected');
    `;
    const all = new Set<string>(eventDistinct.map((r) => r.memberUid));

    const locationOnly = await this.prisma.pLEventGuest.findMany({
      where: { locationUid, eventUid: null },
      select: { memberUid: true, additionalInfo: true },
    });

    const locationOnlyUids = new Set<string>();
    if (windowStart && windowEnd) {
      for (const g of locationOnly) {
        const mm = await this.prisma.member.findUnique({ where: { uid: g.memberUid }, select: { accessLevel: true } });
        if (!mm || ['L0','L1','Rejected'].includes(String(mm.accessLevel))) continue;

        const ai: any = g.additionalInfo ?? {};
        const ci = this.parseYmd(ai?.checkInDate);
        const co = this.parseYmd(ai?.checkOutDate);

        if (!ci && !co) {
          locationOnlyUids.add(g.memberUid);
          continue;
        }

        const gStart = ci ?? (co as Date);
        const gEnd = co ?? (ci as Date);
        if (this.overlaps(gStart, gEnd, windowStart, windowEnd)) locationOnlyUids.add(g.memberUid);
      }
    } else {
      for (const g of locationOnly) locationOnlyUids.add(g.memberUid);
    }

    for (const uid of locationOnlyUids) all.add(uid);

    // top attendees
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
        total: items.length,
        eventUids,
        dates: { start: dateStart, end: dateEnd },
        items,
      },
      attendees: {
        total: all.size,
        topAttendees,
      },
      ui: {
        locationUid,
        eventSlugs: items.map((e) => e.slug),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Push create/update (UPSERT semantics at notification level)
  // ---------------------------------------------------------------------------

  private async processSingleGroup(
    cfg: ActiveDbConfig,
    ruleKind: IrlGatheringPushRuleKind,
    gatheringUid: string,
    groupCandidates: Array<{
      uid: string;
      eventUid: string;
      eventStartDate: Date;
      eventEndDate: Date;
      attendeeCount: number;
    }>,
    opts: ProcessGroupOptions
  ): Promise<IrlPushTriggerResult> {
    const now = new Date();

    if (!opts.bypassGating) {
      const windowOk = this.matchesWindow(
        ruleKind,
        groupCandidates.map((c) => c.eventStartDate),
        groupCandidates.map((c) => c.eventEndDate),
        now,
        cfg
      );

      if (!windowOk) {
        await this.markCandidatesProcessed(groupCandidates.map((c) => c.uid));
        return { ok: false, action: 'skipped', reason: 'window_miss', ruleKind, locationUid: gatheringUid };
      }

      const msInDay = 24 * 60 * 60 * 1000;
      const windowEnd = new Date(now.getTime() + cfg.upcomingWindowDays * msInDay);

      const totalEventsInWindow = await this.prisma.pLEvent.count({
        where: { isDeleted: false, locationUid: gatheringUid, endDate: { gte: now, lte: windowEnd } },
      });

      const qualifiedEventsInWindow = new Set(groupCandidates.map((c) => c.eventUid)).size;

      if (totalEventsInWindow < cfg.totalEventsThreshold || qualifiedEventsInWindow < cfg.qualifiedEventsThreshold) {
        return {
          ok: false,
          action: 'skipped',
          reason: 'thresholds_not_met',
          ruleKind,
          locationUid: gatheringUid,
        };
      }
    }

    const alreadySent = await this.prisma.pushNotification.findFirst({
      where: {
        category: PushNotificationCategory.IRL_GATHERING,
        AND: [
          { metadata: { path: ['ruleKind'], equals: ruleKind } },
          { metadata: { path: ['gatheringUid'], equals: gatheringUid } },
          { metadata: { path: ['version'], equals: this.payloadVersion } },
        ],
      },
      select: { id: true, uid: true },
    });

    const payload = await this.buildLocationPayload(cfg, ruleKind, gatheringUid);
    if (!payload) {
      // no events -> skip but still mark candidates as processed to avoid infinite loop
      await this.markCandidatesProcessed(groupCandidates.map((c) => c.uid));
      return { ok: false, action: 'skipped', reason: 'no_events_in_window', ruleKind, locationUid: gatheringUid };
    }

    const { title, description } = this.buildTitleAndDescription(ruleKind, payload);

    let pushUid: string;
    let action: 'created' | 'updated';

    if (alreadySent) {
      action = 'updated';
      pushUid = alreadySent.uid;

      const bumpForAdmin = opts.source === 'admin';

      if (bumpForAdmin) {
        // Admin explicitly re-triggers => bubble to top and mark unread again
        await this.prisma.pushNotificationReadStatus.deleteMany({ where: { notificationId: alreadySent.id } });
      }

      await this.prisma.pushNotification.update({
        where: { uid: alreadySent.uid },
        data: {
          title,
          description,
          metadata: payload as any,
          ...(bumpForAdmin
            ? {
                createdAt: new Date(),
                sentAt: new Date(),
                isSent: true,
                isRead: false,
              }
            : {}),
        },
      });
    } else {
      action = 'created';
      const created = await this.pushNotificationsService.create({
        category: PushNotificationCategory.IRL_GATHERING,
        title,
        description,
        metadata: payload,
        isPublic: true,
      });
      pushUid = created.uid;
    }

    await this.markCandidatesProcessed(groupCandidates.map((c) => c.uid));

    return {
      ok: true,
      action,
      pushUid,
      ruleKind,
      locationUid: gatheringUid,
      payloadVersion: this.payloadVersion,
      candidates: { total: groupCandidates.length, processed: groupCandidates.length },
      events: {
        total: payload.events?.total ?? 0,
        eventUids: payload.events?.eventUids ?? [],
        dates: { start: payload.events?.dates?.start ?? null, end: payload.events?.dates?.end ?? null },
      },
      attendees: {
        total: payload.attendees?.total ?? 0,
        topAttendees: payload.attendees?.topAttendees?.length ?? 0,
      },
      updatedAt: new Date().toISOString(),
    };
  }
}
