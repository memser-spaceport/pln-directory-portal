import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class FocusAreasService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: Prisma.FocusAreaFindManyArgs) {
    const teamFilter : any = query.where?.teams?.some || {};
    const result = await this.prisma.focusArea.findMany({
      include: {
        children: this.buildQueryByLevel(5, teamFilter), // level denotes depth of children.
        teams: {
          where: {
            ...teamFilter
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
          teams: {
            where: {
              ...teamFilter
            }
          }
        }
      };
    }
    return {
      include: {
        children: this.buildQueryByLevel(level - 1, teamFilter),
        teams: {
          where: {
            ...teamFilter
          }
        }
      }
    };
  }

  extractSelectedAreas(data, parentUid = null) {
    const selectedAreas:any = [];
    const filteredData = data.filter(item => item.parentUid === parentUid);
    filteredData.forEach((item:any) => {
      const children = data.filter(child => child.parentUid === item.uid);
      if (children.length === 0) {
        selectedAreas.push(item.title);
      } else {
        selectedAreas.push(...this.extractSelectedAreas(data, item.uid));
      }
    });
    return selectedAreas;
  }
}
