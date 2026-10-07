// `ai` pulls in untranspiled ESM this jest config can't parse; `tool()` just needs to hand
// back its config object so `getTool()` yields something with a callable `execute`.
jest.mock('ai', () => ({ tool: (config: any) => config }));

import { WarmIntrosTool, warmIntrosPath } from './warm-intros.tool';

describe('WarmIntrosTool', () => {
  const logger = { error: jest.fn(), info: jest.fn() };
  const investorDbAccess = { check: jest.fn() };
  const auth = { isLoggedIn: true, memberUid: 'member-1' };

  function path(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      uid: 'p1',
      score: 0.7,
      proximityCode: 'PL+1A',
      scorePercent: 70,
      hopChain: {
        relationKind: 'pl_direct',
        hops: [
          { profileUid: 'c1', name: 'Juan Benet' },
          { profileUid: 'inv1', name: 'Vitalik Buterin' },
        ],
      },
      bestConnector: { name: 'Juan Benet', currentOrg: 'Protocol Labs' },
      pathSummary: { explanation: 'Shared Protocol Labs history', alternateCount: 0 },
      ...overrides,
    };
  }

  function candidate(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      investor: { investorId: 'inv-1', firstName: 'Ada', lastName: 'Lovelace', firm: 'Analytical', title: 'GP' },
      tier: 'co_invested',
      fitScore: 60,
      reason: 'Co-invested on Acme',
      evidence: ['Same team: Acme', 'Stage: seed'],
      ...overrides,
    };
  }

  function setup() {
    const queryRaw = jest
      .fn()
      .mockResolvedValue([
        { uid: 'inv1', name: 'Vitalik Buterin', currentOrg: 'Ethereum Foundation', currentTitle: 'Founder' },
      ]);
    const teamFindFirst = jest.fn().mockResolvedValue(null);
    const teamFindMany = jest.fn().mockResolvedValue([]);
    const prisma = { $queryRaw: queryRaw, team: { findFirst: teamFindFirst, findMany: teamFindMany } } as any;
    const warmIntrosV2Service = { getPathsByInvestor: jest.fn().mockResolvedValue({ paths: [path()] }) };
    const investorOutreachQueryService = {
      findWarmIntros: jest.fn().mockResolvedValue({ team: undefined, total: 1, candidates: [candidate()] }),
    };
    const tool = new WarmIntrosTool(
      logger as any,
      prisma,
      investorDbAccess as any,
      warmIntrosV2Service as any,
      investorOutreachQueryService as any
    );
    return { tool, queryRaw, teamFindFirst, teamFindMany, warmIntrosV2Service, investorOutreachQueryService };
  }

  function execute(tool: WarmIntrosTool, args: Record<string, unknown>): Promise<string> {
    const coreTool = tool.getTool(auth);
    if (!coreTool.execute) {
      throw new Error('tool has no execute');
    }
    return Promise.resolve(coreTool.execute(args, { toolCallId: 'call-1', messages: [] }));
  }

  beforeEach(() => {
    jest.clearAllMocks();
    investorDbAccess.check.mockResolvedValue({ allowed: true });
  });

  it('returns the gate message without touching any data source when access is denied', async () => {
    const { tool, queryRaw, warmIntrosV2Service, investorOutreachQueryService } = setup();
    investorDbAccess.check.mockResolvedValue({
      allowed: false,
      message: 'The signed-in user does not have Investor DB access, so investor data is unavailable.',
    });

    const result = await execute(tool, { investorOrFirm: 'Ethereum Foundation' });

    expect(result).toContain('does not have Investor DB access');
    expect(investorDbAccess.check).toHaveBeenCalledWith(auth, 'getWarmIntros');
    expect(queryRaw).not.toHaveBeenCalled();
    expect(warmIntrosV2Service.getPathsByInvestor).not.toHaveBeenCalled();
    expect(investorOutreachQueryService.findWarmIntros).not.toHaveBeenCalled();
  });

  describe('to an investor or firm', () => {
    it('resolves the firm to investors with paths and renders their best connector paths', async () => {
      const { tool, queryRaw, warmIntrosV2Service } = setup();
      warmIntrosV2Service.getPathsByInvestor.mockResolvedValue({
        paths: [
          path({ uid: 'weak', score: 0.3, scorePercent: 30, proximityCode: 'F+2B' }),
          path(),
          path({ uid: 'p3', score: 0.5, scorePercent: 50 }),
          path({ uid: 'p4', score: 0.4, scorePercent: 40 }),
        ],
      });

      const result = await execute(tool, { investorOrFirm: 'Ethereum Foundation' });

      const sql = queryRaw.mock.calls[0][0];
      expect(sql.sql).toContain('"currentOrg"');
      expect(sql.sql).toContain('"WarmPathV2"');
      expect(sql.values).toContain(0.2);
      expect(warmIntrosV2Service.getPathsByInvestor).toHaveBeenCalledWith('inv1', {});
      expect(result).toContain(
        `Warm intro: Vitalik Buterin (Founder, Ethereum Foundation) [WarmIntroLink](${warmIntrosPath(
          'Vitalik Buterin'
        )})`
      );
      expect(warmIntrosPath('Vitalik Buterin')).toBe('/investors?mode=warm-intros-v2&wi2_q=Vitalik%20Buterin');
      expect(result).toContain('Path 1: PL+1A, score 70%, direct PL connection');
      expect(result).toContain('Connector: Juan Benet (Protocol Labs)');
      expect(result).toContain('Hop chain: Juan Benet → Vitalik Buterin');
      expect(result).toContain('Why: Shared Protocol Labs history');
      // Best 3 by score: the 30% path is dropped.
      expect(result).not.toContain('F+2B');
      expect(result).toContain('Path 3:');
    });

    it('says there is no warm path when nothing matches', async () => {
      const { tool, queryRaw, warmIntrosV2Service } = setup();
      queryRaw.mockResolvedValue([]);

      const result = await execute(tool, { investorOrFirm: 'Unknown Capital' });

      expect(result).toBe('No warm intro paths found to an investor or firm matching "Unknown Capital".');
      expect(warmIntrosV2Service.getPathsByInvestor).not.toHaveBeenCalled();
    });

    it('rejects a lookup term that is too short to match meaningfully', async () => {
      const { tool, queryRaw } = setup();

      const result = await execute(tool, { investorOrFirm: 'ab' });

      expect(result).toContain('too short');
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('takes precedence over team criteria when both are given', async () => {
      const { tool, investorOutreachQueryService, warmIntrosV2Service } = setup();

      await execute(tool, { investorOrFirm: 'Ethereum Foundation', teamName: 'Acme' });

      expect(warmIntrosV2Service.getPathsByInvestor).toHaveBeenCalled();
      expect(investorOutreachQueryService.findWarmIntros).not.toHaveBeenCalled();
    });
  });

  describe('for a team or criteria', () => {
    it('resolves the team and renders ranked candidates with tier, score and reason', async () => {
      const { tool, teamFindFirst, investorOutreachQueryService } = setup();
      teamFindFirst.mockResolvedValue({ uid: 'team-1', name: 'Acme', portfolioMeta: { id: 1 } });
      investorOutreachQueryService.findWarmIntros.mockResolvedValue({
        team: { teamName: 'Acme' },
        total: 2,
        candidates: [
          candidate(),
          candidate({ tier: 'cold_match', fitScore: 20, reason: 'Sector match', evidence: [] }),
        ],
      });

      const result = await execute(tool, { teamName: 'acme' });

      expect(investorOutreachQueryService.findWarmIntros).toHaveBeenCalledWith({
        teamId: 'team-1',
        sectorTags: undefined,
        stageFocus: undefined,
      });
      expect(result.startsWith('Warm intro candidates for Acme. Showing 2 of 2 ranked candidates.')).toBe(true);
      expect(result).toContain('Warm intro: Ada Lovelace [InvestorLink](/investors?mode=list&investorId=inv-1)');
      expect(result).toContain('Tier: Co-invested');
      expect(result).toContain('Fit Score: 60/100');
      expect(result).toContain('Reason: Co-invested on Acme');
      expect(result).toContain('Evidence: Same team: Acme; Stage: seed');
      expect(result).toContain('Tier: Cold match');
      expect(result.indexOf('Co-invested')).toBeLessThan(result.indexOf('Cold match'));
    });

    it('falls back to a substring team match, preferring PL portfolio teams', async () => {
      const { tool, teamFindMany, investorOutreachQueryService } = setup();
      teamFindMany.mockResolvedValue([
        { uid: 'team-a', name: 'Acme Labs', portfolioMeta: null },
        { uid: 'team-b', name: 'Acme Protocol', portfolioMeta: { id: 2 } },
      ]);

      await execute(tool, { teamName: 'Acme' });

      expect(investorOutreachQueryService.findWarmIntros.mock.calls[0][0].teamId).toBe('team-b');
    });

    it('says the team was not found and never returns an unfiltered ranking', async () => {
      const { tool, investorOutreachQueryService } = setup();

      const result = await execute(tool, { teamName: 'Nonexistent', sectorTags: ['ai'] });

      expect(result).toBe(
        'No directory team found matching "Nonexistent", so no warm intro candidates can be ranked for it.'
      );
      expect(investorOutreachQueryService.findWarmIntros).not.toHaveBeenCalled();
    });

    it('ranks for sector and stage alone, normalizing them to the Investor DB vocabulary', async () => {
      const { tool, investorOutreachQueryService } = setup();

      const result = await execute(tool, { sectorTags: ['DeSci', 'AI'], stageFocus: 'Seed' });

      expect(investorOutreachQueryService.findWarmIntros).toHaveBeenCalledWith({
        teamId: undefined,
        sectorTags: 'desci,ai',
        stageFocus: 'seed',
      });
      expect(result).toContain('Showing 1 of 1 ranked candidates.');
    });

    it('does not rank when the criteria are all outside the vocabulary', async () => {
      const { tool, investorOutreachQueryService } = setup();

      const result = await execute(tool, { sectorTags: ['knitting'], stageFocus: 'growth' });

      expect(result).toContain('not in the Investor DB vocabulary');
      expect(investorOutreachQueryService.findWarmIntros).not.toHaveBeenCalled();
    });
  });

  it('asks for a target when no parameters are given', async () => {
    const { tool } = setup();

    await expect(execute(tool, {})).resolves.toContain('Specify either investorOrFirm');
  });
});
