import { 
  Injectable,
  InternalServerErrorException
} from '@nestjs/common';
import { MembersService } from '../members/members.service';
import { TeamsService } from '../teams/teams.service';
import { PLEventsService } from '../pl-events/pl-events.service';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class HomeService {
  constructor(
    private memberService: MembersService,
    private teamsService: TeamsService,
    private plEventsService: PLEventsService,
    private projectsService: ProjectsService
  ) {}

  async fetchAllFeaturedData() {
    try {
      return {
        members: await this.memberService.findAll({
          where: { isFeatured: true },
          include: {
            image: true,
            location: true,
            skills: true,
            teamMemberRoles: {
              include: {
                team: {
                  include: { logo: true },
                },
              },
            },
          },
        }),
        teams: await this.teamsService.findAll({
          where: { isFeatured: true },
          include: { logo: true }
        }),
        events: await this.plEventsService.getPLEvents({ where: { isFeatured: true } }),
        projects: await this.projectsService.getProjects({ where: { isFeatured: true } }),
      };
    } catch (error) {
      throw new InternalServerErrorException(`Error occured while retrieving featured data: ${error.message}`);
    }
  }
}
