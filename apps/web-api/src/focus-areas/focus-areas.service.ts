import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class FocusAreasService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: any) {
    const teamFilter = query.where?.team || {};
    const result = await this.prisma.focusArea.findMany({
      include: {
        children: this.buildQueryByLevel(5, teamFilter), // level denotes depth of children.
        teamAncestorFocusAreas: {
          where: {
            team: {
              ...teamFilter
            }
          }
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
            }
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
          }
        }
      }
    };
  }

  removeDuplicateFocusAreas(focusAreas): any {
    const uniqueFocusAreas = {};
    focusAreas.forEach(item => {
        const uid = item.focusArea.uid;
        const title = item.focusArea.title;
        uniqueFocusAreas[uid] = { uid, title };
    });
    return Object.values(uniqueFocusAreas);
  }
}
