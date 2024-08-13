import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { MembersService } from '../members/members.service';
import { TeamsService } from '../teams/teams.service';
import { PLEventsService } from '../pl-events/pl-events.service';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class HomeService {
  constructor(
    private logger: LogService,
    private memberService: MembersService,
    private teamsService: TeamsService,
    private plEventsService: PLEventsService,
    private projectsService: ProjectsService
  ) {}

  async fetchAllFeaturedData() {
    try {
      const filter = { where : { isFeatured: true }}
      return {
        members: await this.memberService.findAll(filter),
        teams: await this.teamsService.findAll(filter),
        events: await this.plEventsService.getPLEvents(filter),
        projects: await this.projectsService.getProjects(filter)
      };
    }
    catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException('Failed to fetch featured data');
    }
  }
}