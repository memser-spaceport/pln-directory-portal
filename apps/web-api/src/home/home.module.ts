import { Module } from '@nestjs/common';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';
import { MembersModule } from '../members/members.module';
import { TeamsModule } from '../teams/teams.module';
import { ProjectsModule} from '../projects/projects.module';
import { PLEventsModule } from '../pl-events/pl-events.module';
import { HuskyModule } from '../husky/husky.module';

@Module({
  controllers: [HomeController],
  providers: [
    HomeService
  ],
  imports:[
    MembersModule,
    TeamsModule,
    ProjectsModule,
    PLEventsModule,
    HuskyModule
  ],
  exports: [
    HomeService
  ]
})
export class  HomeModule {}
