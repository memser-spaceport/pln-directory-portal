jest.mock('ai', () => ({ generateText: jest.fn() }));

import { generateText } from 'ai';
import { JobMatchRunner } from './job-match-runner.service';
import { profileText, profileTextHash, rolePosting, roleTextHash } from './job-match.logic';

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
    const runner = new JobMatchRunner(prisma as never, {} as never);
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
    const runner = new JobMatchRunner(prisma as never, {} as never);
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

    const runner = new JobMatchRunner(prisma as never, { getResponsesModel: () => 'model' } as never);
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
        }),
      ],
    });
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

    const runner = new JobMatchRunner(prisma as never, {} as never);
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
});
