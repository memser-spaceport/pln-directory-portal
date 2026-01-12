import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { PushNotificationsService } from '../../push-notifications/push-notifications.service';
import { IrlGatheringPushRuleKind, PushNotificationCategory } from '@prisma/client';
import { IrlGatheringPushConfigService } from './irl-gathering-push-config.service';
import { IrlGatheringPushCandidatesService } from './irl-gathering-push-candidates.service';

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
   * Manual trigger path (from admin/back-office):
   * - Recomputes candidates for the location's events (fresh attendee counts)
   * - Then sends/updates a push ONLY for the given (locationUid, ruleKind)
   *
   * This ensures the payload reflects the current #events/#attendees at trigger time.
   */
  async triggerManual(params: { locationUid: string; kind: IrlGatheringPushRuleKind }): Promise<void> {
    const cfg = (await this.configService.getActiveConfigOrNull()) as ActiveDbConfig | null;
    if (!cfg) return;

    if (!cfg.enabled) {
      // If you want manual triggers to work even when the DB config is disabled,
      // remove this early return.
      return;
    }

    const now = new Date();
    const msInDay = 24 * 60 * 60 * 1000;
    const windowEnd = new Date(now.getTime() + cfg.upcomingWindowDays * msInDay);

    // 1) Load events at this location in the UPCOMING window
    // so refreshCandidatesForEvents can compute the authoritative attendeeCount values.
    const events = await this.prisma.pLEvent.findMany({
      where: {
        isDeleted: false,
        locationUid: params.locationUid,
        endDate: { gte: now, lte: windowEnd },
      },
      select: { uid: true },
    });

    await this.candidatesService.refreshCandidatesForEvents(events.map((e) => e.uid));

    // 2) Load fresh, unprocessed candidates for this location + rule kind.
    const candidates = await this.prisma.irlGatheringPushCandidate.findMany({
      where: {
        isSuppressed: false,
        gatheringUid: params.locationUid,
        ruleKind: params.kind,
        // refreshCandidatesForEvents sets processedAt=null for regenerated candidates
        processedAt: null,
      },
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

    await this.processCandidates(cfg, candidates, { markProcessed: true, restrictToSingleGroup: true });
  }

  /**
   * Shared core logic used by both scheduled and manual paths.
   * - Groups candidates by (ruleKind, gatheringUid)
   * - Applies time window checks (UPCOMING/REMINDER)
   * - Applies group-level thresholds
   * - Dedups by (category, ruleKind, gatheringUid, version)
   * - Creates or updates a push notification with a rich payload
   */
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

      // Time window checks:
      // - UPCOMING: include events whose earliest end is within [now..now+upcomingWindowDays]
      // - REMINDER: include events whose earliest start is within [now..now+reminderDaysBefore]
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

      // Group-level thresholds:
      // require a minimum total number of events at the location in the window
      // AND a minimum number of qualifying events (candidates) before we send/update a push.
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
        // Do NOT mark candidates processed so the group can become eligible later.
        continue;
      }

      // De-duplication: key by (category, ruleKind, gatheringUid, version).
      // If found, update payload instead of creating a new push.
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

      // Human-readable title/description; UI may fully rely on metadata instead.
      const title = payload.location?.name ? `IRL gathering in ${payload.location.name}` : 'IRL gathering';
      const description =
        (payload.location?.description && String(payload.location.description).trim().length > 0)
          ? String(payload.location.description).trim()
          : payload.events?.total != null
            ? `${payload.events.total} upcoming event(s) • ${payload.attendees.total} attendee(s)`
            : 'Upcoming IRL gathering';

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

      // Include in-progress events: endDate must not be in the past
      return earliestEnd.getTime() >= now.getTime() && earliestEnd.getTime() <= windowEnd.getTime();
    }

    if (ruleKind === IrlGatheringPushRuleKind.REMINDER) {
      // Fire when the event starts within N days (inclusive)
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
    this.logger.log(`[IRL push job] Marked candidates processed: ${candidateUids.length}`);
  }

  /**
   * Builds a rich metadata payload for one location ("gathering") and ruleKind.
   *
   * IMPORTANT:
   * - This payload is what the Notification Service stores and what UI consumes.
   * - Notification Service should remain data-agnostic and not fetch Directory data.
   */
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

    // Candidate attendeeCount is authoritative (computed by refreshCandidatesForEvents).
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

    // Unique attendee count across all events (NOT a sum).
    const distinctAttendees = await this.prisma.pLEventGuest.findMany({
      where: { eventUid: { in: eventUids } },
      distinct: ['memberUid'],
      select: { memberUid: true },
    });
    const uniqueAttendeeCount = distinctAttendees.length;

    // Top attendees = members who attend the most events within the group.
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
      // Future-proof: allow UI to render more contextual UX.
      ui: {
        // UI can derive final route based on its own routing rules.
        locationUid: gatheringUid,
        eventSlugs: eventSummaries.map((e) => e.slug),
      },
    };
  }
}
