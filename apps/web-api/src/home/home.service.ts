import {
  Injectable,
  InternalServerErrorException
} from '@nestjs/common';
import { MembersService } from '../members/members.service';
import { TeamsService } from '../teams/teams.service';
import { PLEventsService } from '../pl-events/pl-events.service';
import { ProjectsService } from '../projects/projects.service';
import { PLEventGuestsService } from '../pl-events/pl-event-guests.service';
import { PLEventLocationsService } from '../pl-events/pl-event-locations.service';
@Injectable()
export class HomeService {
  constructor(
    private memberService: MembersService,
    private teamsService: TeamsService,
    private plEventsService: PLEventsService,
    private projectsService: ProjectsService,
    private plEventLocationService: PLEventLocationsService
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
        locations: await this.plEventLocationService.getPLEventLocations({ where: { isFeatured: true } }),
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

  /**
   * Retrieves a list of teams based on search term.
   * Builds a Prisma query from the queryable fields and adds filters for team name.
   * 
   * @param name - name of the team to be searched for.
   * @returns Array of resultant teams.
   */
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

  /**
   * Retrieves a list of projects based on search term.
   * Builds a Prisma query from the queryable fields and adds filters for project name.
   * 
   * @param name - name of the project to be searched for.
   * @returns Array of resultant projects.
   */
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
