import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { IrlGatheringPushRuleKind } from '@prisma/client';
import { IrlGatheringPushConfigService } from './irl-gathering-push-config.service';

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
   * - event.startDate is in the future
   * - event.startDate <= now + upcomingWindowDays
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
      countByEventUid.set(row.eventUid, row._count._all);
    }

    this.logger.log('[candidates] building upsert/delete operations...');
    const upserts: Promise<any>[] = [];
    const deletes: Promise<any>[] = [];

    for (const ev of events) {
      const attendeeCount = countByEventUid.get(ev.uid) ?? 0;

      const hasGathering = Boolean(ev.locationUid);
      const startDate = ev.startDate ? new Date(ev.startDate) : null;

      const isFuture = !!startDate && startDate.getTime() > now.getTime();
      const withinUpcomingWindow = !!startDate && startDate.getTime() <= windowEnd.getTime();
      const meetsThreshold = attendeeCount >= cfg.minAttendeesPerEvent;

      const qualifies = hasGathering && isFuture && withinUpcomingWindow && meetsThreshold;

      this.logger.log(
        `[candidates] evaluate event=${ev.uid} ` +
        `hasGathering=${hasGathering} ` +
        `startDate=${startDate ? startDate.toISOString() : 'null'} ` +
        `isFuture=${isFuture} withinUpcomingWindow=${withinUpcomingWindow} ` +
        `attendeeCount=${attendeeCount} meetsThreshold=${meetsThreshold} qualifies=${qualifies}`
      );

      if (qualifies) {
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
              attendeeCount,
              processedAt: null,
              isSuppressed: false,
            },
            update: {
              gatheringUid: ev.locationUid!,
              eventStartDate: ev.startDate,
              attendeeCount,
              processedAt: null,
            },
          })
        );

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
              attendeeCount,
              processedAt: null,
              isSuppressed: false,
            },
            update: {
              gatheringUid: ev.locationUid!,
              eventStartDate: ev.startDate,
              attendeeCount,
              processedAt: null,
            },
          })
        );

        this.logger.log(`[candidates] event=${ev.uid} qualifies -> scheduling UPSERT (UPCOMING + REMINDER)`);
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
}
