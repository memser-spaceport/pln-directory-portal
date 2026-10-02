import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { PL_PORTFOLIO_COMMUNITY_AFFILIATION } from '../teams/team-affiliation.constants';

@Injectable()
export class PlNetworkPortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const teams = await this.prisma.team.findMany({
      where: {
        communityAffiliations: { some: { title: PL_PORTFOLIO_COMMUNITY_AFFILIATION } },
      },
      orderBy: { name: 'asc' },
      select: {
        uid: true,
        name: true,
        website: true,
        shortDescription: true,
        portfolioIsland: true,
        portfolioStartYear: true,
        portfolioEndYear: true,
        logo: { select: { url: true } },
        fundingStage: { select: { title: true } },
      },
    });

    return {
      teams: teams.map((team) => ({
        id: team.uid,
        name: team.name,
        logoUrl: team.logo?.url ?? null,
        island: team.portfolioIsland,
        startYear: team.portfolioStartYear,
        endYear: team.portfolioEndYear,
        teamUid: team.uid,
        oneLiner: team.shortDescription,
        stage: team.fundingStage?.title ?? null,
        website: team.website,
      })),
    };
  }
}
