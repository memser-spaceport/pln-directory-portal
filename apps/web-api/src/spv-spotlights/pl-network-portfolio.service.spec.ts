import { PlNetworkPortfolioController } from './pl-network-portfolio.controller';
import { PlNetworkPortfolioService } from './pl-network-portfolio.service';

describe('PlNetworkPortfolioService.list', () => {
  const buildService = (rows: unknown[]) => {
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = { team: { findMany } };
    return { service: new PlNetworkPortfolioService(prisma as never), findMany };
  };

  const fullTeam = {
    uid: 'team_1',
    name: 'Agoric Systems',
    website: 'https://agoric.com',
    shortDescription: 'A Proof-of-Stake chain.',
    portfolioIsland: 'digital-human-rights',
    portfolioStartYear: 2014,
    portfolioEndYear: null,
    logo: { url: 'https://images.example/colour.webp' },
    portfolioMapLogo: { url: 'https://images.example/white.webp' },
    fundingStage: { title: 'Series B' },
  };

  it('selects PL Portfolio teams, excludes L0 teams and orders by name', async () => {
    const { service, findMany } = buildService([]);

    await service.list();

    const args = findMany.mock.calls[0][0];
    expect(args.where.communityAffiliations).toEqual({ some: { title: 'PL Portfolio' } });
    expect(args.where.OR).toEqual([{ accessLevel: null }, { accessLevel: { not: 'L0' } }]);
    expect(args.orderBy).toEqual({ name: 'asc' });
    expect(args.select.portfolioMapLogo).toEqual({ select: { url: true } });
  });

  it('maps every field, including the white map logo', async () => {
    const { service } = buildService([fullTeam]);

    const { teams } = await service.list();

    expect(teams).toEqual([
      {
        id: 'team_1',
        teamUid: 'team_1',
        name: 'Agoric Systems',
        logoUrl: 'https://images.example/colour.webp',
        mapLogoUrl: 'https://images.example/white.webp',
        island: 'digital-human-rights',
        startYear: 2014,
        endYear: null,
        oneLiner: 'A Proof-of-Stake chain.',
        stage: 'Series B',
        website: 'https://agoric.com',
      },
    ]);
  });

  it('returns null for a tagged team without map data or logos', async () => {
    const { service } = buildService([
      {
        ...fullTeam,
        portfolioIsland: null,
        portfolioStartYear: null,
        logo: null,
        portfolioMapLogo: null,
        fundingStage: null,
        shortDescription: null,
        website: null,
      },
    ]);

    const [team] = (await service.list()).teams;

    expect(team).toMatchObject({
      logoUrl: null,
      mapLogoUrl: null,
      island: null,
      startYear: null,
      endYear: null,
      oneLiner: null,
      stage: null,
      website: null,
    });
  });
});

describe('PlNetworkPortfolioController', () => {
  it('opts the portfolio route out of the shared response cache', () => {
    // MyCacheInterceptor skips handlers carrying the 'ignoreCaching' metadata set by @NoCache().
    expect(Reflect.getMetadata('ignoreCaching', PlNetworkPortfolioController.prototype.list)).toBe(true);
  });
});
