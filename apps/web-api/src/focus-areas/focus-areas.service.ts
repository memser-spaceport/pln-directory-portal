import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { TeamsService } from '../teams/teams.service'; 
import { ProjectsService } from '../projects/projects.service';
@Injectable()
export class FocusAreasService {
  constructor(private prisma: PrismaService, private teamsService: TeamsService, private projectService: ProjectsService) {}

  async findAll(teamFilter, projectFilter) {
    const result = await this.prisma.focusArea.findMany({
      include: {
        children: this.buildQueryByLevel(4, teamFilter, projectFilter), // level denotes depth of children.
        teamAncestorFocusAreas: {
          where: {
            team: {
              ...teamFilter
            }
          },
          distinct: "teamUid"
        },
        projectAncestorFocusAreas: {
          where: {
            project: {
              ...projectFilter
            }
          },
          distinct: "projectUid"
        }
      }
    });
    return result;
  }

  private buildQueryByLevel(level: number, teamFilter, projectFilter) {
    if (level === 0) {
      return {
        include: {
          children: true,
          teamAncestorFocusAreas: {
            where: {
              team: {
                ...teamFilter
              }
            },
            distinct: "teamUid"
          },
          projectAncestorFocusAreas: {
            where: {
              project: {
                ...projectFilter
              }
            },
            distinct: "projectUid"
          }
        }
      };
    }
    return {
      include: {
        children: this.buildQueryByLevel(level - 1, teamFilter, projectFilter),
        teamAncestorFocusAreas: {
          where: {
            team: {
              ...teamFilter
            }
          },
          distinct: "teamUid"
        },
        projectAncestorFocusAreas: {
          where: {
            project: {
              ...projectFilter
            }
          },
          distinct: "projectUid"
        }
      }
    };
  }
  
  buildTeamFilter(queryParams) {
    return this.teamsService.buildTeamFilter(queryParams);
  }

  buildProjectFilter(queryParams) {
    return this.projectService.buildProjectFilter(queryParams);
  }
}
