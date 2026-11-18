// S5 page context (LAB-3302, contract section 9). The real IntroRequestsService, TeamsService (its
// `assertTeamVisibleToViewer` page rule) and JobOpeningsQueryService (`getJobOpening`) run against one fake Prisma.
// The fake applies the `where` filters as Prisma does and throws on a filter it does not know, so each visibility test
// checks the code, not the fake. Same light mocks as labos-agent-drafts.spec.ts.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), isAxiosError: () => false } }));
jest.mock('../guards/user-token-validation.guard', () => ({ UserTokenValidation: class UserTokenValidation {} }));
jest.mock('../husky/husky-ai.service', () => ({ HuskyAiService: jest.fn() }));
jest.mock('../team-news/team-news-query.service', () => ({ TeamNewsQueryService: jest.fn() }));
jest.mock('../team-news/team-news-suggestions.service', () => ({ TeamNewsSuggestionsService: jest.fn() }));
jest.mock('../mcp/mcp-tool-catalog', () => ({ McpToolCatalog: jest.fn() }));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({ AccessControlV2Service: jest.fn() }));
jest.mock('ai', () => ({ tool: (def: unknown) => def }));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MCP_SCOPE_KEYS } from 'libs/contracts/src/schema/mcp-scopes';
import { LabosAgentChatRequestSchema } from 'libs/contracts/src/schema/labos-agent';
import { IntroRequestsService } from '../intro-requests/intro-requests.service';
import { JobOpeningsQueryService } from '../job-openings/job-openings-query.service';
import { PL_INFRA_POLICY_CODE } from '../pl-infra-members/pl-infra-members.constants';
import { TeamsService } from '../teams/teams.service';
import { APP_ENV } from '../utils/constants';
import { LabosAgentAccessService } from './labos-agent-access.service';
import { LabosAgentController } from './labos-agent.controller';
import { LabosAgentProposalStore } from './labos-agent-proposals';
import { LabosAgentService } from './labos-agent.service';
import {
  JOB_BOARD_SENTENCE,
  JOB_PAGE_SENTENCE,
  MEMBER_PAGE_SENTENCE,
  PROFILE_PAGE_SENTENCE,
  TEAM_PAGE_SENTENCE,
} from './labos-agent-page-context';

const PAST = new Date('2000-01-01T00:00:00.000Z');
const FUTURE = new Date('2999-01-01T00:00:00.000Z');
const TEXT = 'I lead fundraising at Acme. We raise a seed round and want your advice.';
const VALID = { threadId: 'thread-1', chatId: 'chat-1', message: 'What does this page say?' };
const HIDDEN = [
  'STALE',
  'CLOSED_DUPLICATE',
  'CLOSED_INCORRECT_SIGNAL',
  'CLOSED_NOT_HIRING_SIGNAL',
  'CLOSED_ROLE_FILLED',
];

type Role = { teamUid: string; role: string; endDate: Date | null };
type Person = {
  uid: string;
  name: string;
  email: string;
  deletedAt: Date | null;
  bio: string | null;
  telegramHandler: string | null;
  twitterHandler: string | null;
  officeHours: string | null;
  skills: string[];
  roles: Role[];
  policies: string[];
};
type Team = { uid: string; name: string; status: string; accessLevel: string | null; shortDescription: string | null };
type Job = {
  uid: string;
  teamUid: string | null;
  status: string;
  roleTitle: string;
  descriptionHtml: string | null;
  [key: string]: unknown;
};

const person = (uid: string, name: string, extra: Partial<Person> = {}): Person => ({
  uid,
  name,
  email: `${uid}@example.com`,
  deletedAt: null,
  bio: null,
  telegramHandler: null,
  twitterHandler: null,
  officeHours: null,
  skills: [],
  roles: [],
  policies: [],
  ...extra,
});

const job = (uid: string, extra: Partial<Job> = {}): Job => ({
  uid,
  teamUid: 't-acme',
  status: 'NEW',
  roleTitle: `Role ${uid}`,
  roleCategory: 'Engineering',
  seniority: 'Senior',
  location: ['Remote'],
  workMode: 'Remote',
  sourceLink: `https://jobs.example.com/${uid}`,
  descriptionHtml: '<p>Build <b>things</b>.</p>',
  postedDate: new Date('2026-11-01T00:00:00.000Z'),
  detectionDate: new Date('2026-10-30T00:00:00.000Z'),
  updatedAt: new Date('2026-11-02T00:00:00.000Z'),
  department: 'R&D',
  payMin: 100,
  payMax: 200,
  payCurrency: 'USD',
  payPeriod: 'year',
  equityNote: null,
  ...extra,
});

/** Throws on a filter key the fake does not know, so a new filter in the code cannot pass by accident. */
function known(where: Record<string, unknown>, keys: string[]) {
  for (const key of Object.keys(where)) {
    if (!keys.includes(key)) throw new Error(`fake Prisma: unsupported filter ${key}`);
  }
}

function matchJob(row: Job, where: any): boolean {
  if (!where) return true;
  known(where, ['status', 'teamUid', 'uid', 'AND']);
  if (where.status?.notIn && where.status.notIn.includes(row.status)) return false;
  if (where.teamUid !== undefined) {
    const t = where.teamUid;
    if (typeof t === 'string' && row.teamUid !== t) return false;
    if (t && typeof t === 'object' && 'not' in t && t.not === null && row.teamUid === null) return false;
    if (t && typeof t === 'object' && 'in' in t && !t.in.includes(row.teamUid)) return false;
  }
  if (where.uid !== undefined && row.uid !== where.uid) return false;
  if (where.AND && !where.AND.every((item: any) => matchJob(row, item))) return false;
  return true;
}

function pick(row: Record<string, unknown>, select: Record<string, unknown> | undefined) {
  if (!select) return row;
  return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
}

type Viewer = { isDirectoryAdmin?: boolean; leadingTeams?: string[]; policies?: string[] };

function setup(viewer: Viewer = {}, env: string = APP_ENV.DEV) {
  process.env.ENVIRONMENT = env;
  const people: Person[] = [
    person('m-ada', 'Ada', { policies: viewer.policies ?? [PL_INFRA_POLICY_CODE] }),
    person('m-grace', 'Grace Hopper', {
      email: 'grace.private@example.com',
      bio: `<p>Rear admiral and <b>computer</b> pioneer.</p>${'<p>More text.</p>'.repeat(150)}`,
      telegramHandler: 'grace_tg',
      twitterHandler: 'grace_x',
      officeHours: 'https://calendly.example.com/grace',
      skills: ['Compilers', 'COBOL'],
      roles: [
        { teamUid: 't-acme', role: 'Advisor', endDate: null },
        { teamUid: 't-future', role: 'Lead', endDate: FUTURE },
        { teamUid: 't-old', role: 'Engineer', endDate: PAST },
        { teamUid: 't-deleted', role: 'Founder', endDate: null },
      ],
    }),
    person('m-gone', 'Gone', { deletedAt: PAST }),
  ];
  const teams = new Map<string, Team>(
    [
      { uid: 't-acme', name: 'Acme Team', status: 'ACTIVE', accessLevel: 'L1', shortDescription: 'We build rockets.' },
      { uid: 't-future', name: 'Future Team', status: 'ACTIVE', accessLevel: 'L2', shortDescription: null },
      { uid: 't-old', name: 'Old Team', status: 'ACTIVE', accessLevel: 'L2', shortDescription: null },
      { uid: 't-deleted', name: 'Deleted Team', status: 'INACTIVE', accessLevel: 'L1', shortDescription: 'Gone.' },
      { uid: 't-l0', name: 'Hidden Team', status: 'ACTIVE', accessLevel: 'L0', shortDescription: 'Not public.' },
    ].map((team) => [team.uid, team])
  );
  const jobs: Job[] = [
    job('j-open', { jobReferEmail: 'refer@acme.example.com' } as Partial<Job>),
    job('j-confirmed', { status: 'CONFIRMED' }),
    ...HIDDEN.map((status) => job(`j-${status.toLowerCase()}`, { status })),
    job('j-no-team', { teamUid: null }),
    // Q4: a job of a deleted (INACTIVE) team still shows, as on GET /v1/job-openings/:uid (bug LAB-3322).
    job('j-deleted-team', { teamUid: 't-deleted' }),
  ];
  const interests = [{ jobOpeningUid: 'j-open', memberUid: 'm-ada' }];

  /** The S3 requester select: the PL Infra policy filter, so the real C3 rule decides eligibility. */
  const requester = (row: Person, select: any) => {
    const code: string = select.policyAssignmentsV2.where.policy.code;
    return {
      uid: row.uid,
      name: row.name,
      teamMemberRoles: [],
      policyAssignmentsV2: row.policies.filter((item) => item === code).map((item) => ({ uid: `pa-${item}` })),
    };
  };

  /** The member page select. Honours the role filters (team status, end date) as Prisma does. */
  const memberPage = (row: Person, select: any) => {
    const roleWhere = select.teamMemberRoles.where;
    known(roleWhere, ['team', 'OR']);
    const notStatus = roleWhere.team?.status?.not;
    const since: Date | undefined = roleWhere.OR?.[1]?.endDate?.gte;
    const roles = row.roles.filter((role) => {
      const team = teams.get(role.teamUid);
      if (!team) return false;
      if (notStatus !== undefined && team.status === notStatus) return false;
      if (since !== undefined && role.endDate !== null && role.endDate < since) return false;
      return true;
    });
    // The whole row comes back (more than Prisma would give), so the test proves the code picks the public fields.
    return {
      ...row,
      skills: row.skills.map((title) => ({ title })),
      teamMemberRoles: roles.map((role) => ({
        role: role.role,
        team: { uid: role.teamUid, name: teams.get(role.teamUid)?.name },
      })),
    };
  };

  const prisma = {
    member: {
      findFirst: jest.fn(async ({ where, select }: any) => {
        known(where, ['uid', 'email', 'deletedAt']);
        const row = people.find(
          (item) =>
            (where.email ? item.email === where.email : item.uid === where.uid) &&
            (!('deletedAt' in where) || item.deletedAt === where.deletedAt)
        );
        if (!row) return null;
        if (where.email) return requester(row, select);
        if (select?.bio) return memberPage(row, select);
        return { name: row.name };
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const row = people.find((item) => item.email === where.email || item.uid === where.uid);
        return row ? { uid: row.uid, deletedAt: row.deletedAt } : null;
      }),
    },
    team: {
      findUnique: jest.fn(async ({ where, select }: any) => {
        const team = teams.get(where.uid);
        return team ? pick(team, select) : null;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        known(where, ['uid', 'status']);
        const team = teams.get(where.uid);
        if (!team) return null;
        if (where.status?.not !== undefined && team.status === where.status.not) return null;
        return team;
      }),
      count: jest.fn(
        async ({ where }: any) =>
          [...teams.values()].filter((team) =>
            jobs.some((row) => row.teamUid === team.uid && matchJob(row, where.jobOpenings.some))
          ).length
      ),
      findMany: jest.fn(async ({ where, select }: any) =>
        [...teams.values()]
          .filter((team) => where.uid.in.includes(team.uid))
          .map((team) => ({
            uid: team.uid,
            name: team.name,
            jobReferEmail: 'refer@acme.example.com',
            hasInactiveLeadEmails: false,
            logo: null,
            jobOpenings: jobs
              .filter((row) => row.teamUid === team.uid && matchJob(row, select.jobOpenings.where))
              .map((row) => pick(row, select.jobOpenings.select)),
          }))
      ),
    },
    jobOpening: {
      count: jest.fn(async ({ where }: any) => jobs.filter((row) => matchJob(row, where)).length),
      findMany: jest.fn(async ({ where }: any) =>
        jobs
          .filter((row) => matchJob(row, where))
          .map((row) => ({ ...row, team: row.teamUid ? { name: teams.get(row.teamUid)?.name } : null }))
      ),
    },
    teamFocusArea: { findMany: jest.fn(async () => []) },
    jobOpeningInterest: {
      groupBy: jest.fn(async ({ where }: any) => {
        const rows = interests.filter((item) => where.jobOpeningUid.in.includes(item.jobOpeningUid));
        return rows.length ? [{ jobOpeningUid: 'j-open', _count: { _all: rows.length } }] : [];
      }),
      findMany: jest.fn(async ({ where }: any) =>
        interests.filter(
          (item) => where.jobOpeningUid.in.includes(item.jobOpeningUid) && item.memberUid === where.memberUid
        )
      ),
    },
    teamInterest: { groupBy: jest.fn(async () => []), findMany: jest.fn(async () => []) },
    introRequest: { create: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  };
  const membersService = {
    findMemberByEmail: jest.fn(async () => ({
      uid: 'm-ada',
      isDirectoryAdmin: !!viewer.isDirectoryAdmin,
      leadingTeams: viewer.leadingTeams ?? [],
    })),
  };
  const none = {} as any;
  const teamsService = new TeamsService(
    prisma as any,
    none,
    membersService as any,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    none
  );
  const jobsService = new JobOpeningsQueryService(prisma as any);
  const introRequests = new IntroRequestsService(prisma as any, { send: jest.fn() } as any);
  const husky = { createContextualToolsResponse: jest.fn().mockResolvedValue({ pipeTo: jest.fn() }) };
  const service = new LabosAgentService(
    prisma as any,
    new LabosAgentAccessService(),
    husky as any,
    { getTeamNewsItemDto: jest.fn() } as any,
    { forApp: jest.fn(() => []) } as any,
    { getMemberAccess: jest.fn().mockResolvedValue({ effectivePermissions: [] }) } as any,
    new LabosAgentProposalStore({ get: jest.fn(), set: jest.fn(), del: jest.fn() } as any),
    { adminCaps: jest.fn(async () => Object.fromEntries(MCP_SCOPE_KEYS.map((key) => [key, 'write']))) } as any,
    introRequests,
    teamsService,
    jobsService
  );
  const controller = new LabosAgentController(service);
  const req = { userEmail: 'm-ada@example.com' };
  const res = { setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(), end: jest.fn(), destroy: jest.fn() };

  /** One chat turn: the model calls draft_intro with each args object, in order. */
  const turn = async (context: unknown, ...calls: Array<Record<string, unknown>>) => {
    await controller.chat({ ...VALID, context }, req, res as any);
    const options = husky.createContextualToolsResponse.mock.calls.at(-1)[3];
    const texts: string[] = [];
    for (const args of calls) texts.push(await options.extraTools.draft_intro.execute(args));
    return {
      texts,
      drafts: options.extraResponseFields.drafts as Array<Record<string, any>>,
      prompt: options.promptContext as string,
    };
  };
  const chatError = (context: unknown) =>
    controller.chat({ ...VALID, context }, req, res as any).then(
      () => null,
      (error) => error
    );
  const spies = {
    assert: jest.spyOn(teamsService, 'assertTeamVisibleToViewer'),
    getJob: jest.spyOn(jobsService, 'getJobOpening'),
  };
  return { prisma, husky, res, turn, chatError, spies, membersService };
}

/** The JSON after the label in the prompt context. */
function promptRow(prompt: string, label: string) {
  const start = prompt.indexOf(`${label}: `) + label.length + 2;
  let depth = 0;
  for (let i = start; i < prompt.length; i++) {
    if (prompt[i] === '{') depth++;
    if (prompt[i] === '}' && --depth === 0) return JSON.parse(prompt.slice(start, i + 1));
  }
  throw new Error(`no ${label} JSON in prompt`);
}

function expect404(error: any, code: string, h: ReturnType<typeof setup>) {
  expect(error).toBeInstanceOf(NotFoundException);
  expect(error.getResponse()).toEqual({ statusCode: 404, code, message: expect.any(String) });
  expect(h.husky.createContextualToolsResponse).not.toHaveBeenCalled();
  expect(h.res.flushHeaders).not.toHaveBeenCalled();
}

const parse = (context: unknown) => LabosAgentChatRequestSchema.safeParse({ ...VALID, context });
const paths = (context: unknown) => {
  const result = parse(context);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

describe('LabOS agent page context (LAB-3302)', () => {
  const originalEnv = process.env.ENVIRONMENT;
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => {
    process.env.ENVIRONMENT = originalEnv;
  });

  describe('schema', () => {
    it.each([
      ['member', { page: 'member', memberUid: 'm-grace' }],
      ['team', { page: 'team', teamUid: 't-acme' }],
      ['job with jobUid', { page: 'job', jobUid: 'j-open' }],
      ['job board', { page: 'job' }],
      ['profile', { page: 'profile' }],
    ])('S5-C1: accepts the %s context', (_name, context) => {
      const result = parse(context);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.context).toEqual(context);
    });

    it('S5-C2: member with no memberUid gives 400 VALIDATION_ERROR with path context.memberUid', async () => {
      expect(paths({ page: 'member' })).toEqual(['context.memberUid']);
      const h = setup();
      const error = await h.chatError({ page: 'member' });
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).toEqual(
        expect.objectContaining({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          errors: [expect.objectContaining({ path: 'context.memberUid' })],
        })
      );
      expect(h.husky.createContextualToolsResponse).not.toHaveBeenCalled();
    });

    it('S5-C3: team with no teamUid gives 400 with path context.teamUid', () => {
      expect(paths({ page: 'team' })).toEqual(['context.teamUid']);
    });

    it.each([
      ['home', { page: 'home', memberUid: 'm-grace' }],
      ['team', { page: 'team', teamUid: 't-acme', memberUid: 'm-grace' }],
      ['profile', { page: 'profile', memberUid: 'm-grace' }],
      ['job', { page: 'job', memberUid: 'm-grace' }],
    ])('S5-C4: memberUid on the %s page gives 400', (_name, context) => {
      expect(paths(context)).toContain('context.memberUid');
    });

    it.each([
      ['home', { page: 'home', teamUid: 't-acme' }],
      ['member', { page: 'member', memberUid: 'm-grace', teamUid: 't-acme' }],
      ['profile', { page: 'profile', teamUid: 't-acme' }],
      ['job', { page: 'job', teamUid: 't-acme' }],
    ])('S5-C5: teamUid on the %s page gives 400', (_name, context) => {
      expect(paths(context)).toContain('context.teamUid');
    });

    it.each([
      ['home', { page: 'home', jobUid: 'j-open' }],
      ['profile', { page: 'profile', jobUid: 'j-open' }],
      ['member', { page: 'member', memberUid: 'm-grace', jobUid: 'j-open' }],
      ['team', { page: 'team', teamUid: 't-acme', jobUid: 'j-open' }],
    ])('S5-C6: jobUid on the %s page gives 400', (_name, context) => {
      expect(paths(context)).toContain('context.jobUid');
    });

    it.each([
      ['memberUid', 'member'],
      ['teamUid', 'team'],
      ['jobUid', 'job'],
    ])('S5-C7: %s of 0 or 65 characters gives 400, 64 passes', (field, page) => {
      expect(paths({ page, [field]: '' })).toContain(`context.${field}`);
      expect(paths({ page, [field]: 'x'.repeat(65) })).toContain(`context.${field}`);
      expect(parse({ page, [field]: 'x'.repeat(64) }).success).toBe(true);
    });

    it.each([
      ['no context', undefined, true],
      ['home', { page: 'home' }, true],
      ['news-story', { page: 'news-story', newsUid: 'news-1' }, true],
      ['news-story with no newsUid', { page: 'news-story' }, false],
      ['home with a newsUid (S1 allows it)', { page: 'home', newsUid: 'news-1' }, true],
      ['intro', { page: 'intro', introTarget: { type: 'member', uid: 'm-grace' } }, true],
      ['intro with no target', { page: 'intro' }, false],
      ['home with an introTarget', { page: 'home', introTarget: { type: 'team', uid: 't-acme' } }, false],
      ['an unknown page', { page: 'forum' }, false],
    ])('S5-C8: the S1 or S3 body (%s) parses as before', (_name, context, ok) => {
      expect(parse(context).success).toBe(ok);
    });
  });

  describe('lookups before the stream', () => {
    it.each([
      ['an unknown member', 'm-missing'],
      ['a deleted member', 'm-gone'],
    ])('S5-C9: %s gives 404 MEMBER_NOT_FOUND and no model call', async (_name, memberUid) => {
      const h = setup();
      expect404(await h.chatError({ page: 'member', memberUid }), 'MEMBER_NOT_FOUND', h);
    });

    it('S5-C10: an unknown teamUid gives 404 TEAM_NOT_FOUND', async () => {
      const h = setup();
      expect404(await h.chatError({ page: 'team', teamUid: 't-missing' }), 'TEAM_NOT_FOUND', h);
    });

    it('S5-C11: an INACTIVE team gives 404 TEAM_NOT_FOUND to a member who is not a directory admin', async () => {
      const h = setup();
      expect404(await h.chatError({ page: 'team', teamUid: 't-deleted' }), 'TEAM_NOT_FOUND', h);
    });

    it('S5-C11: a directory admin gets 200 on an INACTIVE team, and the turn has no intro target', async () => {
      const h = setup({ isDirectoryAdmin: true });
      const { prompt, texts, drafts } = await h.turn(
        { page: 'team', teamUid: 't-deleted' },
        { type: 'team', targetUid: 't-deleted', text: TEXT }
      );
      expect(promptRow(prompt, 'Team')).toEqual({ uid: 't-deleted', name: 'Deleted Team', shortDescription: 'Gone.' });
      expect(prompt).not.toContain('draft_intro');
      expect(texts[0]).toContain('not the intro target of this turn');
      expect(drafts).toEqual([]);
    });

    it('S5-C12: an L0 team gives 404 TEAM_NOT_FOUND (not 403) to a member who is not a lead or admin', async () => {
      const h = setup({ leadingTeams: ['t-acme'] });
      const error = await h.chatError({ page: 'team', teamUid: 't-l0' });
      expect(error).not.toBeInstanceOf(ForbiddenException);
      expect404(error, 'TEAM_NOT_FOUND', h);
    });

    it.each([
      ['a lead of the team', { leadingTeams: ['t-l0'] }],
      ['a directory admin', { isDirectoryAdmin: true }],
    ])('S5-C12: %s gets 200 on an L0 team', async (_name, viewer) => {
      const h = setup(viewer);
      const { prompt } = await h.turn({ page: 'team', teamUid: 't-l0' });
      expect(promptRow(prompt, 'Team').uid).toBe('t-l0');
      expect(h.spies.assert).toHaveBeenCalledWith('t-l0', 'm-ada@example.com');
    });

    it.each([
      ['an unknown jobUid', 'j-missing'],
      ...HIDDEN.map((status) => [`hidden status ${status}`, `j-${status.toLowerCase()}`]),
      ['a job with no team', 'j-no-team'],
    ])('S5-C13: %s gives 404 JOB_NOT_FOUND', async (_name, jobUid) => {
      const h = setup();
      expect404(await h.chatError({ page: 'job', jobUid }), 'JOB_NOT_FOUND', h);
      expect(h.spies.getJob).toHaveBeenCalledWith(jobUid, 'm-ada@example.com');
    });

    it.each([
      ['NEW', 'j-open'],
      ['CONFIRMED', 'j-confirmed'],
      ['a job of an INACTIVE team (Q4, as the GET does)', 'j-deleted-team'],
    ])('S5-C13: a visible job (%s) gets 200', async (_name, jobUid) => {
      const h = setup();
      const { prompt } = await h.turn({ page: 'job', jobUid });
      expect(promptRow(prompt, 'Job').uid).toBe(jobUid);
    });

    it('S5-C14: the job board makes no job lookup and gives the job board context', async () => {
      const h = setup();
      const { prompt } = await h.turn({ page: 'job' });
      expect(prompt).toBe(JOB_BOARD_SENTENCE);
      expect(h.spies.getJob).not.toHaveBeenCalled();
      expect(h.prisma.jobOpening.findMany).not.toHaveBeenCalled();
    });

    it.each([
      ['an unknown teamUid', { page: 'team', teamUid: 't-missing' }],
      ['an unknown memberUid', { page: 'member', memberUid: 'm-missing' }],
      ['an unknown jobUid', { page: 'job', jobUid: 'j-missing' }],
    ])('S5-C15: a member outside the gate gets 403 AGENT_NOT_ENABLED with %s, and no lookup runs', async (_n, ctx) => {
      const h = setup({}, APP_ENV.PRODUCTION);
      const error = await h.chatError(ctx);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.getResponse()).toEqual(expect.objectContaining({ statusCode: 403, code: 'AGENT_NOT_ENABLED' }));
      expect(h.spies.assert).not.toHaveBeenCalled();
      expect(h.spies.getJob).not.toHaveBeenCalled();
      expect(h.prisma.member.findFirst).not.toHaveBeenCalled();
      expect(h.husky.createContextualToolsResponse).not.toHaveBeenCalled();
    });

    it('S5-C16: the member page with the own uid gets the profile context and no lookup', async () => {
      const h = setup();
      const { prompt } = await h.turn({ page: 'member', memberUid: 'm-ada' });
      const profile = await h.turn({ page: 'profile' });
      expect(prompt).toBe(profile.prompt);
      expect(prompt.startsWith(PROFILE_PAGE_SENTENCE)).toBe(true);
      expect(h.prisma.member.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('prompt context', () => {
    it('S5-C17: the member context has only uid, name, bio, teams and skills; no email, handle or Telegram', async () => {
      const h = setup();
      const { prompt } = await h.turn({ page: 'member', memberUid: 'm-grace' });
      expect(prompt.startsWith(MEMBER_PAGE_SENTENCE)).toBe(true);
      const row = promptRow(prompt, 'Member');
      expect(Object.keys(row)).toEqual(['uid', 'name', 'bio', 'teams', 'skills']);
      expect(row.uid).toBe('m-grace');
      expect(row.name).toBe('Grace Hopper');
      expect(row.skills).toEqual(['Compilers', 'COBOL']);
      for (const secret of ['grace.private@example.com', 'grace_tg', 'grace_x', 'calendly.example.com']) {
        expect(prompt).not.toContain(secret);
      }
    });

    it('S5-C17: teams are the current roles on teams that are not INACTIVE', async () => {
      const h = setup();
      const { prompt } = await h.turn({ page: 'member', memberUid: 'm-grace' });
      expect(promptRow(prompt, 'Member').teams).toEqual([
        { uid: 't-acme', name: 'Acme Team', role: 'Advisor' },
        { uid: 't-future', name: 'Future Team', role: 'Lead' },
      ]);
      expect(prompt).not.toContain('Deleted Team');
      expect(prompt).not.toContain('Old Team');
    });

    it('S5-C18: the member bio is plain text of up to 1000 characters', async () => {
      const h = setup();
      const { prompt } = await h.turn({ page: 'member', memberUid: 'm-grace' });
      const { bio } = promptRow(prompt, 'Member');
      expect(bio.startsWith('Rear admiral and computer pioneer. More text.')).toBe(true);
      expect(bio).not.toMatch(/[<>]/);
      expect(bio).toHaveLength(1000);
    });

    it('S5-C19: the job context has the public fields and no jobReferEmail, interestedCount or viewerIsInterested', async () => {
      const h = setup();
      const { prompt } = await h.turn({ page: 'job', jobUid: 'j-open' });
      expect(prompt.startsWith(JOB_PAGE_SENTENCE)).toBe(true);
      const row = promptRow(prompt, 'Job');
      expect(row).toEqual({
        uid: 'j-open',
        roleTitle: 'Role j-open',
        team: { uid: 't-acme', name: 'Acme Team' },
        roleCategory: 'Engineering',
        seniority: 'Senior',
        location: ['Remote'],
        workMode: 'Remote',
        department: 'R&D',
        postedDate: '2026-11-01T00:00:00.000Z',
        pay: { min: 100, max: 200, currency: 'USD', period: 'year' },
        applyUrl: 'https://jobs.example.com/j-open',
        description: 'Build things.',
      });
      for (const hidden of ['jobReferEmail', 'refer@acme.example.com', 'interestedCount', 'viewerIsInterested']) {
        expect(prompt).not.toContain(hidden);
      }
    });

    it('S5-C19: the job description is plain text of up to 2000 characters, and pay is absent when not set', async () => {
      const h = setup();
      const long = `<p>${'y'.repeat(2500)}</p>`;
      h.spies.getJob.mockResolvedValue({
        team: { uid: 't-acme', name: 'Acme Team' },
        roles: [{ uid: 'j-x', roleTitle: 'X', descriptionHtml: long, pay: null }],
      } as any);
      const { prompt } = await h.turn({ page: 'job', jobUid: 'j-x' });
      const row = promptRow(prompt, 'Job');
      expect(row.description).toBe('y'.repeat(2000));
      expect('pay' in row).toBe(false);
    });

    it('S5-C20: the profile context has only the session member uid and the get_my_profile hint', async () => {
      const h = setup();
      const { prompt } = await h.turn({ page: 'profile' });
      expect(prompt).toBe(`${PROFILE_PAGE_SENTENCE} Member: ${JSON.stringify({ uid: 'm-ada' })}`);
      expect(prompt).toContain('get_my_profile');
      expect(h.prisma.member.findFirst).not.toHaveBeenCalled();
    });

    it('S5-C20: the team context has uid, name and shortDescription', async () => {
      const h = setup();
      const { prompt } = await h.turn({ page: 'team', teamUid: 't-acme' });
      expect(prompt.startsWith(TEAM_PAGE_SENTENCE)).toBe(true);
      expect(promptRow(prompt, 'Team')).toEqual({
        uid: 't-acme',
        name: 'Acme Team',
        shortDescription: 'We build rockets.',
      });
    });
  });

  describe('intro drafts on pages (Q1 A)', () => {
    it.each([
      ['team', { page: 'team', teamUid: 't-acme' }, { type: 'team', targetUid: 't-acme' }, 'Acme Team'],
      ['member', { page: 'member', memberUid: 'm-grace' }, { type: 'member', targetUid: 'm-grace' }, 'Grace Hopper'],
    ])('S5-C21: an eligible member on a %s page gets 1 draft for the page target', async (_n, ctx, args, name) => {
      const h = setup();
      const { prompt, drafts } = await h.turn(ctx, { ...args, text: TEXT });
      expect(prompt).toContain('draft_intro');
      expect(drafts).toEqual([
        expect.objectContaining({
          kind: 'intro',
          target: { type: args.type, uid: args.targetUid, name },
          text: TEXT,
          source: 'agent',
        }),
      ]);
      expect(h.prisma.introRequest.create).not.toHaveBeenCalled();
    });

    it('S5-C21: a member who fails the C3 rule gets no draft on a team page', async () => {
      const h = setup({ policies: [] });
      const { texts, drafts } = await h.turn(
        { page: 'team', teamUid: 't-acme' },
        { type: 'team', targetUid: 't-acme', text: TEXT }
      );
      expect(drafts).toEqual([]);
      expect(texts[0]).toContain('Only members of portfolio teams and PL Infra can');
    });

    it.each([
      ['team page, another team', { page: 'team', teamUid: 't-acme' }, { type: 'team', targetUid: 't-future' }],
      ['team page, a member', { page: 'team', teamUid: 't-acme' }, { type: 'member', targetUid: 'm-grace' }],
      ['member page, another member', { page: 'member', memberUid: 'm-grace' }, { type: 'member', targetUid: 'm-x' }],
      ['member page, a team', { page: 'member', memberUid: 'm-grace' }, { type: 'team', targetUid: 't-acme' }],
    ])('S5-C22: draft_intro with another uid (%s) gives no draft', async (_name, ctx, args) => {
      const h = setup();
      const { texts, drafts } = await h.turn(ctx, { ...args, text: TEXT });
      expect(drafts).toEqual([]);
      expect(texts[0]).toContain('not the intro target of this turn');
    });

    it.each([
      ['profile', { page: 'profile' }, { type: 'member', targetUid: 'm-ada' }],
      ['own member page', { page: 'member', memberUid: 'm-ada' }, { type: 'member', targetUid: 'm-ada' }],
      ['job', { page: 'job', jobUid: 'j-open' }, { type: 'team', targetUid: 't-acme' }],
      ['job board', { page: 'job' }, { type: 'team', targetUid: 't-acme' }],
      ['home', { page: 'home' }, { type: 'member', targetUid: 'm-grace' }],
    ])('S5-C23: draft_intro on the %s page gives no draft', async (_name, ctx, args) => {
      const h = setup();
      const { prompt, texts, drafts } = await h.turn(ctx, { ...args, text: TEXT });
      expect(prompt).not.toContain('draft_intro');
      expect(drafts).toEqual([]);
      expect(texts[0]).toContain('not the intro target of this turn');
    });
  });
});
