import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { TeamsService } from '../teams/teams.service';
import { TEAM } from '../utils/constants';

@Injectable()
export class FundingStagesService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => TeamsService))
    private teamsService: TeamsService
  ) {}

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
      return {
        teams: {
          where: {
            ...this.buildTeamFilter(query),
          },
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

  private buildTeamFilter(queryParams: any) {
    return this.teamsService.buildTeamFilter(queryParams);
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
