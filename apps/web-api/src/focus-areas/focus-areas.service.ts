import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { TeamsService } from '../teams/teams.service'; 
import { ProjectsService } from '../projects/projects.service';
import { PROJECT, TEAM } from '../utils/constants';
@Injectable()
export class FocusAreasService {
  constructor(private prisma: PrismaService, private teamsService: TeamsService, private projectService: ProjectsService) {}

  async findAll(query) {
    const { type } = query;
    const result = await this.prisma.focusArea.findMany({
      include: {
        children: this.buildQueryByLevel(4, type, query), // level denotes depth of children.
        ...this.buildAncestorFocusAreasFilterByType(type, query)
      }
    });
    return result;
  }

  private buildQueryByLevel(level: number, type, query) {
    if (level === 0) {
      return {
        include: {
          children: true,
          ...this.buildAncestorFocusAreasFilterByType(type, query)
        },
        orderBy: {
          createdAt: "desc"
        }
      };
    }
    return {
      include: {
        children: this.buildQueryByLevel(level - 1, type, query),
        ...this.buildAncestorFocusAreasFilterByType(type, query)
      },
      orderBy: {
        createdAt: "desc"
      }
    };
  }

  buildAncestorFocusAreasFilterByType(type, query):any {
    if (type === TEAM) {
      return  {
        teamAncestorFocusAreas: {
          where: {
            team: {
              ...this.buildTeamFilter(query)
            }
          },
          select: {
            team: {
              select: {
                uid: true,
                name: true,
                logo: true
              }
            }
          },
          distinct: "teamUid"
        }
      }
    }
    if (type === PROJECT) {
      return {
        projectAncestorFocusAreas: {
          where: {
            project: {
              ...this.buildProjectFilter(query)
            }
          },
          select: {
            project: {
              select: {
                uid: true,
                name: true,
                logo: true
              }
            }
          },
          distinct: "projectUid"
        }
      }
    }
    return {}
  }
  
  buildTeamFilter(queryParams) {
    return this.teamsService.buildTeamFilter(queryParams);
  }

  buildProjectFilter(queryParams) {
    return this.projectService.buildProjectFilter(queryParams);
  }
}
