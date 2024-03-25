import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class FocusAreasService {
  constructor(private prisma: PrismaService) {}

  async findAll(isPlnFriend) {
    const result = await this.prisma.focusArea.findMany({
      include: {
        children: this.buildQueryByLevel(5, isPlnFriend), // level denotes depth of children.
        teams: {
          where: isPlnFriend === "true" ?  { } : { plnFriend: false },
          select: {
            uid: true
          }
        },
      }
    });
    return result;
  }

  private buildQueryByLevel(level: number, isPlnFriend) {
    if (level === 0) {
      return {
        include: {
          children: true,
          teams: {
            where: isPlnFriend === "true" ?  { } : { plnFriend: false },
            select: {
              uid: true
            }
          }
        }
      };
    }
    return {
      include: {
        children: this.buildQueryByLevel(level - 1, isPlnFriend),
        teams: {
          where: isPlnFriend === "true" ?  { } : { plnFriend: false },
          select: {
            uid: true
          }
        }
      }
    };
  }
}