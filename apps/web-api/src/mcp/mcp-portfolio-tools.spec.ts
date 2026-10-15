import { PlNetworkPortfolioService } from '../spv-spotlights/pl-network-portfolio.service';
import { portfolioTools } from './mcp-portfolio-tools';
import { McpActorContext, toolsForPermissions } from './mcp-tools';

const CTX: McpActorContext = {
  memberUid: 'member-1',
  name: 'Test Member',
  email: 'member@example.com',
  permissions: new Set<string>(),
  authorizationUid: 'auth-uid',
  clientName: 'test-client',
};

const TEAM = {
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
};

function buildCatalog(teams: unknown[] = [TEAM]) {
  const list = jest.fn().mockResolvedValue({ teams });
  const portfolio = { list } as unknown as PlNetworkPortfolioService;
  return { catalog: portfolioTools(portfolio), list };
}

describe('portfolioTools', () => {
  it('lists the Networks Map portfolio teams for any connected member', () => {
    const { catalog } = buildCatalog();

    const visible = toolsForPermissions(new Set<string>(), catalog);

    expect(visible.map((t) => t.name)).toEqual(['list_portfolio_teams']);
    expect(visible[0].inputSchema).toBeUndefined();
  });

  it('returns the same teams and fields as the Networks Map API, with a total', async () => {
    const { catalog, list } = buildCatalog();

    const result = await catalog[0].execute(CTX, {});

    expect(list).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ teams: [TEAM], total: 1 });
    const [team] = result.teams as Array<Record<string, unknown>>;
    for (const field of ['name', 'oneLiner', 'stage', 'website', 'logoUrl', 'mapLogoUrl']) {
      expect(team).toHaveProperty(field);
    }
  });

  it('returns an empty list when no team is tagged PL Portfolio', async () => {
    const { catalog } = buildCatalog([]);

    await expect(catalog[0].execute(CTX, {})).resolves.toEqual({ teams: [], total: 0 });
  });
});
