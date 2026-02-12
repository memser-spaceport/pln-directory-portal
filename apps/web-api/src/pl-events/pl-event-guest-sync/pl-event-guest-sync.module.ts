import { forwardRef, Module } from '@nestjs/common';
import { SqsModule } from '@ssut/nestjs-sqs';
import { PLEventGuestSyncScheduler } from './pl-event-guest-sync.scheduler';
import { PLEventGuestSyncConsumer } from './pl-event-guest-sync.consumer';
import { PLEventGuestSyncService } from './pl-event-guest-sync.service';
import { PLEventGuestMatchingService } from './pl-event-guest-matching.service';
import { GuestProviderFactory } from './providers/guest-provider.factory';
import { LumaGuestProvider } from '../../utils/luma/luma-guest.provider';
import { LumaApiService } from '../../utils/luma/luma-api.service';
import { PLEventsModule } from '../pl-events.module';
import { MembersModule } from '../../members/members.module';

const QUEUE_NAME = process.env.PL_EVENT_GUEST_SYNC_QUEUE_NAME ?? 'pl-event-guest-sync';
const QUEUE_URL = process.env.PL_EVENT_GUEST_SYNC_QUEUE_URL ?? '';
const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';
const CONSUMER_ENABLED = process.env.PL_EVENT_GUEST_SYNC_CONSUMER_ENABLED === 'true';

/**
 * Module for PLEvent guest synchronization from external providers
 * 
 * Features:
 * - CRON-based scheduler to enqueue events for sync
 * - SQS consumer to process sync messages
 * - Provider-agnostic architecture (currently supports LUMA)
 * - Email-based member matching
 * - Duplicate prevention
 * 
 * Environment Variables:
 * - PL_EVENT_GUEST_SYNC_ENABLED: Master toggle
 * - PL_EVENT_GUEST_SYNC_CONSUMER_ENABLED: Consumer toggle
 * - PL_EVENT_GUEST_SYNC_CRON: Scheduler cron expression
 * - PL_EVENT_GUEST_SYNC_QUEUE_NAME: SQS queue name
 * - PL_EVENT_GUEST_SYNC_QUEUE_URL: SQS queue URL
 */
@Module({
  imports: [
    // Import PLEventsModule for IrlGatheringPushCandidatesService
    forwardRef(() => PLEventsModule),
    // Import MembersModule for MembersService (bulk member lookup)
    forwardRef(() => MembersModule),
    // Register SQS with both consumer and producer
    SqsModule.register({
      consumers: CONSUMER_ENABLED ? [
        {
          name: QUEUE_NAME,
          queueUrl: QUEUE_URL,
          region: AWS_REGION,
          pollingWaitTimeMs: 5000,
        },
      ] : [],
      producers: [
        {
          name: QUEUE_NAME,
          queueUrl: QUEUE_URL,
          region: AWS_REGION,
        },
      ],
    }),
  ],
  controllers: [],
  providers: [
    // Core services
    PLEventGuestSyncScheduler,
    PLEventGuestSyncConsumer,
    PLEventGuestSyncService,
    PLEventGuestMatchingService,
    
    // Provider infrastructure
    GuestProviderFactory,
    
    // LUMA provider (add more providers here)
    LumaGuestProvider,
    LumaApiService,
  ],
  exports: [
    PLEventGuestSyncService,
    GuestProviderFactory,
  ],
})
export class PLEventGuestSyncModule {}

