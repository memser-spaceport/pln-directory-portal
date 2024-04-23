import { Module } from '@nestjs/common';
import { FocusAreaController } from './focus-areas.controller';
import { FocusAreasService } from './focus-areas.service';
import { TeamsModule } from '../teams/teams.module'; 
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports :[TeamsModule, ProjectsModule],
  controllers: [FocusAreaController],
  providers: [FocusAreasService],
})
export class FocusAreasModule {}
