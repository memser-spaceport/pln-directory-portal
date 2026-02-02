import { forwardRef, Module } from '@nestjs/common';
import { SqsModule } from '@ssut/nestjs-sqs';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsConsumer } from './events.consumer';
import { PLEventsModule } from '../pl-events/pl-events.module';
import { EventsToolingService } from './events-tooling.service';
import { EventConsumerHelper } from './event-consumer.helper';
import { EventGuestSyncHelper } from './event-guests-sync.helper';
import { SharedModule } from '../shared/shared.module';
import { AuthModule }  from '../auth/auth.module';
import { MembersModule } from '../members/members.module';
import { TeamsModule } from '../teams/teams.module';

@Module({
  controllers: [EventsController],
  providers: [EventsService, EventsToolingService, EventsConsumer, EventConsumerHelper, EventGuestSyncHelper],
  imports: [
    SqsModule.register({
      consumers: [
        {
          name: 'events',
          queueUrl: process.env.EVENTS_QUEUE_URL || '',
          region: process.env.AWS_REGION,
          pollingWaitTimeMs: (process.env.POLLING_INTERVAL as unknown as number) || 5000
        },
      ],
      producers: [],
    }),
    forwardRef(() => PLEventsModule),
    forwardRef(() => AuthModule),
    forwardRef(() => MembersModule),
    forwardRef(() => TeamsModule),
    SharedModule,
  ],
  exports: [EventsToolingService, EventsService]
})
export class EventsModule {}
