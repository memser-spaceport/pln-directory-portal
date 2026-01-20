import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { PushNotificationsService } from '../../push-notifications/push-notifications.service';
import { IrlGatheringPushRuleKind, PushNotificationCategory } from '@prisma/client';
import { IrlGatheringPushConfigService } from './irl-gathering-push-config.service';
import { IrlGatheringPushCandidatesService } from './irl-gathering-push-candidates.service';
import { PLEventGuestsService } from '../pl-event-guests.service';


/**
 * Response returned to back-office on manual trigger.
 * Keep it stable & explicit so UI can show rich details without guessing.
 */
export type IrlPushTriggerResult =
  | {
  ok: true;
  action: 'created' | 'updated';
  pushUid: string;
  ruleKind: IrlGatheringPushRuleKind;
  locationUid: string;
  payloadVersion: number;
  candidates: { total: number; processed: number };
  events: { total: number; qualifiedTotal?: number; eventUids: string[]; dates: { start: string | null; end: string | null } };
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
  resources?: any[] | null;
};

type EventSummary = {
  uid: string;
  slug: string;
  name: string;
  startDate: string;
  endDate: string;
  attendeeCount: number;
  logoUrl?: string | null;
  resources?: any[] | null;
  websiteURL?: string | null;
  telegramId?: string | null;
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
    private readonly candidatesService: IrlGatheringPushCandidatesService,
    private readonly pleventGuestsService: PLEventGuestsService
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

    if (!cfg) {
      this.logDecision('job skipped (no_active_config)', { source: 'job' });
      return;
    }

    if (!cfg.enabled) {
      this.logDecision('job skipped (config_disabled)', { source: 'job', configUid: cfg.uid });
      return;
    }

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

    this.logDecision('job candidates loaded', { source: 'job', candidates: candidates.length });

    await this.processCandidates(cfg, candidates, { markProcessed: true });

    // Important: we do NOT refresh all existing pushes here.
    // Only event/member write-paths will refresh the already-sent pushes they touch.
  }

  /**
   * Manual trigger path (from admin/back-office):
   * - Recomputes candidates for the location's events (fresh attendee counts)
   * - Then sends/updates a push ONLY for the given (locationUid, ruleKind)
   *
   * Admin trigger bypasses window & thresholds gating: if candidates exist -> we create/update.
   */
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
    const windowEndUpcoming = new Date(now.getTime() + cfg.upcomingWindowDays * msInDay);

    this.logDecision('trigger started', {
      source: 'admin',
      ruleKind: params.kind,
      locationUid: params.locationUid,
      now: now.toISOString(),
      windowEndUpcoming: windowEndUpcoming.toISOString(),
      configUid: cfg.uid,
    });

    // Load events at this location in the UPCOMING window (same base as IRL page).
    const events = await this.prisma.pLEvent.findMany({
      where: {
        isDeleted: false,
        locationUid: params.locationUid,
        endDate: { gte: now, lte: windowEndUpcoming },
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
        windowEndUpcoming: windowEndUpcoming.toISOString(),
      });

      return {
        ok: false,
        action: 'skipped',
        reason: 'no_events_in_window',
        ruleKind: params.kind,
        locationUid: params.locationUid,
        details: { windowEndUpcoming: windowEndUpcoming.toISOString() },
      };
    }

    // Refresh candidates (authoritative attendeeCount per event).
    await this.candidatesService.refreshCandidatesForEvents(events.map((e) => e.uid));

    // Load fresh candidates for this location + kind (only unprocessed).
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

    // Admin trigger bypasses gating and bumps createdAt/sentAt so UI sees it as "new".
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

    // Group candidates by (ruleKind, gatheringUid) so we send one notification per location + kind.
    const groups = new Map<string, typeof candidates>();
    for (const c of candidates) {
      const key = `${c.ruleKind}::${c.gatheringUid}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
    }

    for (const [groupKey, groupCandidates] of groups.entries()) {
      const [ruleKindRaw, gatheringUid] = groupKey.split('::');
      const ruleKind = ruleKindRaw as IrlGatheringPushRuleKind;

      // Window checks (job gating).
      const windowOk = this.matchesWindow(
          ruleKind,
          groupCandidates.map((c) => c.eventStartDate),
          groupCandidates.map((c) => c.eventEndDate),
          now,
          cfg
      );

      if (!windowOk) {
        if (opts.markProcessed) await this.markCandidatesProcessed(groupCandidates.map((c) => c.uid));
        this.logDecision('group skipped (window_miss)', {
          source: 'job',
          ruleKind,
          locationUid: gatheringUid,
          candidates: groupCandidates.length,
        });
        continue;
      }

      // Threshold checks (job gating).
      const msInDay = 24 * 60 * 60 * 1000;
      const windowEndUpcoming = new Date(now.getTime() + cfg.upcomingWindowDays * msInDay);

      const totalEventsInWindow = await this.prisma.pLEvent.count({
        where: {
          isDeleted: false,
          locationUid: gatheringUid,
          endDate: { gte: now, lte: windowEndUpcoming },
        },
      });

      const qualifiedEventsInWindow = new Set(groupCandidates.map((c) => c.eventUid)).size;

      if (totalEventsInWindow < cfg.totalEventsThreshold || qualifiedEventsInWindow < cfg.qualifiedEventsThreshold) {
        this.logDecision('group skipped (thresholds_not_met)', {
          source: 'job',
          ruleKind,
          locationUid: gatheringUid,
          totalEventsInWindow,
          totalEventsThreshold: cfg.totalEventsThreshold,
          qualifiedEventsInWindow,
          qualifiedEventsThreshold: cfg.qualifiedEventsThreshold,
        });

        // Do NOT mark candidates processed so the group can become eligible later.
        continue;
      }

      // Create/update push.
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

    // For grouped notifications:
    // - use earliest end date for UPCOMING (closest finishing)
    // - use earliest start date for REMINDER (closest starting)
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

      // Include in-progress events: endDate must not be in the past
      return earliestEnd.getTime() >= now.getTime() && earliestEnd.getTime() <= windowEnd.getTime();
    }

    if (ruleKind === IrlGatheringPushRuleKind.REMINDER) {
      // Fire when the event starts within N days (inclusive)
      const reminderStart = new Date(now.getTime());
      const reminderEnd = new Date(now.getTime() + cfg.reminderDaysBefore * msInDay);

      if (!earliestStart) return false;
      return earliestStart.getTime() >= reminderStart.getTime() && earliestStart.getTime() <= reminderEnd.getTime();
    }

    return false;
  }

  /**
   * Marks candidates as processed to avoid repeated work.
   * Note: we intentionally do NOT mark candidates processed when the group fails thresholds,
   * so it can become eligible later.
   */
  private async markCandidatesProcessed(candidateUids: string[]): Promise<void> {
    if (!candidateUids?.length) return;

    await this.prisma.irlGatheringPushCandidate.updateMany({
      where: { uid: { in: candidateUids } },
      data: { processedAt: new Date() },
    });

    this.logDecision('candidates marked processed', { count: candidateUids.length });
  }

  // ---------------------------------------------------------------------------
  // helpers: resources normalization (no double-parsing in FE)
  // ---------------------------------------------------------------------------

  private normalizeResources(input: any): any[] {
    if (!input) return [];
    if (!Array.isArray(input)) return [];

    return input
      .map((x) => {
        if (!x) return null;

        // DB usually stores text[] where each element is a JSON-string
        if (typeof x === 'string') {
          const s = x.trim();
          if (!s) return null;
          try {
            return JSON.parse(s);
          } catch {
            return { raw: s };
          }
        }

        // already an object
        if (typeof x === 'object') return x;

        return null;
      })
      .filter(Boolean);
  }

  private parseYmdToUtcDate(v: any): Date | null {
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

    const now = new Date();
    const diffMs = start.getTime() - now.getTime();
    const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

    return Math.max(0, days);
  }

  private ordinal(n: number): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return `${n}st`;
    if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
    if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
    return `${n}th`;
  }

  private formatDateForTitle(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const month = d.toLocaleString('en-US', { month: 'short' });
    const day = d.getDate();
    return `${month} ${this.ordinal(day)}`;
  }

  private buildTitleAndDescription(payload: any): { title: string; description: string } {
    const locationName = payload?.location?.name ?? 'your area';

    const startLabel = this.formatDateForTitle(payload?.events?.dates?.start ?? null);
    const eventsTotal = payload?.events?.total ?? 0;
    const title = `${eventsTotal} event${eventsTotal === 1 ? '' : 's'} happening in ${locationName}${startLabel ? ` starting ${startLabel}` : ''}`;

    const description =
      payload.location?.description && String(payload.location.description).trim().length > 0
        ? String(payload.location.description).trim()
        : payload.events?.total != null
          ? `${payload.events.total} upcoming event(s) • ${payload.attendees.total} attendee(s)`
          : 'Upcoming IRL gathering';

    return { title, description };
  }

  private computeAttendeesTotalsFromGuestsResponse(
    guestsRows: any[] | null | undefined
  ): { total: number; topAttendees: TopAttendee[] } {
    const rows = Array.isArray(guestsRows) ? guestsRows : [];

    const total = rows.length > 0 && typeof rows[0]?.count === 'number' ? rows[0].count : 0;

    const topAttendees: TopAttendee[] = rows.slice(0, 6).map((r) => ({
      memberUid: r.memberUid,
      eventsCount: Array.isArray(r?.events) ? r.events.length : 0,
      imageUrl: r?.member?.image?.url ?? null,
      displayName: r?.member?.name ?? null,
    }));

    return { total, topAttendees };
  }

  private async buildLocationPayload(
    cfg: ActiveDbConfig,
    ruleKind: IrlGatheringPushRuleKind,
    gatheringUid: string,
    groupCandidates: Array<{
      eventUid: string;
      eventStartDate: Date;
      eventEndDate: Date;
      attendeeCount: number;
    }>
  ): Promise<any> {
    const displayEventUids = [...new Set(groupCandidates.map((c) => c.eventUid).filter(Boolean))];

    // Location + resources
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
        resources: true,
      },
    });

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
        resources: this.normalizeResources((location as any).resources),
      }
      : null;

    // Events to DISPLAY in notification (candidate-driven; reminder will show subset)
    const events = displayEventUids.length
      ? await this.prisma.pLEvent.findMany({
        where: { uid: { in: displayEventUids }, isDeleted: false },
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
      })
      : [];

    const attendeeCountByEventUid = new Map<string, number>();
    for (const c of groupCandidates) attendeeCountByEventUid.set(c.eventUid, c.attendeeCount);

    const eventSummaries: EventSummary[] = events.map((ev) => ({
      uid: ev.uid,
      slug: ev.slugURL,
      name: ev.name,
      startDate: ev.startDate.toISOString(),
      endDate: ev.endDate.toISOString(),
      attendeeCount: attendeeCountByEventUid.get(ev.uid) ?? 0,
      logoUrl: ev.logo?.url ?? null,
      websiteURL: (ev as any).websiteURL ?? null,
      telegramId: (ev as any).telegramId ?? null,
      resources: this.normalizeResources((ev as any).resources),
    }));

    const dateStart = eventSummaries.length ? eventSummaries[0].startDate : null;
    const dateEnd = eventSummaries.length ? eventSummaries[eventSummaries.length - 1].endDate : null;
    const guestsRows = await this.pleventGuestsService.getPLEventGuestsByLocationAndType(
      gatheringUid,
      { type: 'upcoming' },
      null
    );

    const attendees = this.computeAttendeesTotalsFromGuestsResponse(guestsRows);

    // Total events shown on IRL schedule UI (not window-limited): endDate >= now
    const scheduleTotalEvents = await this.prisma.pLEvent.count({
      where: {
        isDeleted: false,
        locationUid: gatheringUid,
        endDate: { gte: new Date() },
      },
    });

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
          resources: locationInfo.resources ?? [],
        }
        : null,
      events: {
        total: scheduleTotalEvents,
        qualifiedTotal: eventSummaries.length,
        eventUids: displayEventUids,
        dates: { start: dateStart, end: dateEnd },
        items: eventSummaries,
      },
      attendees: {
        total: attendees.total,
        topAttendees: attendees.topAttendees,
      },
      ui: {
        locationUid: gatheringUid,
        eventSlugs: eventSummaries.map((e) => e.slug),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Push creation/update
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

    // If NOT bypassing gating, enforce window & thresholds (job path).
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
      const windowEndUpcoming = new Date(now.getTime() + cfg.upcomingWindowDays * msInDay);

      const totalEventsInWindow = await this.prisma.pLEvent.count({
        where: {
          isDeleted: false,
          locationUid: gatheringUid,
          endDate: { gte: now, lte: windowEndUpcoming },
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
    }

    const payload = await this.buildLocationPayload(cfg, ruleKind, gatheringUid, groupCandidates);
    const { title, description } = this.buildTitleAndDescription(payload);

    const alreadySent = await this.prisma.pushNotification.findFirst({
      where: {
        category: PushNotificationCategory.IRL_GATHERING,
        isPublic: true,
        metadata: {
          path: ['ruleKind'],
          equals: ruleKind,
        },
        AND: [
          {
            metadata: {
              path: ['gatheringUid'],
              equals: gatheringUid,
            },
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }],
      select: { id: true, uid: true },
    });

    // Bump for admin triggers so back-office sees a fresh notification (and users see it sooner).
    const bumpForAdmin = opts.source === 'admin';

    let action: 'created' | 'updated' = 'updated';
    let pushUid: string;

    if (alreadySent) {
      pushUid = alreadySent.uid;

      // reset read statuses only when admin explicitly triggers it
      if (bumpForAdmin) {
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
        qualifiedTotal: (payload.events as any)?.qualifiedTotal ?? 0,
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

  private logCtx(ctx: Record<string, any>) {
    return Object.entries(ctx)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ');
  }

  private logDecision(message: string, ctx: Record<string, any> = {}) {
    this.logger.log(`[IRL push] ${message} | ${this.logCtx(ctx)}`);
  }
}
