import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { TeamsService } from '../teams/teams.service';
import { ProjectsService } from '../projects/projects.service';
import { PROJECT, TEAM } from '../utils/constants';

type FocusAreaNode = {
  projectAncestorFocusAreas?: unknown[];
  children?: FocusAreaNode[] | unknown;
  projectCount?: number;
  [field: string]: unknown;
};

@Injectable()
export class FocusAreasService {
  constructor(
    private prisma: PrismaService,
    private teamsService: TeamsService,
    private projectService: ProjectsService
  ) {}

  async findAll(query) {
    const { type } = query;
    const result = await this.prisma.focusArea.findMany({
      select: {
        uid: true,
        title: true,
        description: true,
        parentUid: true,
        children: this.buildQueryByLevel(4, type, query), // level denotes depth of children.
        ...this.buildAncestorFocusAreasFilterByType(type, query),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    if (type === PROJECT) {
      return this.addProjectCount(result);
    }
    return result;
  }

  /**
   * Adds `projectCount` to every focus area and nested child that carries `projectAncestorFocusAreas`.
   * That list is already filtered (deleted projects excluded, project filters applied), holds one row per
   * project (distinct projectUid) and includes the projects of child focus areas (ancestor rows).
   */
  private addProjectCount(focusAreas: FocusAreaNode[]): FocusAreaNode[] {
    return focusAreas.map((focusArea) => {
      const withCount: FocusAreaNode = Array.isArray(focusArea.projectAncestorFocusAreas)
        ? { ...focusArea, projectCount: focusArea.projectAncestorFocusAreas.length }
        : { ...focusArea };
      if (Array.isArray(focusArea.children)) {
        withCount.children = this.addProjectCount(focusArea.children);
      }
      return withCount;
    });
  }

  private buildQueryByLevel(level: number, type, query) {
    if (level === 0) {
      return {
        select: {
          uid: true,
          title: true,
          description: true,
          parentUid: true,
          children: true,
          ...this.buildAncestorFocusAreasFilterByType(type, query),
        },
        orderBy: {
          createdAt: 'desc',
        },
      };
    }
    return {
      select: {
        uid: true,
        title: true,
        description: true,
        parentUid: true,
        children: this.buildQueryByLevel(level - 1, type, query),
        ...this.buildAncestorFocusAreasFilterByType(type, query),
      },
      orderBy: {
        createdAt: 'desc',
      },
    };
  }

  buildAncestorFocusAreasFilterByType(type, query): any {
    if (type?.toLowerCase() === TEAM.toLowerCase()) {
      const { plnFriend } = query;
      const teamWhereClause: any = {
        accessLevel: {
          not: 'L0',
        },
      };

      // Add plnFriend filter only if explicitly specified
      if (plnFriend !== undefined) {
        teamWhereClause.plnFriend = plnFriend === 'true';
      }

      return {
        teamAncestorFocusAreas: {
          where: {
            team: teamWhereClause,
          },
          select: {
            team: {
              select: {
                uid: true,
                name: true,
                logo: {
                  select: {
                    url: true,
                  },
                },
              },
            },
          },
          distinct: 'teamUid',
        },
      };
    }
    if (type === PROJECT) {
      return {
        projectAncestorFocusAreas: {
          where: {
            project: {
              ...this.buildProjectFilter(query),
            },
          },
          select: {
            project: {
              select: {
                uid: true,
                name: true,
                logo: {
                  select: {
                    url: true,
                  },
                },
              },
            },
          },
          distinct: 'projectUid',
        },
      };
    }
    return {};
  }

  buildTeamFilter(queryParams) {
    return this.teamsService.buildTeamFilter(queryParams);
  }

  buildProjectFilter(queryParams) {
    return this.projectService.buildProjectFilter(queryParams);
  }
}
