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
    const uniqueEventUids = [...new Set((eventUids ?? []).filter(Boolean))];
    if (uniqueEventUids.length === 0) return;

    const cfg = (await this.configService.getActiveConfigOrNull()) as ActiveDbConfig | null;
    if (!cfg || !cfg.enabled) return;

    const now = new Date();
    const windowEnd = new Date(now.getTime() + cfg.upcomingWindowDays * 24 * 60 * 60 * 1000);

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

      const notEnded = !!endDate && endDate.getTime() >= now.getTime();
      const withinUpcomingWindow = !!endDate && endDate.getTime() <= windowEnd.getTime();
      const meetsThreshold = attendeeCount >= cfg.minAttendeesPerEvent;

      const qualifiesUpcoming = hasGathering && notEnded && withinUpcomingWindow && meetsThreshold;

      const notStartedYet = !!startDate && startDate.getTime() > now.getTime();
      const qualifiesReminder = qualifiesUpcoming && notStartedYet;

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
            },
          })
        );

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
      } else {
        deletes.push(
          this.prisma.irlGatheringPushCandidate.deleteMany({
            where: { ruleKind: { in: [IrlGatheringPushRuleKind.UPCOMING, IrlGatheringPushRuleKind.REMINDER] }, eventUid: ev.uid },
          })
        );
      }
    }

    await Promise.all([...upserts, ...deletes]);
  }

  /**
   * Convenience wrapper used by write-paths (guest create/update/delete for events).
   * - refreshes candidates for those events
   * - refreshes already-sent IRL_GATHERING pushes for impacted locations
   *
   * IMPORTANT: does NOT create new notifications and does NOT reset read statuses.
   */
  async refreshCandidatesForEventsAndUpdateNotifications(eventUids: string[]): Promise<void> {
    await this.refreshCandidatesForEvents(eventUids);
    await this.updateAlreadySentNotificationsForEvents(eventUids);
  }

  /**
   * When a guest is created/updated/deleted at a location WITHOUT eventUid (location-level attendee),
   * we still need to update attendee counters for already-sent IRL_GATHERING pushes for this location.
   *
   * IMPORTANT: does NOT create any new notifications and does NOT reset read statuses.
   */
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

  /**
   * Rebuilds payload for already-sent IRL_GATHERING notifications for a location.
   * - Keeps the same ruleKind of the existing push
   * - Updates metadata/title/description only
   * - Never creates new pushes
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

      // Candidates we should show in notification payload (display events).
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

      if (candidates.length === 0) continue;

      const payload = await this.buildLocationPayload(locationUid, candidates, cfg);

      // Titles per design. Description always location.description (or default same as announcement).
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

    if (Array.isArray(raw)) {
      return raw.map(tryParse).filter(Boolean);
    }
    if (typeof raw === 'string') {
      const p = tryParse(raw);
      return p == null ? [] : Array.isArray(p) ? p : [p];
    }
    return [raw];
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

  private async computeAttendeesForLocation(params: {
    locationUid: string;
    attendeeEventUids: string[];
    windowStartIso: string | null;
    windowEndIso: string | null;
  }): Promise<{ total: number; topAttendees: TopAttendee[] }> {
    const { locationUid, attendeeEventUids, windowStartIso, windowEndIso } = params;

    const distinctEventAttendees = attendeeEventUids.length
      ? await this.prisma.pLEventGuest.findMany({
          where: {
            eventUid: { in: attendeeEventUids },
            member: { accessLevel: { notIn: ['L0', 'L1', 'Rejected'] } },
          },
          distinct: ['memberUid'],
          select: { memberUid: true },
        })
      : [];

    const locationOnlyGuests = await this.prisma.pLEventGuest.findMany({
      where: {
        locationUid,
        eventUid: null,
        member: { accessLevel: { notIn: ['L0', 'L1', 'Rejected'] } },
      },
      select: { memberUid: true, additionalInfo: true, createdAt: true },
    });

    const windowStart = windowStartIso ? new Date(windowStartIso) : null;
    const windowEnd = windowEndIso ? new Date(windowEndIso) : null;

    const locationOnlyAttendeeUids = new Set<string>();

    if (windowStart && windowEnd) {
      for (const g of locationOnlyGuests) {
        const ai: any = g.additionalInfo ?? {};
        const checkIn = this.parseYmdToUtcDate(ai?.checkInDate);
        const checkOut = this.parseYmdToUtcDate(ai?.checkOutDate);

        if (!checkIn && !checkOut) {
          locationOnlyAttendeeUids.add(g.memberUid);
          continue;
        }

        const gStart = checkIn ?? (checkOut as Date);
        const gEnd = checkOut ?? (checkIn as Date);

        if (this.overlaps(gStart, gEnd, windowStart, windowEnd)) locationOnlyAttendeeUids.add(g.memberUid);
      }
    } else {
      for (const g of locationOnlyGuests) locationOnlyAttendeeUids.add(g.memberUid);
    }

    const allAttendeeUids = new Set<string>(distinctEventAttendees.map((a) => a.memberUid));
    for (const uid of locationOnlyAttendeeUids) allAttendeeUids.add(uid);
    const total = allAttendeeUids.size;

    const topEventCounts = attendeeEventUids.length
      ? await this.prisma.pLEventGuest.groupBy({
          by: ['memberUid'],
          where: {
            eventUid: { in: attendeeEventUids },
            member: { accessLevel: { notIn: ['L0', 'L1', 'Rejected'] } },
          },
          _count: { eventUid: true },
          orderBy: { _count: { eventUid: 'desc' } },
          take: 50,
        })
      : [];

    const countsByMember = new Map<string, number>();
    for (const row of topEventCounts) countsByMember.set(row.memberUid, row._count.eventUid);
    for (const uid of locationOnlyAttendeeUids) countsByMember.set(uid, (countsByMember.get(uid) ?? 0) + 1);

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
      const m = memberByUid.get(row.memberUid);
      return {
        memberUid: row.memberUid,
        eventsCount: row.eventsCount,
        imageUrl: m?.image?.url ?? null,
        displayName: m?.name ?? null,
      };
    });

    return { total, topAttendees };
  }

  /**
   * Build payload used by FE modal.
   *
   * IMPORTANT FIX:
   * - attendees.total must reflect the UPCOMING window for the location (same as IRL page)
   *   so REMINDER and UPCOMING pushes show consistent totals.
   */
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

    // Attendee window = UPCOMING events in window (same as page).
    const now = new Date();
    const windowEndUpcoming = new Date(now.getTime() + cfg.upcomingWindowDays * 24 * 60 * 60 * 1000);

    const attendeeEvents = await this.prisma.pLEvent.findMany({
      where: {
        isDeleted: false,
        locationUid: gatheringUid,
        endDate: { gte: now, lte: windowEndUpcoming },
      },
      select: { uid: true, startDate: true, endDate: true },
      orderBy: [{ startDate: 'asc' }],
    });

    const attendeeEventUids = attendeeEvents.map((e) => e.uid);
    const windowStartIso = attendeeEvents.length ? attendeeEvents[0].startDate.toISOString() : dateStart;
    const windowEndIso = attendeeEvents.length ? attendeeEvents[attendeeEvents.length - 1].endDate.toISOString() : dateEnd;

    const attendees = await this.computeAttendeesForLocation({
      locationUid: gatheringUid,
      attendeeEventUids,
      windowStartIso,
      windowEndIso,
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
        total: eventSummaries.length,
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
