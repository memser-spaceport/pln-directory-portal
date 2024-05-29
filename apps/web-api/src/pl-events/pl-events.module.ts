import { Module } from '@nestjs/common';
import { PLEventsController } from './pl-events.controller';
import { PLEventsService } from './pl-events.service';
import { MembersModule } from '../members/members.module';
import { TeamsModule } from '../teams/teams.module';


@Module({
  controllers: [PLEventsController],
  providers: [
    PLEventsService,
  ],
  imports:[MembersModule,  TeamsModule]
})
export class PLEventsModule {}
