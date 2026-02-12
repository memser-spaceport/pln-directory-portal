import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SqsService } from '@ssut/nestjs-sqs';
import { PrismaService } from '../../shared/prisma.service';
import { ExternalEventProvider } from '@prisma/client';
import { 
  PLEventGuestSyncMessage, 
  SyncableEvent 
} from './pl-event-guest-sync.interface';

/**
 * Scheduler service for PLEvent guest synchronization
 * Runs on a configurable CRON schedule and enqueues events for processing
 */
@Injectable()
export class PLEventGuestSyncScheduler {
  private readonly logger = new Logger(PLEventGuestSyncScheduler.name);
  private readonly queueName = process.env.PL_EVENT_GUEST_SYNC_QUEUE_NAME ?? 'pl-event-guest-sync';

  constructor(
    private readonly prisma: PrismaService,
    private readonly sqsService: SqsService,
  ) {}

  /**
   * CRON job that finds syncable events and enqueues them for processing
   * Runs at the configured schedule (default: 3 AM UTC daily)
   * Set PL_EVENT_GUEST_SYNC_CRON env var to customize
   */
  @Cron(process.env.PL_EVENT_GUEST_SYNC_CRON ?? '0 3 * * *', {
    name: 'PLEventGuestSyncScheduler',
    timeZone: 'UTC',
  })
  async enqueueEventsForSync(): Promise<void> {
    if (process.env.PL_EVENT_GUEST_SYNC_ENABLED !== 'true') {
      this.logger.log('[PLEventGuestSync] Scheduler disabled. Skipping.');
      return;
    }
    this.logger.log('[PLEventGuestSync] Starting event enqueue job');
    try {
      const events = await this.getSyncableEvents();
      this.logger.log(`[PLEventGuestSync] Found ${events.length} events to sync`);
      let enqueuedCount = 0;
      for (const event of events) {
        const message: PLEventGuestSyncMessage = {
          eventUid: event.uid,
          externalEventId: event.externalEventId,
          locationUid: event.locationUid,
          providerType: event.providerType,
        };
        await this.sqsService.send(this.queueName, {
          id: event.uid,
          body: message,
          groupId: event.uid,
          deduplicationId: `${event.uid}-${Date.now()}`,
        });
        enqueuedCount++;
      }
      this.logger.log(`[PLEventGuestSync] Enqueued ${enqueuedCount} events`);
    } catch (error) {
      this.logger.error(`[PLEventGuestSync] Enqueue failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Queries events that are eligible for guest sync
   * Criteria:
   * - Has external guest provider configured
   * - Has external event ID
   * - Has location association
   * - Event end date is in the future (not past events)
   * - Event is not deleted
   */
  private async getSyncableEvents(): Promise<SyncableEvent[]> {
    const events = await this.prisma.pLEvent.findMany({
      where: {
        externalEventProvider: { not: null },
        externalEventId: { not: null },
        locationUid: { not: null },
        endDate: { gt: new Date() },
        isDeleted: false,
      },
      select: {
        uid: true,
        locationUid: true,
        externalEventProvider: true,
        externalEventId: true,
      },
    });
    return events.map(event => ({
      uid: event.uid,
      locationUid: event.locationUid!,
      externalEventId: event.externalEventId!,
      providerType: event.externalEventProvider as ExternalEventProvider,
    }));
  }
}

