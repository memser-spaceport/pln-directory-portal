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
    queryRaw.mockResolvedValue([{ uid: 'ip-1', score: 100 }]);
    findMany.mockResolvedValue([profile()]);

    const result = await execute(tool, { search: 'neurotechnology' });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where.uid).toEqual({ in: ['ip-1'] });
    // Every match is fetched so relevance ordering sees all of them, not a check-size-ordered slice.
    expect(findMany.mock.calls[0][0].take).toBeUndefined();
    expect(result).toContain('Vova');
    expect(result).toContain('Matched search terms: "neurotechnology"');
  });

  it('orders by relevance score first, then check size with missing sizes last, and caps at 15', async () => {
    // Reproduces the prod "neuro tech" case: hundreds of funds match the generic token "tech",
    // most with no check size, so ordering by check size alone (NULLs first in Postgres) shows an
    // arbitrary slice of them and buries the one investor whose focus is literally "neuro tech".
    const { tool, queryRaw, findMany } = setup();
    const generic = Array.from({ length: 20 }, (_, i) =>
      profile({
        uid: `fund-${i}`,
        id: i + 10,
        typicalCheckSize: i % 2 ? null : 5_000_000,
        team: { uid: `team-${i}`, name: `Fintech Fund ${i}` },
        member: null,
        investmentFocus: ['Fintech'],
      })
    );
    const vova = profile({ uid: 'ip-vova', id: 1, typicalCheckSize: 10_000 });
    queryRaw.mockResolvedValue([...generic.map((p) => ({ uid: p.uid, score: 1.5 })), { uid: 'ip-vova', score: 125 }]);
    // Prisma returns check-size-desc with NULLs first; the tool must not rely on that order.
    findMany.mockResolvedValue([
      ...generic.filter((p) => p.typicalCheckSize === null),
      ...generic.filter((p) => p.typicalCheckSize !== null),
      vova,
    ]);

    const result = (await execute(tool, { search: 'neuro tech' })) as string;

    const names = [...result.matchAll(/Investor: ([^\[]+)\[/g)].map((m) => m[1].trim());
    expect(names[0]).toBe('Vova');
    expect(names).toHaveLength(15);
    // Among equally-scored funds, those with a check size come before those without.
    const funded = names.slice(1).filter((n) => Number(n.replace('Fintech Fund ', '')) % 2 === 0);
    expect(funded).toHaveLength(10);
    expect(names.slice(1, 11)).toEqual(funded);
    expect(result).toContain('Showing the 15 most relevant of 21 matching investors.');
  });

  it('keeps the whole-word rule for a short search used as the phrase', async () => {
    // A bare "AI" search is its own phrase; a plain LIKE '%ai%' here would bring back the
    // Cr-ai-g / Cl-ai-re name false positives the token rule exists to prevent.
    const { tool, queryRaw } = setup();
    queryRaw.mockResolvedValue([]);

    await execute(tool, { search: 'AI' });

    const call = queryRaw.mock.calls[0][0];
    expect(call.values).toContain('\\mai\\M');
    expect(call.sql).not.toContain(`LIKE '%' || $`);
  });

  it('keeps a single-word search bidirectional so it still matches a terser stored tag', async () => {
    // "neurotechnology" against a profile tagged just "Neuro": the phrase column only looks for
    // the word inside stored values, so the token column must also match the other way round.
    const { tool, queryRaw } = setup();
    queryRaw.mockResolvedValue([]);

    await execute(tool, { search: 'neurotechnology' });

    const sql = queryRaw.mock.calls[0][0].sql as string;
    expect(sql).toContain('AS tok_0');
    expect(sql).toContain(`LIKE '%' || LOWER(NULLIF(focus_item, '')) || '%'`);
  });

  it('scores the whole phrase above tokens and weights tokens by rarity in the SQL', async () => {
    const { tool, queryRaw } = setup();
    queryRaw.mockResolvedValue([]);

    await execute(tool, { search: 'neuro tech' });

    const sql = queryRaw.mock.calls[0][0].sql as string;
    expect(sql).toContain('AS phrase_hit');
    expect(sql).toContain('AS tok_0');
    expect(sql).toContain('AS tok_1');
    expect(sql).toContain('CASE WHEN phrase_hit THEN');
    expect(sql).toContain('CASE WHEN tok_0 AND tok_1 THEN');
    expect(sql).toMatch(/LN\(1 \+ SUM\(CASE WHEN tok_0 THEN 1 ELSE 0 END\) OVER \(\)\)/);
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

  it('guards the raw-SQL match against empty/NULL columns matching every search term', async () => {
    // `LOWER(term) LIKE '%' || LOWER(column) || '%'` collapses to `term LIKE '%%'` (true for
    // ANY term) when `column` is an empty string — which happens both for an orphaned profile's
    // `COALESCE(t.name, m.name)` (NULL) and for a genuinely empty-string tag or name. Verified
    // live against Postgres that this makes such rows match every search; NULLIF(column, '') is
    // the fix (collapses '' to NULL too, and NULL correctly propagates to "no match"). This test
    // guards the SQL text itself since a mocked $queryRaw can't exercise real NULL semantics.
    const { tool, queryRaw } = setup();
    queryRaw.mockResolvedValue([]);

    await execute(tool, { search: 'neurotechnology' });

    const sqlFragment = queryRaw.mock.calls[0][0];
    expect(sqlFragment.sql).toContain('NULLIF(');
  });

  it('drops soft-deleted or orphaned profiles after the fetch', async () => {
    const { tool, findMany } = setup();
    findMany.mockResolvedValueOnce([
      profile({ uid: 'deleted', member: { uid: 'm', name: 'Gone', deletedAt: new Date() } }),
      profile({ uid: 'orphan', team: null, member: null }),
      profile({ uid: 'visible' }),
    ]);
    findMany.mockResolvedValueOnce([]);

    const result = await execute(tool, {});

    expect(result).toContain('Vova');
    expect((result as string).match(/Investor:/g)).toHaveLength(1);
  });

  it('without a search, fetches profiles with a check size first and only tops up with the rest', async () => {
    // Postgres sorts NULLs first on DESC, so one check-size-ordered query capped at 50 would be
    // filled by profiles with no check size (most imported team funds) — the "all teams, no
    // members" symptom. Two queries keep the cap for profiles that actually have a size.
    const { tool, findMany } = setup();
    findMany.mockResolvedValueOnce([profile({ uid: 'sized', typicalCheckSize: 50_000 })]);
    findMany.mockResolvedValueOnce([
      profile({ uid: 'unsized', typicalCheckSize: null, member: { uid: 'm2', name: 'Nosize', deletedAt: null } }),
    ]);

    const result = (await execute(tool, { type: 'ANGEL' })) as string;

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[0][0].where.typicalCheckSize).toEqual({ not: null });
    expect(findMany.mock.calls[0][0].take).toBe(50);
    expect(findMany.mock.calls[1][0].where.typicalCheckSize).toBeNull();
    expect(findMany.mock.calls[1][0].take).toBe(49);
    expect(result.indexOf('Vova')).toBeLessThan(result.indexOf('Nosize'));
  });

  it('skips the top-up query when a minimum check size already excludes profiles without one', async () => {
    const { tool, findMany } = setup();
    findMany.mockResolvedValue([profile()]);

    await execute(tool, { minCheckSize: 10000 });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where.typicalCheckSize).toEqual({ not: null, gte: 10000 });
  });
});
