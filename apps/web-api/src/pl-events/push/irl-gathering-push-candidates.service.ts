import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { IrlGatheringPushRuleKind, PushNotificationCategory } from '@prisma/client';
import { IrlGatheringPushConfigService } from './irl-gathering-push-config.service';
import { PLEventGuestsService } from '../pl-event-guests.service';

type CandidateRow = {
  eventUid: string;
  eventStartDate: Date;
  eventEndDate: Date;
  attendeeCount: number;
};

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

  // Must match metadata payload produced by processor
  private readonly payloadVersion = 1;

  constructor(
      private readonly prisma: PrismaService,
      private readonly configService: IrlGatheringPushConfigService,
      @Inject(forwardRef(() => PLEventGuestsService))
      private readonly pleventGuestsService: PLEventGuestsService
  ) {}

  async refreshCandidatesForEvents(eventUids: string[]): Promise<void> {
    const uniqueEventUids = [...new Set((eventUids ?? []).filter(Boolean))];
    if (uniqueEventUids.length === 0) return;

    const cfg = (await this.configService.getActiveConfigOrNull()) as ActiveDbConfig | null;
    if (!cfg || !cfg.enabled) return;

    const now = new Date();
    const msInDay = 24 * 60 * 60 * 1000;

    const windowEndUpcoming = new Date(now.getTime() + cfg.upcomingWindowDays * msInDay);
    const windowEndReminder = new Date(now.getTime() + cfg.reminderDaysBefore * msInDay);

    const events = await this.prisma.pLEvent.findMany({
      where: { uid: { in: uniqueEventUids }, isDeleted: false },
      select: { uid: true, startDate: true, endDate: true, locationUid: true },
    });

    const attendeeCounts = await this.prisma.pLEventGuest.groupBy({
      by: ['eventUid'],
      where: { eventUid: { in: uniqueEventUids } },
      _count: { _all: true },
    });

    const countByEventUid = new Map<string, number>();
    for (const row of attendeeCounts) {
      if (!row.eventUid) continue;
      countByEventUid.set(row.eventUid, row._count._all);
    }

    const upserts: Promise<any>[] = [];
    const deletes: Promise<any>[] = [];

    for (const ev of events) {
      const attendeeCount = countByEventUid.get(ev.uid) ?? 0;

      const hasGathering = Boolean(ev.locationUid);
      const startDate = ev.startDate ? new Date(ev.startDate) : null;
      const endDate = ev.endDate ? new Date(ev.endDate) : null;

      const meetsThreshold = attendeeCount >= cfg.minAttendeesPerEvent;

      const notEnded = !!endDate && endDate.getTime() >= now.getTime();

      // UPCOMING: endDate within upcoming window
      const withinUpcomingWindow = !!endDate && endDate.getTime() <= windowEndUpcoming.getTime();
      const qualifiesUpcoming = hasGathering && notEnded && withinUpcomingWindow && meetsThreshold;

      // REMINDER: event has NOT started yet + starts within reminder window (matches sync logic)
      const notStartedYet = !!startDate && startDate.getTime() >= now.getTime();
      const withinReminderWindow = !!startDate && startDate.getTime() <= windowEndReminder.getTime();
      const qualifiesReminder = hasGathering && notEnded && meetsThreshold && notStartedYet && withinReminderWindow;

      if (qualifiesUpcoming) {
        upserts.push(
          this.prisma.irlGatheringPushCandidate.upsert({
            where: { ruleKind_eventUid: { ruleKind: IrlGatheringPushRuleKind.UPCOMING, eventUid: ev.uid } },
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
              isSuppressed: false,
            },
          })
        );
      } else {
        deletes.push(
          this.prisma.irlGatheringPushCandidate.deleteMany({
            where: { ruleKind: IrlGatheringPushRuleKind.UPCOMING, eventUid: ev.uid },
          })
        );
      }

      if (qualifiesReminder) {
        upserts.push(
          this.prisma.irlGatheringPushCandidate.upsert({
            where: { ruleKind_eventUid: { ruleKind: IrlGatheringPushRuleKind.REMINDER, eventUid: ev.uid } },
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
              isSuppressed: false,
            },
          })
        );
      } else {
        deletes.push(
          this.prisma.irlGatheringPushCandidate.deleteMany({
            where: { ruleKind: IrlGatheringPushRuleKind.REMINDER, eventUid: ev.uid },
          })
        );
      }
    }

    await Promise.all([...upserts, ...deletes]);
  }

  async refreshCandidatesForEventsAndUpdateNotifications(eventUids: string[]): Promise<void> {
    await this.refreshCandidatesForEvents(eventUids);
    await this.updateAlreadySentNotificationsForEvents(eventUids);
  }

  async refreshNotificationsForLocation(locationUid: string): Promise<void> {
    await this.updateAlreadySentNotificationsForLocation(locationUid);
  }

  private async updateAlreadySentNotificationsForEvents(eventUids: string[]): Promise<void> {
    const uniqueEventUids = [...new Set((eventUids ?? []).filter(Boolean))];
    if (uniqueEventUids.length === 0) return;

    const events = await this.prisma.pLEvent.findMany({
      where: { uid: { in: uniqueEventUids }, isDeleted: false },
      select: { locationUid: true },
    });

    const gatheringUids = [...new Set(events.map((e) => e.locationUid).filter(Boolean))] as string[];
    for (const gatheringUid of gatheringUids) {
      await this.updateAlreadySentNotificationsForLocation(gatheringUid);
    }
  }

  private async updateAlreadySentNotificationsForLocation(locationUid: string): Promise<void> {
    const cfg = (await this.configService.getActiveConfigOrNull()) as ActiveDbConfig | null;
    if (!cfg || !cfg.enabled) return;

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

    if (pushes.length === 0) return;

    const now = new Date();
    const windowEndUpcoming = new Date(now.getTime() + cfg.upcomingWindowDays * 24 * 60 * 60 * 1000);
    const windowEndReminder = new Date(now.getTime() + cfg.reminderDaysBefore * 24 * 60 * 60 * 1000);

    for (const p of pushes) {
      const ruleKind = (p.metadata as any)?.ruleKind as IrlGatheringPushRuleKind | undefined;
      if (!ruleKind) continue;

      const dateFilter =
          ruleKind === IrlGatheringPushRuleKind.REMINDER
              ? { eventStartDate: { gte: now, lte: windowEndReminder } }
              : { eventEndDate: { gte: now, lte: windowEndUpcoming } };

      const candidates = await this.prisma.irlGatheringPushCandidate.findMany({
        where: {
          isSuppressed: false,
          gatheringUid: locationUid,
          ruleKind,
          ...dateFilter,
        },
        orderBy: [{ eventStartDate: 'asc' }],
        select: {
          eventUid: true,
          eventStartDate: true,
          eventEndDate: true,
          attendeeCount: true,
        },
      });

      // If reminder candidates disappeared, still update attendee totals (don’t skip update).
      const payload =
          candidates.length > 0
              ? await this.buildLocationPayload(locationUid, candidates, cfg)
              : await this.patchExistingPayloadWithFreshAttendees(p.metadata as any, locationUid);

      const locationName = payload?.location?.name ?? payload?.location?.id ?? 'this location';
      const title =
          ruleKind === IrlGatheringPushRuleKind.REMINDER
              ? `Reminder: IRL Gathering in ${locationName} starts in ${payload?.ui?.daysToStart ?? 0} days.`
              : `${payload.events?.total ?? 0} event${(payload.events?.total ?? 0) === 1 ? '' : 's'} happening in ${locationName}${
                  payload?.ui?.startsLabel ? ` starting ${payload.ui.startsLabel}` : ''
              }`;

      const description =
          payload.location?.description && String(payload.location.description).trim().length > 0
              ? String(payload.location.description).trim()
              : payload.events?.total != null
                  ? `${payload.events.total} upcoming event(s) • ${payload.attendees.total} attendee(s)`
                  : 'Upcoming IRL gathering';

      await this.prisma.pushNotification.update({
        where: { uid: p.uid },
        data: { title, description, metadata: { ...(payload as any), ruleKind } as any },
      });

      this.logger.log(
          `[candidates] refreshed existing pushNotification uid=${p.uid} locationUid=${locationUid} ruleKind=${ruleKind} attendeesTotal=${payload.attendees?.total}`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Payload helpers
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
        return { raw: v };
      }
    };

    if (Array.isArray(raw)) return raw.map(tryParse).filter(Boolean);
    if (typeof raw === 'string') {
      const p = tryParse(raw);
      return p == null ? [] : Array.isArray(p) ? p : [p];
    }
    return [raw];
  }

  private ordinal(n: number): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return `${n}st`;
    if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
    if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
    return `${n}th`;
  }

  private startsLabelFromIso(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const day = this.ordinal(d.getUTCDate());
    const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    return `${day} ${month}`;
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

  private async computeAttendeesUsingIrlPage(
    locationUid: string
  ): Promise<{ total: number; topAttendees: TopAttendee[] }> {
    try {
      const rows: any[] = await this.pleventGuestsService.getPLEventGuestsByLocationAndType(
          locationUid,
          { type: 'upcoming', limit: 6, page: 1 },
          null
      );

      const total = rows?.length ? Number(rows[0]?.count ?? 0) : 0;
      const topAttendees: TopAttendee[] = (rows ?? []).slice(0, 6).map((r) => {
        const eventsLen = Array.isArray(r?.events) ? r.events.length : 0;
        return {
          memberUid: r.memberUid,
          imageUrl: r?.member?.image?.url ?? null,
          displayName: r?.member?.name ?? null,
          eventsCount: eventsLen > 0 ? eventsLen : 1,
        };
      });

      return { total, topAttendees };
    } catch (e) {
      this.logger.warn(
          `[candidates] failed to compute attendees via IRL page logic for locationUid=${locationUid}: ${String(e)}`
      );
      return { total: 0, topAttendees: [] };
    }
  }

  private async patchExistingPayloadWithFreshAttendees(existing: any, gatheringUid: string): Promise<any> {
    const attendees = await this.computeAttendeesUsingIrlPage(gatheringUid);

    const next = {
      ...(existing ?? {}),
      version: this.payloadVersion,
      gatheringUid,
      attendees: {
        ...(existing?.attendees ?? {}),
        total: attendees.total,
        topAttendees: attendees.topAttendees,
      },
      ui: {
        ...(existing?.ui ?? {}),
        locationUid: gatheringUid,
      },
    };

    const startIso: string | null | undefined = existing?.events?.dates?.start ?? null;
    next.ui = {
      ...(next.ui ?? {}),
      startsLabel: this.startsLabelFromIso(startIso),
      daysToStart: this.daysUntil(startIso) ?? 0,
    };

    return next;
  }

  private async buildLocationPayload(gatheringUid: string, displayCandidates: CandidateRow[], cfg: ActiveDbConfig): Promise<any> {
    const displayEventUids = [...new Set(displayCandidates.map((c) => c.eventUid).filter(Boolean))];

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

    const displayEvents = await this.prisma.pLEvent.findMany({
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
    });

    const attendeeCountByEventUid = new Map<string, number>();
    for (const c of displayCandidates) attendeeCountByEventUid.set(c.eventUid, c.attendeeCount);

    const eventSummaries = displayEvents.map((ev) => ({
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

    const attendees = await this.computeAttendeesUsingIrlPage(gatheringUid);

    // Total events shown on IRL schedule UI (not candidate-limited): endDate >= now
    const scheduleTotalEvents = await this.prisma.pLEvent.count({
      where: {
        isDeleted: false,
        locationUid: gatheringUid,
        endDate: { gte: new Date() },
      },
    });

    return {
      version: this.payloadVersion,
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
            resources: this.normalizeResources((location as any).resources),
          }
          : null,
      events: {
        total: scheduleTotalEvents,
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
        startsLabel: this.startsLabelFromIso(dateStart),
        daysToStart: this.daysUntil(dateStart) ?? 0,
      },
    };
  }
}
