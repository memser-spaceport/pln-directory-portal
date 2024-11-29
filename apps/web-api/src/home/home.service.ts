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
  ) { }

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

  /**
   * Retrieves a list of teams and projects based on search term.
   * Builds a Prisma query from the queryable fields and adds filters for team and project name.
   * 
   * @param request - HTTP request object containing query parameters
   * @returns Array of projects and teams.
   */
  async fetchTeamsAndProjects(queryParams) {
    let result: any[] = []
    const entities: string[] = queryParams.include?.split(",");
    if (entities.includes('teams')) {
      const resultantTeams = await this.fetchTeamsBySearchTerm(queryParams.name);
      resultantTeams.teams.forEach((team) => result.push({ ...team, category: "TEAM" }));
    }
    if (entities.includes('projects')) {
      const resultantProjects = await this.fetchProjectsBySearchTerm(queryParams.name);
      resultantProjects?.projects.forEach((project) => result.push({ ...project, category: "PROJECT" }));
    }
    return [...result].sort((team, project) => team.name.localeCompare(project.name))
  }

  private fetchTeamsBySearchTerm(name) {
    return this.teamsService.findAll({
      where: {
        name: {
          startsWith: name,
          mode: 'insensitive'
        }
      },
      select: {
        uid: true,
        name: true,
        logo: {
          select: {
            url: true,
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    })
  }

  private fetchProjectsBySearchTerm(name) {
    return this.projectsService.getProjects({
      where: {
        name: {
          startsWith: name,
          mode: 'insensitive'
        }
      },
      select: {
        uid: true,
        name: true,
        logo: {
          select: {
            url: true,
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    })
  }
}
