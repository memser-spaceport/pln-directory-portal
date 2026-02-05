import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { TEAM } from '../utils/constants';

@Injectable()
export class FundingStagesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: any) {
    const { type } = query;
    return this.prisma.fundingStage.findMany({
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
    if (type === TEAM) {
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

  findOne(uid: string, queryOptions: Omit<Prisma.FundingStageFindUniqueArgsBase, 'where'> = {}) {
    return this.prisma.fundingStage.findUniqueOrThrow({
      where: { uid },
      ...queryOptions,
    });
  }

  async insertManyFromList(fundingStages: string[]) {
    const uniqueFundingStages = Array.from(new Set(fundingStages));
    return await this.prisma.$transaction(
      uniqueFundingStages.map((fundingStage) =>
        this.prisma.fundingStage.upsert({
          where: { title: fundingStage },
          update: {},
          create: {
            title: fundingStage,
          },
        })
      )
    );
  }
}
