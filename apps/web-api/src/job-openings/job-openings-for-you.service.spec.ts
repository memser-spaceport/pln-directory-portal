import { JobTeamGroupSchema } from 'libs/contracts/src/schema/job-opening';
import type { PrismaService } from '../shared/prisma.service';
import type { TeamNewsSuggestionsService } from '../team-news/team-news-suggestions.service';
import { JobOpeningsForYouService } from './job-openings-for-you.service';
import type { JobOpeningsQueryService } from './job-openings-query.service';

const NOW = new Date('2026-09-10T12:00:00.000Z');

type MemberRow = {
  uid: string;
  role: string | null;
  deletedAt: Date | null;
  skills: Array<{ title: string }>;
  experiences: Array<{ title: string }>;
  teamMemberRoles: Array<{ teamUid: string; role: string | null }>;
};

const member = (overrides: Partial<MemberRow> = {}): MemberRow => ({
  uid: 'me',
  role: null,
  deletedAt: null,
  skills: [],
  experiences: [],
  teamMemberRoles: [],
  ...overrides,
});

const team = (uid: string, name = `Team ${uid}`) => ({
  uid,
  name,
  jobReferEmail: null,
  logo: null,
  teamFocusAreas: [
    {
      focusArea: { title: 'Protocol Research' },
      ancestorArea: { title: 'AI & Robotics' },
    },
  ],
});

const job = (uid: string, teamUid: string, overrides: Record<string, unknown> = {}) => ({
  uid,
  teamUid,
  roleTitle: `Role ${uid}`,
  roleCategory: null,
  department: null,
  seniority: null,
  location: ['Remote'],
  workMode: null,
  sourceLink: `https://jobs.example.com/${uid}`,
  descriptionHtml: null,
  postedDate: NOW,
  detectionDate: NOW,
  updatedAt: NOW,
  team: team(teamUid),
  ...overrides,
});

/** The whole board reaches the service through one findMany, so the fixture is
 *  the list of postings in the window and the assertions are about what the
 *  matcher keeps, how it groups it, and in what order. */
const build = ({
  memberRow,
  jobs,
  forYouTeamUids = [],
}: {
  memberRow: MemberRow | null;
  jobs: ReturnType<typeof job>[];
  forYouTeamUids?: string[];
}) => {
  const findMany = jest.fn().mockResolvedValue(jobs);
  const prisma = {
    member: { findUnique: jest.fn().mockResolvedValue(memberRow) },
    jobOpening: { findMany },
  } as unknown as PrismaService;
  const queryService = {
    loadInterestStamps: jest.fn().mockResolvedValue({ counts: new Map(), viewerInterested: new Set() }),
  } as unknown as JobOpeningsQueryService;
  const getForYouTeamUids = jest.fn().mockResolvedValue(forYouTeamUids);
  const suggestions = { getForYouTeamUids } as unknown as TeamNewsSuggestionsService;

  return {
    service: new JobOpeningsForYouService(prisma, queryService, suggestions),
    findMany,
    getForYouTeamUids,
  };
};

describe('JobOpeningsForYouService.listForYou', () => {
  it('answers empty for an anonymous caller without touching the board', async () => {
    const { service, findMany } = build({ memberRow: null, jobs: [] });

    await expect(service.listForYou(undefined)).resolves.toEqual({ groups: [] });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('answers empty for a deleted member', async () => {
    const { service } = build({ memberRow: member({ deletedAt: NOW }), jobs: [job('r1', 't1')] });

    await expect(service.listForYou('me@example.com')).resolves.toEqual({ groups: [] });
  });

  it('keeps a job whose team the news For You already covers', async () => {
    const { service } = build({
      memberRow: member(),
      jobs: [job('r1', 't1'), job('r2', 't2')],
      forYouTeamUids: ['t1'],
    });

    const { groups } = await service.listForYou('me@example.com');

    expect(groups.map((g) => g.team.uid)).toEqual(['t1']);
  });

  it('keeps a job matching the member’s role at a team they have no relationship with', async () => {
    const { service } = build({
      memberRow: member({ teamMemberRoles: [{ teamUid: 'own', role: 'Backend Engineer' }] }),
      jobs: [job('r1', 't1', { roleTitle: 'Senior Backend Engineer' }), job('r2', 't2', { roleTitle: 'Recruiter' })],
    });

    const { groups } = await service.listForYou('me@example.com');

    expect(groups.map((g) => g.team.uid)).toEqual(['t1']);
  });

  it('matches on skills and on past experience titles', async () => {
    const { service } = build({
      memberRow: member({ skills: [{ title: 'Solidity' }], experiences: [{ title: 'Data Scientist' }] }),
      jobs: [job('r1', 't1', { roleTitle: 'Solidity Engineer' }), job('r2', 't2', { roleTitle: 'Research Scientist' })],
    });

    const { groups } = await service.listForYou('me@example.com');

    expect(groups.map((g) => g.team.uid).sort()).toEqual(['t1', 't2']);
  });

  it('drops a job matching on neither signal', async () => {
    const { service } = build({
      memberRow: member({ role: 'Backend Engineer' }),
      jobs: [job('r1', 't1', { roleTitle: 'Community Manager' })],
    });

    await expect(service.listForYou('me@example.com')).resolves.toEqual({ groups: [] });
  });

  it('excludes the member’s own teams in the query, so neither signal can bring them back', async () => {
    const { service, findMany } = build({
      memberRow: member({ teamMemberRoles: [{ teamUid: 'own', role: 'Backend Engineer' }] }),
      jobs: [],
      // A team the member belongs to is in the news For You set by definition.
      forYouTeamUids: ['own', 't1'],
    });

    await service.listForYou('me@example.com');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ NOT: { teamUid: { in: ['own'] } } }]),
        }),
      })
    );
  });

  it('ranks a job matching both signals above one matching only text, and text above team-only', async () => {
    const { service } = build({
      memberRow: member({ role: 'Backend Engineer' }),
      jobs: [
        job('team-only', 't-team', { roleTitle: 'Community Manager' }),
        job('text-only', 't-text', { roleTitle: 'Backend Engineer' }),
        job('both', 't-both', { roleTitle: 'Backend Engineer' }),
      ],
      forYouTeamUids: ['t-team', 't-both'],
    });

    const { groups } = await service.listForYou('me@example.com');

    expect(groups.map((g) => g.team.uid)).toEqual(['t-both', 't-text', 't-team']);
  });

  it('rolls a team’s matched roles into one group, freshest first, and counts only those', async () => {
    const older = new Date('2026-09-01T00:00:00.000Z');
    const { service } = build({
      memberRow: member({ role: 'Backend Engineer' }),
      jobs: [
        job('old', 't1', { roleTitle: 'Backend Engineer', postedDate: older }),
        job('new', 't1', { roleTitle: 'Staff Backend Engineer' }),
        job('unmatched', 't1', { roleTitle: 'Community Manager' }),
      ],
    });

    const { groups } = await service.listForYou('me@example.com');

    expect(groups).toHaveLength(1);
    expect(groups[0].roles.map((r) => r.uid)).toEqual(['new', 'old']);
    expect(groups[0].totalRoles).toBe(2);
  });

  it('returns groups the board’s own contract accepts', async () => {
    const { service } = build({ memberRow: member(), jobs: [job('r1', 't1')], forYouTeamUids: ['t1'] });

    const { groups } = await service.listForYou('me@example.com');

    expect(() => JobTeamGroupSchema.parse(groups[0])).not.toThrow();
  });
});
