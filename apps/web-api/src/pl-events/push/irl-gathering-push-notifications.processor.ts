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

type LocationInfo = {
  uid: string;
  location: string;
  description?: string | null;
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

  async triggerManual(params: { locationUid: string; kind: IrlGatheringPushRuleKind }): Promise<IrlPushTriggerResult> {
    const cfg = (await this.configService.getActiveConfigOrNull()) as ActiveDbConfig | null;

    if (!cfg) {
      this.logDecision('trigger skipped (no_active_config)', {
        source: 'admin',
        ruleKind: params.kind,
        locationUid: params.locationUid,
      });

      return {
        ok: false,
        action: 'skipped',
        reason: 'no_active_config',
        ruleKind: params.kind,
        locationUid: params.locationUid,
      };
    }

    if (!cfg.enabled) {
      this.logDecision('trigger skipped (config_disabled)', {
        source: 'admin',
        ruleKind: params.kind,
        locationUid: params.locationUid,
        configUid: cfg.uid,
      });

      return {
        ok: false,
        action: 'skipped',
        reason: 'config_disabled',
        ruleKind: params.kind,
        locationUid: params.locationUid,
        details: { configUid: cfg.uid },
      };
    }

    const now = new Date();
    const msInDay = 24 * 60 * 60 * 1000;
    const windowEnd = new Date(now.getTime() + cfg.upcomingWindowDays * msInDay);

    this.logDecision('trigger started', {
      source: 'admin',
      ruleKind: params.kind,
      locationUid: params.locationUid,
      now: now.toISOString(),
      windowEnd: windowEnd.toISOString(),
      configUid: cfg.uid,
    });

    // 1) Load events at this location (same filter as before)
    const events = await this.prisma.pLEvent.findMany({
      where: {
        isDeleted: false,
        locationUid: params.locationUid,
        endDate: { gte: now, lte: windowEnd },
      },
      select: { uid: true },
    });

    this.logDecision('events loaded for refresh', {
      source: 'admin',
      ruleKind: params.kind,
      locationUid: params.locationUid,
      eventsCount: events.length,
    });

    if (!events.length) {
      this.logDecision('trigger skipped (no_events_in_window)', {
        source: 'admin',
        ruleKind: params.kind,
        locationUid: params.locationUid,
        windowEnd: windowEnd.toISOString(),
      });

      return {
        ok: false,
        action: 'skipped',
        reason: 'no_events_in_window',
        ruleKind: params.kind,
        locationUid: params.locationUid,
        details: { windowEnd: windowEnd.toISOString() },
      };
    }

    // refresh candidates (authoritative attendeeCount)
    await this.candidatesService.refreshCandidatesForEvents(events.map((e) => e.uid));

    // 2) Load fresh candidates for this location + kind
    const candidates = await this.prisma.irlGatheringPushCandidate.findMany({
      where: {
        isSuppressed: false,
        gatheringUid: params.locationUid,
        ruleKind: params.kind,
        processedAt: null,
      },
      orderBy: [{ eventStartDate: 'asc' }],
      select: {
        uid: true,
        eventUid: true,
        eventStartDate: true,
        eventEndDate: true,
        attendeeCount: true,
      },
    });

    this.logDecision('candidates loaded', {
      source: 'admin',
      ruleKind: params.kind,
      locationUid: params.locationUid,
      candidatesCount: candidates.length,
    });

    if (!candidates.length) {
      this.logDecision('trigger skipped (no_candidates)', {
        source: 'admin',
        ruleKind: params.kind,
        locationUid: params.locationUid,
      });

      return {
        ok: false,
        action: 'skipped',
        reason: 'no_candidates',
        ruleKind: params.kind,
        locationUid: params.locationUid,
      };
    }

    //  always create/update if candidates exist
    return await this.processSingleGroup(cfg, params.kind, params.locationUid, candidates, {
      bypassGating: true,
      source: 'admin',
    });
  }

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
      opts: { markProcessed: boolean; restrictToSingleGroup?: boolean }
  ) {
    if (!candidates.length) return;

    const now = new Date();

    // Group candidates by (ruleKind, gatheringUid) so we send one notification per location + kind.
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
        where: {
          isDeleted: false,
          locationUid: gatheringUid,
          endDate: { gte: now, lte: windowEnd },
        },
      });

      const qualifiedEventsInWindow = new Set(groupCandidates.map((c) => c.eventUid)).size;

      if (totalEventsInWindow < cfg.totalEventsThreshold || qualifiedEventsInWindow < cfg.qualifiedEventsThreshold) {
        continue;
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
        select: { uid: true, createdAt: true },
      });

      const payload = await this.buildLocationPayload(ruleKind, gatheringUid, groupCandidates);

      // REMINDER uses "starts in X days"
      const { title, description } = this.buildTitleAndDescription(ruleKind, payload);

      if (alreadySent) {
        await this.prisma.pushNotification.update({
          where: { uid: alreadySent.uid },
          data: { title, description, metadata: payload as any },
        });
      } else {
        await this.pushNotificationsService.create({
          category: PushNotificationCategory.IRL_GATHERING,
          title,
          description,
          metadata: payload,
          isPublic: true,
        });
      }

      if (opts.markProcessed) await this.markCandidatesProcessed(groupCandidates.map((c) => c.uid));
    }
  }

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

    if (!earliestStart && !earliestEnd) {
      this.logger.log(`[IRL push job] Window check: ruleKind=${ruleKind}, earliest=<none> -> false`);
      return false;
    }

    if (ruleKind === IrlGatheringPushRuleKind.UPCOMING) {
      const windowEnd = new Date(now.getTime() + cfg.upcomingWindowDays * msInDay);
      this.logger.log(`[IRL push job] UPCOMING windowEnd=${windowEnd.toISOString()}`);

      if (!earliestEnd) {
        this.logger.log(`[IRL push job] Window check: ruleKind=UPCOMING earliestEnd=<none> -> false`);
        return false;
      }

      this.logger.log(`[IRL push job] Window check: ruleKind=UPCOMING earliestEnd=${earliestEnd.toISOString()}`);

      return earliestEnd.getTime() >= now.getTime() && earliestEnd.getTime() <= windowEnd.getTime();
    }

    if (ruleKind === IrlGatheringPushRuleKind.REMINDER) {
      const reminderStart = new Date(now.getTime());
      const reminderEnd = new Date(now.getTime() + cfg.reminderDaysBefore * msInDay);

      this.logger.log(
          `[IRL push job] REMINDER window=[${reminderStart.toISOString()}..${reminderEnd.toISOString()}]`
      );

      if (!earliestStart) {
        this.logger.log(`[IRL push job] Window check: ruleKind=REMINDER earliestStart=<none> -> false`);
        return false;
      }

      this.logger.log(`[IRL push job] Window check: ruleKind=REMINDER earliestStart=${earliestStart.toISOString()}`);
      return earliestStart.getTime() >= reminderStart.getTime() && earliestStart.getTime() <= reminderEnd.getTime();
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

  private async buildLocationPayload(
      ruleKind: IrlGatheringPushRuleKind,
      gatheringUid: string,
      groupCandidates: Array<{
        eventUid: string;
        eventStartDate: Date;
        eventEndDate: Date;
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
        description: true,
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
          description: location.description,
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

    const distinctAttendees = await this.prisma.pLEventGuest.findMany({
      where: { eventUid: { in: eventUids } },
      distinct: ['memberUid'],
      select: { memberUid: true },
    });
    const uniqueAttendeeCount = distinctAttendees.length;

    const top = await this.prisma.pLEventGuest.groupBy({
      by: ['memberUid'],
      where: {
        eventUid: { in: eventUids },
      },
      _count: {
        eventUid: true,
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
            description: locationInfo.description,
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
      ui: {
        locationUid: gatheringUid,
        eventSlugs: eventSummaries.map((e) => e.slug),
      },
    };
  }

  private logCtx(ctx: Record<string, any>) {
    return Object.entries(ctx)
        .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(' ');
  }

  private logDecision(message: string, ctx: Record<string, any>) {
    this.logger.log(`[IRL push] ${message} | ${this.logCtx(ctx)}`);
  }

  // --- V1 copy helpers (minimal additions, no refactor) ---

  private daysUntil(startIso: string | null | undefined): number | null {
    if (!startIso) return null;
    const start = new Date(startIso);
    if (Number.isNaN(start.getTime())) return null;

    const now = new Date();
    const diffMs = start.getTime() - now.getTime();
    const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

    return Math.max(0, days);
  }

  private humanDays(days: number | null): string {
    if (days == null) return 'soon';
    if (days === 0) return 'today';
    if (days === 1) return '1 day';
    return `${days} days`;
  }

  private buildTitleAndDescription(
      ruleKind: IrlGatheringPushRuleKind,
      payload: any
  ): { title: string; description: string } {
    const locationName = payload?.location?.name ?? payload?.location?.id ?? 'this location';

    if (ruleKind === IrlGatheringPushRuleKind.REMINDER) {
      const earliestStartIso: string | null | undefined = payload?.events?.dates?.start ?? null;
      const days = this.daysUntil(earliestStartIso);

      return {
        title: `Reminder: IRL Gathering in ${locationName}`,
        description: `Reminder: IRL Gathering in ${locationName} starts in ${this.humanDays(days)}.`,
      };
    }

    const title = payload.location?.name ? `IRL gathering in ${payload.location.name}` : 'IRL gathering';
    const description =
        payload.location?.description && String(payload.location.description).trim().length > 0
            ? String(payload.location.description).trim()
            : payload.events?.total != null
                ? `${payload.events.total} upcoming event(s) • ${payload.attendees.total} attendee(s)`
                : 'Upcoming IRL gathering';

    return { title, description };
  }

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

        this.logDecision('group skipped (window_miss)', {
          source: opts.source,
          ruleKind,
          locationUid: gatheringUid,
          candidates: groupCandidates.length,
        });

        return {
          ok: false,
          action: 'skipped',
          reason: 'window_miss',
          ruleKind,
          locationUid: gatheringUid,
        };
      }

      const msInDay = 24 * 60 * 60 * 1000;
      const windowEnd = new Date(now.getTime() + cfg.upcomingWindowDays * msInDay);

      const totalEventsInWindow = await this.prisma.pLEvent.count({
        where: {
          isDeleted: false,
          locationUid: gatheringUid,
          endDate: { gte: now, lte: windowEnd },
        },
      });

      const qualifiedEventsInWindow = new Set(groupCandidates.map((c) => c.eventUid)).size;

      if (totalEventsInWindow < cfg.totalEventsThreshold || qualifiedEventsInWindow < cfg.qualifiedEventsThreshold) {
        this.logDecision('group skipped (thresholds_not_met)', {
          source: opts.source,
          ruleKind,
          locationUid: gatheringUid,
          totalEventsInWindow,
          totalEventsThreshold: cfg.totalEventsThreshold,
          qualifiedEventsInWindow,
          qualifiedEventsThreshold: cfg.qualifiedEventsThreshold,
        });

        return {
          ok: false,
          action: 'skipped',
          reason: 'thresholds_not_met',
          ruleKind,
          locationUid: gatheringUid,
          details: {
            totalEventsInWindow,
            totalEventsThreshold: cfg.totalEventsThreshold,
            qualifiedEventsInWindow,
            qualifiedEventsThreshold: cfg.qualifiedEventsThreshold,
          },
        };
      }
    } else {
      this.logDecision('group gating bypassed (admin trigger)', {
        source: opts.source,
        ruleKind,
        locationUid: gatheringUid,
        candidates: groupCandidates.length,
      });
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
      select: { uid: true, createdAt: true, updatedAt: true },
    });

    const payload = await this.buildLocationPayload(ruleKind, gatheringUid, groupCandidates);
    const { title, description } = this.buildTitleAndDescription(ruleKind, payload);

    let pushUid: string;
    let action: 'created' | 'updated';

    if (alreadySent) {
      action = 'updated';
      pushUid = alreadySent.uid;

      const bumpForAdmin = opts.source === 'admin';

      await this.prisma.pushNotification.update({
        where: { uid: alreadySent.uid },
        data: {
          title,
          description,
          metadata: payload as any,
          ...(bumpForAdmin ? { sentAt: new Date(), isSent: true, isRead: false, createdAt: new Date() } : {}),
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

    this.logDecision('push stored', {
      source: opts.source,
      action,
      pushUid,
      ruleKind,
      locationUid: gatheringUid,
      payloadVersion: this.payloadVersion,
      eventsTotal: payload.events?.total ?? 0,
      attendeesTotal: payload.attendees?.total ?? 0,
      topAttendees: payload.attendees?.topAttendees?.length ?? 0,
      reminderStartIso: payload?.events?.dates?.start ?? null,
      reminderStartsInDays:
          ruleKind === IrlGatheringPushRuleKind.REMINDER ? this.daysUntil(payload?.events?.dates?.start ?? null) : null,
      eventUidsSample: (payload.events?.eventUids ?? []).slice(0, 5),
      bumpedForAdmin: opts.source === 'admin',
    });

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
        dates: {
          start: payload.events?.dates?.start ?? null,
          end: payload.events?.dates?.end ?? null,
        },
      },
      attendees: {
        total: payload.attendees?.total ?? 0,
        topAttendees: payload.attendees?.topAttendees?.length ?? 0,
      },
      updatedAt: new Date().toISOString(),
    };
  }
}
