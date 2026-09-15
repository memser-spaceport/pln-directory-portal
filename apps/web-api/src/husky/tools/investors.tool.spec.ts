// `ai` pulls in untranspiled ESM this jest config can't parse; `tool()` just needs to hand
// back its config object so `getTool()` yields something with a callable `execute`.
jest.mock('ai', () => ({ tool: (config: any) => config }));
jest.mock('../../rbac/rbac-permission-check', () => ({ memberHasAnyPermission: jest.fn() }));

import { InvestorsTool } from './investors.tool';
import { memberHasAnyPermission } from '../../rbac/rbac-permission-check';

describe('InvestorsTool', () => {
  const logger = { error: jest.fn(), info: jest.fn() };
  const rbacService = {} as any;
  const accessControlV2Service = {} as any;
  const auth = { isLoggedIn: true, memberUid: 'member-1' };

  function profile(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      uid: 'ip-1',
      type: 'ANGEL',
      typicalCheckSize: 10000,
      investInStartupStages: [],
      investInFundTypes: [],
      isInvestViaFund: null,
      team: null,
      member: { uid: 'member-2', name: 'Vova', deletedAt: null },
      investmentFocus: ['neuro', 'tech', 'neuro tech'],
      ...overrides,
    };
  }

  function setup() {
    const queryRaw = jest.fn();
    const findMany = jest.fn();
    const prisma = { investorProfile: { findMany }, $queryRaw: queryRaw } as any;
    const tool = new InvestorsTool(logger as any, prisma, rbacService, accessControlV2Service);
    return { tool, queryRaw, findMany };
  }

  function execute(tool: InvestorsTool, args: Record<string, unknown>) {
    const coreTool = tool.getTool(auth);
    if (!coreTool.execute) {
      throw new Error('tool has no execute');
    }
    return coreTool.execute(args, { toolCallId: 'call-1', messages: [] });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (memberHasAnyPermission as jest.Mock).mockResolvedValue(true);
  });

  it('resolves matching uids via raw SQL, then fetches only those profiles', async () => {
    // Matching now happens entirely in the DB (investmentFocus is a String[], which Prisma
    // can't push a case-insensitive substring match into `where` for), not by fetching a capped
    // candidate window and filtering in memory. So the tool must: query for matching uids first,
    // then scope the real fetch to exactly those.
    const { tool, queryRaw, findMany } = setup();
    queryRaw.mockResolvedValue([{ uid: 'ip-1' }]);
    findMany.mockResolvedValue([profile()]);

    const result = await execute(tool, { search: 'neurotechnology' });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where.uid).toEqual({ in: ['ip-1'] });
    expect(result).toContain('Vova');
  });

  it('returns "no investors found" without querying profiles when nothing matches', async () => {
    const { tool, queryRaw, findMany } = setup();
    queryRaw.mockResolvedValue([]);

    const result = await execute(tool, { search: 'climate' });

    expect(result).toMatch(/No investors found/);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('skips the raw-SQL match entirely when there is no search term', async () => {
    const { tool, queryRaw, findMany } = setup();
    findMany.mockResolvedValue([profile()]);

    await execute(tool, { type: 'ANGEL', minCheckSize: 10000 });

    expect(queryRaw).not.toHaveBeenCalled();
    expect(findMany.mock.calls[0][0].where.uid).toBeUndefined();
  });

  it('uses a small, fixed fetch limit regardless of which filters are set', async () => {
    // Correctness now comes entirely from `where` (structured filters, DB-pushed) and the raw-SQL
    // uid pre-filter above (also DB-pushed) — both scale to any table size on their own. This
    // limit only needs to absorb the in-memory soft-delete/orphan-profile drop below, so it never
    // needs to grow with the table.
    const { tool, findMany } = setup();
    findMany.mockResolvedValue([profile()]);

    await execute(tool, { type: 'ANGEL', minCheckSize: 10000 });

    expect(findMany.mock.calls[0][0].take).toBe(50);
  });

  it('drops soft-deleted or orphaned profiles after the fetch', async () => {
    const { tool, findMany } = setup();
    findMany.mockResolvedValue([
      profile({ uid: 'deleted', member: { uid: 'm', name: 'Gone', deletedAt: new Date() } }),
      profile({ uid: 'orphan', team: null, member: null }),
      profile({ uid: 'visible' }),
    ]);

    const result = await execute(tool, {});

    expect(result).toContain('Vova');
    expect((result as string).match(/Investor:/g)).toHaveLength(1);
  });
});
