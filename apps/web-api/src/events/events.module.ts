import { forwardRef, Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { PLEventsModule } from '../pl-events/pl-events.module';
import { EventsToolingService } from './events-tooling.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService, EventsToolingService],
  imports: [forwardRef(() => PLEventsModule)],
  exports: [EventsToolingService]
})
export class EventsModule {}
