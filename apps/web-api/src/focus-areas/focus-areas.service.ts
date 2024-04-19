import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { TeamsService } from '../teams/teams.service'; 
@Injectable()
export class FocusAreasService {
  constructor(private prisma: PrismaService, private teamsService: TeamsService) {}

  async findAll(filter) {
    const result = await this.prisma.focusArea.findMany({
      include: {
        children: this.buildQueryByLevel(4, filter), // level denotes depth of children.
        teamAncestorFocusAreas: {
          where: {
            team: {
              ...filter
            }
          },
          distinct: "teamUid"
        }
      }
    });
    return result;
  }

  private buildQueryByLevel(level: number, teamFilter) {
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
          }
        }
      };
    }
    return {
      include: {
        children: this.buildQueryByLevel(level - 1, teamFilter),
        teamAncestorFocusAreas: {
          where: {
            team: {
              ...teamFilter
            }
          },
          distinct: "teamUid"
        }
      }
    };
  }
  
  buildTeamFilter(queryParams) {
    return this.teamsService.buildTeamFilter(queryParams);
  }
}
