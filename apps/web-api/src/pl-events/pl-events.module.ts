import { Module } from '@nestjs/common';
import { PLEventsController } from './pl-events.controller';
import { PLEventsService } from './pl-events.service';
import { MembersModule } from '../members/members.module';


@Module({
  controllers: [PLEventsController],
  providers: [
    PLEventsService,
  ],
  imports:[MembersModule]
})
export class PLEventsModule {}
