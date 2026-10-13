jest.mock('ai', () => ({ generateText: jest.fn() }));

import { generateText } from 'ai';
import { JobMatchRunner } from './job-match-runner.service';
import { profileText, profileTextHash, rolePosting, roleTextHash, scoreHash } from './job-match.logic';

const generateTextMock = generateText as jest.Mock;

function prismaMock() {
  const suggestionDeleteMany = jest.fn();
  const suggestionCreateMany = jest.fn();
  const roleCreate = jest.fn();
  const findMany = jest.fn();
  return {
    jobMatchRow: {
      findUnique: jest.fn(),
      findMany,
      findFirst: jest.fn(),
      upsert: jest.fn(),
      create: roleCreate,
      deleteMany: suggestionDeleteMany,
      createMany: suggestionCreateMany,
    },
    jobMatchRun: { update: jest.fn() },
    jobMatchCriteriaOverride: { findMany: jest.fn().mockResolvedValue([]) },
    jobOpeningInterest: { findMany: jest.fn().mockResolvedValue([]) },
    teamInterest: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        jobMatchRow: { deleteMany: suggestionDeleteMany, createMany: suggestionCreateMany, create: roleCreate },
      })
    ),
    suggestionCreateMany,
    findMany,
  };
}

const criteria = ['Go', 'Senior', 'Remote', 'Postgres'];

const jobRow = {
  uid: 'role-1',
  roleTitle: 'Backend Engineer',
  companyName: 'Prime Intellect',
  roleCategory: null,
  seniority: 'Senior',
  summary: null,
  descriptionHtml: null,
  location: ['Remote'],
  workMode: null,
};

const memberRow = {
  uid: 'member-1',
  name: 'Ada Lovelace',
  role: 'Engineer',
  currentCompany: 'Analytical Engines',
  bio: 'Builds distributed systems.',
  aboutYou: null,
  customSkills: [],
  city: null,
  country: null,
  skills: ['Go'],
  experiences: [],
  teams: [],
};

describe('JobMatchRunner', () => {
  const env = { ...process.env };
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VERCEL_AI_KEY = 'test-key';
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it('skips a team already finished for this run', async () => {
    const prisma = prismaMock();
    prisma.jobMatchRow.findUnique.mockResolvedValue({ uid: 'team-row' });
    const runner = new JobMatchRunner(prisma as never, {} as never, { emit: jest.fn() } as never);
    await runner.processTeam('run-1', { uid: 'team-1', name: 'Prime Intellect' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips member scores and roles already stored, then closes the team', async () => {
    const prisma = prismaMock();
    prisma.jobMatchRow.findUnique.mockResolvedValue(null);
    prisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = Array.from(strings).join(' ');
      if (sql.includes('"JobOpening"')) return [jobRow];
      return [];
    });
    prisma.findMany.mockImplementation(async (args: { where: { kind: string } }) => {
      if (args.where.kind === 'ROLE') return [{ roleUid: 'role-1' }];
      return [];
    });
    const runner = new JobMatchRunner(prisma as never, {} as never, { emit: jest.fn() } as never);
    await runner.processTeam('run-1', { uid: 'team-1', name: 'Prime Intellect' });
    expect(prisma.findMany).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.jobMatchRow.upsert).toHaveBeenCalled();
  });

  it('does not call Jev again for a member already scored today', async () => {
    const prisma = prismaMock();
    prisma.jobMatchRow.findUnique.mockResolvedValue(null);
    prisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Array.from(strings).join(' ');
      if (sql.includes('"JobOpening"')) return [jobRow];
      expect(sql).toContain('TeamMemberRole');
      expect(sql).toContain('job_aspirant');
      expect(values).toContain('prime intellect');
      return [memberRow];
    });
    prisma.findMany.mockImplementation(async (args: { where: { kind: string } }) => {
      if (args.where.kind === 'SCORE') {
        return [
          {
            memberUid: 'member-1',
            payload: {
              profileHash: profileTextHash(
                profileText({
                  uid: memberRow.uid,
                  name: memberRow.name,
                  role: memberRow.role,
                  currentCompany: memberRow.currentCompany,
                  bio: memberRow.bio,
                  aboutYou: memberRow.aboutYou,
                  customSkills: [],
                  city: null,
                  country: null,
                  skills: ['Go'],
                  experiences: [],
                  teams: [],
                })
              ),
              fits: { 'role-1': { fit: 90, roleTextHash: roleTextHash(rolePosting(jobRow)) } },
            },
          },
        ];
      }
      return [];
    });
    prisma.jobMatchRow.findFirst.mockResolvedValue({ payload: criteria });
    generateTextMock.mockResolvedValue({
      text: JSON.stringify([{ memberUid: 'member-1', blurb: 'Knows Go.', matched: [true, true, true, false] }]),
    });

    const runner = new JobMatchRunner(
      prisma as never,
      { getResponsesModel: () => 'model' } as never,
      { emit: jest.fn() } as never
    );
    await runner.processTeam('run-1', { uid: 'team-1', name: '  Prime   Intellect ' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.suggestionCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          memberUid: 'member-1',
          rank: 1,
          fit: 90,
          label: 'STRONG',
          blurb: 'Knows Go.',
          interested: false,
          interestNote: null,
        }),
      ],
    });
  });

  it('marks a member interested in the role or its team and ranks them first on a tie (LAB-2788)', async () => {
    const prisma = prismaMock();
    prisma.jobMatchRow.findUnique.mockResolvedValue(null);
    const roleFan = { ...memberRow, uid: 'member-2', name: 'Grace Hopper' };
    const teamFan = { ...memberRow, uid: 'member-3', name: 'Katherine Johnson' };
    prisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = Array.from(strings).join(' ');
      if (sql.includes('"JobOpening"')) return [jobRow];
      return [memberRow, roleFan, teamFan];
    });
    prisma.findMany.mockResolvedValue([]);
    // member-9 is interested but outside the pool (for example a former hiring-team member), so it is never scored.
    prisma.jobOpeningInterest.findMany.mockResolvedValue([
      { jobOpeningUid: 'role-1', memberUid: 'member-2' },
      { jobOpeningUid: 'role-1', memberUid: 'member-9' },
    ]);
    prisma.teamInterest.findMany.mockResolvedValue([{ memberUid: 'member-3' }]);
    prisma.jobMatchRow.findFirst.mockResolvedValue({ payload: criteria });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ answers: { 'role-1': { probability: 0.7 } } }),
    });
    generateTextMock.mockResolvedValue({
      text: JSON.stringify(
        ['member-1', 'member-2', 'member-3'].map((memberUid) => ({
          memberUid,
          blurb: 'Fits.',
          matched: [true, true, true, true],
        }))
      ),
    });

    const runner = new JobMatchRunner(
      prisma as never,
      { getResponsesModel: () => 'model' } as never,
      { emit: jest.fn() } as never
    );
    await runner.processTeam('run-1', { uid: 'team-1', name: 'Prime Intellect' });

    expect(prisma.jobOpeningInterest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { jobOpeningUid: { in: ['role-1'] } } })
    );
    expect(prisma.teamInterest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamUid: 'team-1' } })
    );
    const rows = prisma.suggestionCreateMany.mock.calls[0][0].data;
    expect(rows.map((row: { memberUid: string }) => row.memberUid)).toEqual(['member-2', 'member-3', 'member-1']);
    expect(rows.map((row: { interested: boolean }) => row.interested)).toEqual([true, true, false]);
    expect(rows.map((row: { rank: number }) => row.rank)).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stores the note of the interest: the role note wins, else the team note, else null (LAB-2802)', async () => {
    const prisma = prismaMock();
    prisma.jobMatchRow.findUnique.mockResolvedValue(null);
    const pool = ['member-1', 'member-2', 'member-3', 'member-4', 'member-5'].map((uid) => ({ ...memberRow, uid }));
    prisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = Array.from(strings).join(' ');
      if (sql.includes('"JobOpening"')) return [jobRow];
      return pool;
    });
    prisma.findMany.mockResolvedValue([]);
    // member-1: role note only. member-2: team note only. member-3: both, role note wins.
    // member-4: role interest with an empty note and a team note, so the team note. member-5: not interested.
    prisma.jobOpeningInterest.findMany.mockResolvedValue([
      { jobOpeningUid: 'role-1', memberUid: 'member-1', note: ' Love this role. ' },
      { jobOpeningUid: 'role-1', memberUid: 'member-3', note: 'Role note.' },
      { jobOpeningUid: 'role-1', memberUid: 'member-4', note: '   ' },
    ]);
    prisma.teamInterest.findMany.mockResolvedValue([
      { memberUid: 'member-2', message: 'Big fan of the team.' },
      { memberUid: 'member-3', message: 'Team note.' },
      { memberUid: 'member-4', message: 'Team note 4.' },
    ]);
    prisma.jobMatchRow.findFirst.mockResolvedValue({ payload: criteria });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ answers: { 'role-1': { probability: 0.7 } } }),
    });
    generateTextMock.mockResolvedValue({
      text: JSON.stringify(
        pool.map((member) => ({ memberUid: member.uid, blurb: 'Fits.', matched: [true, true, true, true] }))
      ),
    });

    const runner = new JobMatchRunner(
      prisma as never,
      { getResponsesModel: () => 'model' } as never,
      { emit: jest.fn() } as never
    );
    await runner.processTeam('run-1', { uid: 'team-1', name: 'Prime Intellect' });

    const rows: { memberUid: string; interested: boolean; interestNote: string | null }[] =
      prisma.suggestionCreateMany.mock.calls[0][0].data;
    const byMember = new Map(rows.map((row) => [row.memberUid, row]));
    expect(byMember.get('member-1')?.interestNote).toBe('Love this role.');
    expect(byMember.get('member-2')?.interestNote).toBe('Big fan of the team.');
    expect(byMember.get('member-3')?.interestNote).toBe('Role note.');
    expect(byMember.get('member-4')?.interestNote).toBe('Team note 4.');
    expect(byMember.get('member-5')).toEqual(expect.objectContaining({ interested: false, interestNote: null }));
  });

  it('stores a null note for an interested member who wrote no note (LAB-2802)', async () => {
    const prisma = prismaMock();
    prisma.jobMatchRow.findUnique.mockResolvedValue(null);
    prisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = Array.from(strings).join(' ');
      if (sql.includes('"JobOpening"')) return [jobRow];
      return [memberRow];
    });
    prisma.findMany.mockResolvedValue([]);
    prisma.jobOpeningInterest.findMany.mockResolvedValue([
      { jobOpeningUid: 'role-1', memberUid: 'member-1', note: null },
    ]);
    prisma.teamInterest.findMany.mockResolvedValue([{ memberUid: 'member-1', message: null }]);
    prisma.jobMatchRow.findFirst.mockResolvedValue({ payload: criteria });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ answers: { 'role-1': { probability: 0.7 } } }),
    });
    generateTextMock.mockResolvedValue({
      text: JSON.stringify([{ memberUid: 'member-1', blurb: 'Fits.', matched: [true, true, true, true] }]),
    });

    const runner = new JobMatchRunner(
      prisma as never,
      { getResponsesModel: () => 'model' } as never,
      { emit: jest.fn() } as never
    );
    await runner.processTeam('run-1', { uid: 'team-1', name: 'Prime Intellect' });

    expect(prisma.suggestionCreateMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ memberUid: 'member-1', interested: true, interestNote: null }),
    ]);
  });

  it('scores an unscored member with Jev and keeps only a fit at or above the floor', async () => {
    const prisma = prismaMock();
    prisma.jobMatchRow.findUnique.mockResolvedValue(null);
    prisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = Array.from(strings).join(' ');
      if (sql.includes('"JobOpening"')) return [jobRow];
      return [memberRow];
    });
    prisma.findMany.mockResolvedValue([]);
    prisma.jobMatchRow.findFirst.mockResolvedValue({ payload: criteria });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ answers: { 'role-1': { probability: 0.2 } } }),
    });

    const runner = new JobMatchRunner(prisma as never, {} as never, { emit: jest.fn() } as never);
    await runner.processTeam('run-1', { uid: 'team-1', name: 'Prime Intellect' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('typesafe-ai/jev');
    expect(body.questions['role-1'].type).toBe('boolean');
    expect(prisma.jobMatchRow.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          kind: 'SCORE',
          payload: expect.objectContaining({
            fits: { 'role-1': expect.objectContaining({ fit: 20 }) },
          }),
        }),
      })
    );
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(prisma.suggestionCreateMany).not.toHaveBeenCalled();
    expect(prisma.jobMatchRow.create).toHaveBeenCalled();
  });
  describe('criteria overrides (LAB-2846)', () => {
    const overrideCriteria = ['Go', 'Senior', 'Remote EU', 'Postgres'];
    const enabled = ['Go', 'Senior', 'Postgres'];
    const postingHash = roleTextHash(rolePosting(jobRow));
    const memberProfileHash = profileTextHash(
      profileText({ ...memberRow, customSkills: [], skills: ['Go'], experiences: [], teams: [] })
    );

    function setup(options: { overrideHash?: string; storedRoleHash?: string; probability?: number }) {
      const prisma = prismaMock();
      prisma.jobMatchRow.findUnique.mockResolvedValue(null);
      prisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
        const sql = Array.from(strings).join(' ');
        if (sql.includes('"JobOpening"')) return [jobRow];
        return [memberRow];
      });
      prisma.findMany.mockImplementation(async (args: { where: { kind: string } }) => {
        if (args.where.kind === 'SCORE' && options.storedRoleHash) {
          return [
            {
              memberUid: 'member-1',
              payload: {
                profileHash: memberProfileHash,
                fits: { 'role-1': { fit: 90, roleTextHash: options.storedRoleHash } },
              },
            },
          ];
        }
        return [];
      });
      if (options.overrideHash) {
        prisma.jobMatchCriteriaOverride.findMany.mockResolvedValue([
          { roleUid: 'role-1', roleTextHash: options.overrideHash, disabled: ['Remote EU'] },
        ]);
      }
      prisma.jobMatchRow.findFirst.mockResolvedValue({ payload: overrideCriteria });
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ answers: { 'role-1': { probability: options.probability ?? 0.9 } } }),
      });
      generateTextMock.mockImplementation(async ({ prompt }: { prompt: string }) => {
        const count = prompt.includes('Remote EU') ? 4 : 3;
        return {
          text: JSON.stringify([{ memberUid: 'member-1', blurb: 'Fits.', matched: Array(count).fill(true) }]),
        };
      });
      const runner = new JobMatchRunner(
        prisma as never,
        { getResponsesModel: () => 'model' } as never,
        { emit: jest.fn() } as never
      );
      return { prisma, runner };
    }

    it('reads the newest CRITERIA row for the posting', async () => {
      const { prisma, runner } = setup({});
      await runner.processTeam('run-1', { uid: 'team-1', name: 'Prime Intellect' });
      expect(prisma.jobMatchRow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { kind: 'CRITERIA', roleUid: 'role-1', roleTextHash: postingHash },
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('loads overrides at the current posting hash', async () => {
      const { prisma, runner } = setup({});
      await runner.processTeam('run-1', { uid: 'team-1', name: 'Prime Intellect' });
      expect(prisma.jobMatchCriteriaOverride.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { OR: [{ roleUid: 'role-1', roleTextHash: postingHash }] } })
      );
    });

    it('leaves a disabled criterion out of the Jev question', async () => {
      const { runner } = setup({ overrideHash: postingHash });
      await runner.processTeam('run-1', { uid: 'team-1', name: 'Prime Intellect' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      const instructions: string = body.questions['role-1'].instructions;
      expect(instructions).not.toContain('Remote EU');
      expect(instructions).toContain('- Go');
      expect(instructions).toContain('- Postgres');
    });

    it('does not reuse a fit scored before the override, and stores the score hash', async () => {
      const { prisma, runner } = setup({ overrideHash: postingHash, storedRoleHash: postingHash });
      await runner.processTeam('run-1', { uid: 'team-1', name: 'Prime Intellect' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(prisma.jobMatchRow.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            kind: 'SCORE',
            payload: expect.objectContaining({
              fits: {
                'role-1': { fit: 90, roleTextHash: scoreHash(postingHash, enabled, overrideCriteria) },
              },
            }),
          }),
        })
      );
    });

    it('reuses a fit scored with the same enabled criteria', async () => {
      const { runner } = setup({
        overrideHash: postingHash,
        storedRoleHash: scoreHash(postingHash, enabled, overrideCriteria),
      });
      await runner.processTeam('run-1', { uid: 'team-1', name: 'Prime Intellect' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reuses the stored fit of a role without an override, with no Jev call', async () => {
      const { prisma, runner } = setup({ storedRoleHash: postingHash });
      await runner.processTeam('run-1', { uid: 'team-1', name: 'Prime Intellect' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.suggestionCreateMany.mock.calls[0][0].data[0].payload).toHaveLength(4);
    });

    it('ignores an override saved against an older posting', async () => {
      const { prisma, runner } = setup({ overrideHash: 'old-posting-hash', storedRoleHash: postingHash });
      await runner.processTeam('run-1', { uid: 'team-1', name: 'Prime Intellect' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.suggestionCreateMany.mock.calls[0][0].data[0].payload.map((c: { text: string }) => c.text)).toEqual(
        overrideCriteria
      );
    });

    it('stores only enabled criteria on each suggestion and in the blurb prompt', async () => {
      const { prisma, runner } = setup({ overrideHash: postingHash });
      await runner.processTeam('run-1', { uid: 'team-1', name: 'Prime Intellect' });
      const prompt: string = generateTextMock.mock.calls[0][0].prompt;
      expect(prompt).not.toContain('Remote EU');
      const rows = prisma.suggestionCreateMany.mock.calls[0][0].data;
      expect(rows[0].payload).toEqual(enabled.map((text) => ({ text, matched: true })));
    });
  });

  describe('run-completed event (LAB-2850)', () => {
    function runnerFor(failingTeam = false) {
      const prisma = prismaMock();
      const jobMatchRun = {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ uid: 'run-1' }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      const events = { emit: jest.fn() };
      const runner = new JobMatchRunner({ ...prisma, jobMatchRun } as never, {} as never, events as never);
      const internals = runner as unknown as {
        loadTeams: () => Promise<{ uid: string; name: string }[]>;
        refreshLock: () => Promise<void>;
        inflight: Promise<void> | null;
      };
      jest.spyOn(internals, 'loadTeams').mockResolvedValue([{ uid: 'team-1', name: 'Prime Intellect' }]);
      jest.spyOn(internals, 'refreshLock').mockResolvedValue(undefined);
      jest
        .spyOn(runner, 'processTeam')
        .mockImplementation(async () => (failingTeam ? Promise.reject(new Error('boom')) : undefined));
      return { runner, events, jobMatchRun, settle: () => internals.inflight };
    }

    beforeEach(() => {
      process.env.ANTHROPIC_AUTH_MODE = 'wif';
      process.env.IS_JOB_MATCH_ENABLED = 'true';
    });

    it('emits once after a full run is marked COMPLETED', async () => {
      const { runner, events, jobMatchRun, settle } = runnerFor();
      await runner.start();
      await settle();
      expect(events.emit).toHaveBeenCalledTimes(1);
      expect(events.emit).toHaveBeenCalledWith(
        'job-match.run-completed',
        expect.objectContaining({ runUid: 'run-1', runDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
      );
      const completedOrder = jobMatchRun.update.mock.invocationCallOrder.at(-1) ?? 0;
      expect(jobMatchRun.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) })
      );
      expect(events.emit.mock.invocationCallOrder[0]).toBeGreaterThan(completedOrder);
    });

    it('does not emit for a team-limited run', async () => {
      const { runner, events, settle } = runnerFor();
      await runner.start(['team-1']);
      await settle();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('does not emit for a failed run', async () => {
      const { runner, events, jobMatchRun, settle } = runnerFor(true);
      await runner.start();
      await settle();
      expect(jobMatchRun.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) })
      );
      expect(events.emit).not.toHaveBeenCalled();
    });
  });
});
