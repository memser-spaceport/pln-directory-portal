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

function teamRow(uid: string, name: string, island = 'digital-human-rights') {
  return {
    uid,
    name,
    website: `https://${uid}.example`,
    shortDescription: `${name} one-liner`,
    portfolioIsland: island,
    portfolioStartYear: 2014,
    portfolioEndYear: null,
    logo: { url: `https://images.example/${uid}-colour.webp` },
    portfolioMapLogo: { url: `https://images.example/${uid}-white.webp` },
    fundingStage: { title: 'Series B' },
  };
}

/** Runs the tool on the real Networks Map service, with only Prisma mocked. */
function buildCatalog(rows: unknown[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const service = new PlNetworkPortfolioService({ team: { findMany } } as never);
  const [tool] = portfolioTools(service);
  return { tool, service, findMany };
}

describe('portfolioTools', () => {
  it('lists the Networks Map portfolio teams for any connected member', () => {
    const { tool } = buildCatalog([]);

    const visible = toolsForPermissions(new Set<string>(), [tool]);

    expect(visible.map((t) => t.name)).toEqual(['list_portfolio_teams']);
    expect(Object.keys(tool.inputSchema ?? {})).toEqual(['q', 'island', 'limit', 'offset']);
  });

  it('returns the Networks Map API rows without the duplicate id', async () => {
    const rows = [teamRow('team_1', 'Agoric Systems'), teamRow('team_2', 'Filecoin')];
    const { tool, service } = buildCatalog(rows);

    const { teams: apiTeams } = await service.list();
    const result = await tool.execute(CTX, {});

    expect(result.teams).toEqual(
      apiTeams.map((team) => {
        const { id, ...rest } = team;
        expect(id).toBe(rest.teamUid);
        return rest;
      })
    );
    expect(result).toMatchObject({ total: 2, limit: 20, offset: 0, nextOffset: null });
    expect((result.teams as Array<Record<string, unknown>>)[0]).not.toHaveProperty('id');
  });

  it('filters by name substring and island, and total counts the matches', async () => {
    const { tool } = buildCatalog([
      teamRow('team_1', 'Agoric Systems', 'digital-human-rights'),
      teamRow('team_2', 'Agora Labs', 'public-goods'),
      teamRow('team_3', 'Filecoin', 'digital-human-rights'),
    ]);

    const byName = await tool.execute(CTX, { q: '  AGOR ' });
    expect((byName.teams as Array<{ teamUid: string }>).map((t) => t.teamUid)).toEqual(['team_1', 'team_2']);
    expect(byName.total).toBe(2);

    const byBoth = await tool.execute(CTX, { q: 'agor', island: 'public-goods' });
    expect((byBoth.teams as Array<{ teamUid: string }>).map((t) => t.teamUid)).toEqual(['team_2']);
    expect(byBoth.total).toBe(1);
  });

  it('pages with limit and offset', async () => {
    const { tool } = buildCatalog(Array.from({ length: 5 }, (_, i) => teamRow(`team_${i}`, `Team ${i}`)));

    const first = await tool.execute(CTX, { limit: 2 });
    expect((first.teams as Array<{ teamUid: string }>).map((t) => t.teamUid)).toEqual(['team_0', 'team_1']);
    expect(first).toMatchObject({ total: 5, limit: 2, offset: 0, nextOffset: 2 });

    const last = await tool.execute(CTX, { limit: 2, offset: 4 });
    expect((last.teams as Array<{ teamUid: string }>).map((t) => t.teamUid)).toEqual(['team_4']);
    expect(last.nextOffset).toBeNull();
  });

  it('returns an empty list when no team is tagged PL Portfolio', async () => {
    const { tool } = buildCatalog([]);

    await expect(tool.execute(CTX, {})).resolves.toEqual({
      teams: [],
      total: 0,
      limit: 20,
      offset: 0,
      nextOffset: null,
    });
  });
});
