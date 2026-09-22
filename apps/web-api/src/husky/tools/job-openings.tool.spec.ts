// `ai` pulls in untranspiled ESM this jest config can't parse; `tool()` just needs to hand
// back its config object so `getTool()` yields something with a callable `execute`.
jest.mock('ai', () => ({ tool: (config: any) => config }));

import { JobOpeningsTool, jobOpeningPath } from './job-openings.tool';

describe('JobOpeningsTool', () => {
  const logger = { error: jest.fn(), info: jest.fn() };
  const prisma = {} as any;

  function role(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      uid: 'role-1',
      roleTitle: 'Senior Backend Engineer, Rust',
      seniority: 'Senior (L4)',
      location: ['Remote'],
      workMode: 'Remote',
      applyUrl: 'https://jobs.example-team.com/apply/123',
      ...overrides,
    };
  }

  function setup(groups: unknown[]) {
    const listJobOpenings = jest.fn().mockResolvedValue({ groups });
    const tool = new JobOpeningsTool(logger as any, prisma, { listJobOpenings } as any);
    return { tool, listJobOpenings };
  }

  function execute(tool: JobOpeningsTool, args: Record<string, unknown>) {
    const coreTool = tool.getTool();
    if (!coreTool.execute) {
      throw new Error('tool has no execute');
    }
    return coreTool.execute(args, { toolCallId: 'call-1', messages: [] });
  }

  beforeEach(() => jest.clearAllMocks());

  it("links each role to the directory's job page, not the team's external apply URL", async () => {
    const { tool } = setup([
      {
        team: { uid: 'team-1', name: 'Example Team', focusAreas: ['AI'] },
        totalRoles: 1,
        roles: [role()],
      },
    ]);

    const result = (await execute(tool, { search: 'Rust' })) as string;

    expect(result).toContain(`[JobLink](${jobOpeningPath('role-1')})`);
    expect(result).toContain('[JobLink](/jobs/openings/role-1)');
    expect(result).toContain('Apply: https://jobs.example-team.com/apply/123');
    expect(result).not.toContain('[JobLink](https://jobs.example-team.com/apply/123)');
    expect(result).not.toContain('ApplyLink');
    expect(result).toContain('[TeamLink](/teams/team-1)');
  });

  it('reports when nothing matches, even after the single-word fallback', async () => {
    const { tool, listJobOpenings } = setup([]);

    const result = await execute(tool, { search: 'senior rust engineer roles' });

    expect(result).toBe('No job openings found matching the search criteria.');
    expect(listJobOpenings).toHaveBeenCalledTimes(2);
    expect(listJobOpenings.mock.calls[1][0].q).toBe('engineer');
  });
});
