// `ai` pulls in untranspiled ESM this jest config can't parse; `tool()` just needs to hand
// back its config object so `getTool()` yields something with a callable `execute`.
jest.mock('ai', () => ({ tool: (config: any) => config }));

import { InvestorDbTool, investorDbPath } from './investor-db.tool';

describe('InvestorDbTool', () => {
  const logger = { error: jest.fn(), info: jest.fn() };
  const investorDbAccess = { check: jest.fn() };
  const auth = { isLoggedIn: true, memberUid: 'member-1' };

  function record(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 1,
      investorId: 'inv-123',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.vc',
      additionalEmails: ['ada.l@example.vc'],
      linkedinUrl: 'https://linkedin.com/in/ada',
      firm: 'Analytical Ventures',
      title: 'General Partner',
      fundThesis: 'Backs decentralized science protocols.',
      checkSizeRange: '100-500K',
      stageFocus: 'seed',
      sectorTags: 'desci,biotech',
      geoFocus: 'Europe',
      investorType: 'fund',
      engagementTier: 'T2_clicked',
      proximityCode: 'VC+1A',
      bestProximityCode: 'JB+1A',
      hasPath: true,
      ...overrides,
    };
  }

  function setup() {
    const count = jest.fn().mockResolvedValue(1);
    const findMany = jest.fn().mockResolvedValue([record()]);
    const prisma = {
      investorOutreachRecord: { count, findMany },
      $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    } as any;
    const tool = new InvestorDbTool(logger as any, prisma, investorDbAccess as any);
    return { tool, count, findMany };
  }

  function execute(tool: InvestorDbTool, args: Record<string, unknown>) {
    const coreTool = tool.getTool(auth);
    if (!coreTool.execute) {
      throw new Error('tool has no execute');
    }
    return coreTool.execute(args, { toolCallId: 'call-1', messages: [] });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    investorDbAccess.check.mockResolvedValue({ allowed: true });
  });

  it('returns the gate message without querying when access is denied', async () => {
    const { tool, findMany, count } = setup();
    investorDbAccess.check.mockResolvedValue({
      allowed: false,
      message: 'User is not logged in, so investor data is unavailable.',
    });

    const result = await execute(tool, { search: 'desci' });

    expect(result).toBe('User is not logged in, so investor data is unavailable.');
    expect(investorDbAccess.check).toHaveBeenCalledWith(auth, 'getInvestorDb');
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it('maps "DeSci at seed stage" to the canonical sector token and stage', async () => {
    const { tool, findMany } = setup();

    await execute(tool, { sectorTags: ['DeSci'], stageFocus: 'Seed' });

    expect(findMany.mock.calls[0][0].where).toEqual({
      AND: [
        { stageFocus: 'seed' },
        {
          OR: [
            { sectorTags: 'desci' },
            { sectorTags: { startsWith: 'desci,' } },
            { sectorTags: { endsWith: ',desci' } },
            { sectorTags: { contains: ',desci,' } },
          ],
        },
      ],
    });
  });

  it('drops filter values outside the Investor DB vocabulary instead of failing', async () => {
    const { tool, findMany } = setup();

    const result = await execute(tool, {
      stageFocus: 'growth',
      sectorTags: ['underwater basket weaving'],
      investorType: 'bank',
      engagementTier: 'T9',
      geoFocus: 'US',
    });

    expect(findMany.mock.calls[0][0].where).toEqual({
      AND: [{ geoFocus: { contains: 'US', mode: 'insensitive' } }],
    });
    expect(result).toContain('Investor DB record:');
  });

  it('normalizes loose stage, type and tier spellings', () => {
    const { tool } = setup();

    expect(tool.buildWhere({ stageFocus: 'Series C', investorType: 'Family office', engagementTier: 't1' })).toEqual({
      AND: [{ stageFocus: 'series-b+' }, { investorType: 'family_office' }, { engagementTier: 'T1_registered' }],
    });
  });

  it('matches every search word against name, firm, title, thesis and sector tags', () => {
    const { tool } = setup();

    const where = tool.buildWhere({ search: 'decentralized science' });

    expect(where.AND).toHaveLength(2);
    const [first] = where.AND as any[];
    expect(first.OR).toEqual(
      expect.arrayContaining([
        { fundThesis: { contains: 'decentralized', mode: 'insensitive' } },
        { title: { contains: 'decentralized', mode: 'insensitive' } },
        { sectorTags: { contains: 'decentralized', mode: 'insensitive' } },
        { firm: { contains: 'decentralized', mode: 'insensitive' } },
      ])
    );
  });

  it('only lets a two-letter search word match a whole sector tag or name, never a substring', () => {
    const { tool } = setup();

    const [condition] = tool.buildWhere({ search: 'AI' }).AND as any[];

    expect(JSON.stringify(condition)).not.toContain('fundThesis');
    expect(condition.OR).toEqual(
      expect.arrayContaining([
        { OR: expect.arrayContaining([{ sectorTags: 'ai' }]) },
        { firm: { equals: 'ai', mode: 'insensitive' } },
      ])
    );
  });

  it('filters on the warm-path flag', () => {
    const { tool } = setup();

    expect(tool.buildWhere({ hasWarmPath: true })).toEqual({ AND: [{ hasPath: true }] });
  });

  it('orders warm-path and engaged investors first without a NULLs-first date sort', async () => {
    const { tool, findMany } = setup();

    await execute(tool, {});

    expect(findMany.mock.calls[0][0].orderBy).toEqual([{ hasPath: 'desc' }, { engagementTier: 'asc' }, { id: 'asc' }]);
    expect(findMany.mock.calls[0][0].take).toBe(15);
  });

  it('says nothing matched when no record matches', async () => {
    const { tool, findMany, count } = setup();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await expect(execute(tool, { search: 'nothing' })).resolves.toBe(
      'No investors found in the Investor DB matching the search criteria.'
    );
  });

  it('states the total when results are capped', async () => {
    const { tool, count } = setup();
    count.mockResolvedValue(42);

    const result = await execute(tool, {});

    expect(result.startsWith('Showing 1 of 42 matching Investor DB records.')).toBe(true);
  });

  it('formats the record with an in-product link and no contact details', async () => {
    const { tool } = setup();

    const result: string = await execute(tool, {});

    expect(result).toContain(`Investor DB record: Ada Lovelace [InvestorLink](${investorDbPath('inv-123')})`);
    expect(investorDbPath('inv-123')).toBe('/investors?mode=list&investorId=inv-123');
    expect(result).toContain('Firm: Analytical Ventures');
    expect(result).toContain('Fund Thesis: Backs decentralized science protocols.');
    expect(result).toContain('Check Size Range: 100-500K');
    expect(result).toContain('Sectors: desci, biotech');
    expect(result).toContain('Proximity Code: JB+1A');
    expect(result).toContain('Warm Path: Yes');
    expect(result).not.toContain('@');
    expect(result).not.toContain('linkedin');
  });

  it('trims a long thesis and shows placeholders for empty fields', async () => {
    const { tool, findMany } = setup();
    findMany.mockResolvedValue([
      record({
        fundThesis: 'x'.repeat(500),
        title: null,
        geoFocus: '',
        bestProximityCode: null,
        proximityCode: null,
        hasPath: false,
      }),
    ]);

    const result: string = await execute(tool, {});

    expect(result).toContain(`Fund Thesis: ${'x'.repeat(300)}…`);
    expect(result).toContain('Title: Not provided');
    expect(result).toContain('Geo Focus: Not provided');
    expect(result).toContain('Proximity Code: Not provided');
    expect(result).toContain('Warm Path: No computed warm path');
  });
});
