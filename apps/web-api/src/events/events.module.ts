import { forwardRef, Module } from '@nestjs/common';
import { SqsModule } from '@ssut/nestjs-sqs';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsConsumer } from './events.consumer';
import { PLEventsModule } from '../pl-events/pl-events.module';
import { EventsToolingService } from './events-tooling.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService, EventsToolingService, EventsConsumer],
  imports: [
    forwardRef(() => PLEventsModule),
    SqsModule.register({
      consumers: [
        {
          name: 'events',
          queueUrl: process.env.AWS_SQS_EVENTS_QUEUE_URL || '',
          region: process.env.AWS_REGION,
        },
      ],
      producers: [],
    }),
  ],
  exports: [EventsToolingService, EventsService]
})
export class EventsModule {}
