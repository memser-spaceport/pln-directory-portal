import { Module } from '@nestjs/common';
import { PLEventsController } from './pl-events.controller';
import { PLEventLocationsService } from './pl-event-locations.service';
import { PLEventsService } from './pl-events.service';
import { PLEventGuestsService } from './pl-event-guests.service';
import { MembersModule } from '../members/members.module';

@Module({
  controllers: [PLEventsController],
  providers: [
    PLEventsService,
    PLEventLocationsService,
    PLEventGuestsService
  ],
  exports: [
    PLEventsService,
    PLEventLocationsService,
    PLEventGuestsService
  ],
  imports:[MembersModule]
})
export class PLEventsModule {}
