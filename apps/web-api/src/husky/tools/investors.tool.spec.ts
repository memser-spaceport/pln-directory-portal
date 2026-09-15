// `ai` pulls in untranspiled ESM this jest config can't parse; `tool()` just needs to hand
// back its config object so `getTool()` yields something with a callable `execute`.
jest.mock('ai', () => ({ tool: (config: any) => config }));

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

  jest.mock('../../rbac/rbac-permission-check', () => ({ memberHasAnyPermission: jest.fn() }));

  async function run(investorProfiles: unknown[], search?: string) {
    jest.resetModules();
    jest.doMock('ai', () => ({ tool: (config: any) => config }));
    jest.doMock('../../rbac/rbac-permission-check', () => ({
      memberHasAnyPermission: jest.fn().mockResolvedValue(true),
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { InvestorsTool: FreshInvestorsTool } = require('./investors.tool');
    const prisma = { investorProfile: { findMany: jest.fn().mockResolvedValue(investorProfiles) } } as any;
    const tool = new FreshInvestorsTool(logger as any, prisma, rbacService, accessControlV2Service);
    const coreTool = tool.getTool(auth);
    return coreTool.execute({ search }, { toolCallId: 'call-1', messages: [] });
  }

  it('matches a model-normalized search term against a terser stored focus tag', async () => {
    // The stored tag is "neuro tech" (space-separated), but a model asked about "neuro tech"
    // naturally tends to generate the canonical single-word term instead of echoing the tag.
    const result = await run([profile()], 'neurotechnology');
    expect(result).toContain('Vova');
    expect(result).not.toMatch(/No investors found/);
  });

  it('still matches when the model echoes the tag verbatim', async () => {
    const result = await run([profile()], 'neuro tech');
    expect(result).toContain('Vova');
  });

  it('matches a compound stored tag against a spaced-out search term', async () => {
    const result = await run([profile({ investmentFocus: ['DeepTech'] })], 'deep tech');
    expect(result).toContain('Vova');
  });

  it('does not match on an unrelated search term', async () => {
    const result = await run([profile()], 'climate');
    expect(result).toMatch(/No investors found/);
  });
});
