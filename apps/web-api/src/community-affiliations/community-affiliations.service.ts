import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { TEAM } from '../utils/constants';

@Injectable()
export class CommunityAffiliationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: any) {
    const { type } = query;
    return this.prisma.communityAffiliation.findMany({
      select: {
        uid: true,
        title: true,
        ...this.buildTeamsFilterByType(type, query),
      },
      orderBy: {
        title: 'asc',
      },
    });
  }

  private buildTeamsFilterByType(type: any, query: any): any {
    if (type?.toLowerCase() === TEAM.toLowerCase()) {
      const { plnFriend } = query;
      const whereClause: any = {
        accessLevel: {
          not: 'L0',
        },
      };

      // Add plnFriend filter only if explicitly specified
      if (plnFriend !== undefined) {
        whereClause.plnFriend = plnFriend === 'true';
      }

      return {
        teams: {
          where: whereClause,
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
      };
    }
    return {};
  }

  findOne(uid: string, queryOptions: Omit<Prisma.CommunityAffiliationFindUniqueArgsBase, 'where'> = {}) {
    return this.prisma.communityAffiliation.findUniqueOrThrow({
      where: { uid },
      ...queryOptions,
    });
  }

  async insertManyFromList(communityAffiliations: string[]) {
    const uniqueCommunityAffiliations = Array.from(new Set(communityAffiliations));
    return await this.prisma.$transaction(
      uniqueCommunityAffiliations.map((communityAffiliation) =>
        this.prisma.communityAffiliation.upsert({
          where: { title: communityAffiliation },
          update: {},
          create: {
            title: communityAffiliation,
          },
        })
      )
    );
  }
}
