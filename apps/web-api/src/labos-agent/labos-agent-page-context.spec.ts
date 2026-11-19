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
// The test runs the real TeamsService visibility rule. Its enrichment dependency pulls cheerio and undici, which need ReadableStream.
jest.mock('../team-enrichment/team-enrichment.service', () => ({ TeamEnrichmentService: jest.fn() }));
jest.mock('ai', () => ({ tool: (def: unknown) => def }));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MCP_SCOPE_KEYS } from 'libs/contracts/src/schema/mcp-scopes';
import { LabosAgentChatRequestSchema } from 'libs/contracts/src/schema/labos-agent';
import { MEMBER_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { IntroRequestsService } from '../intro-requests/intro-requests.service';
import { directoryVisibleMemberWhere } from '../members/member-visibility';
import { JobOpeningsQueryService } from '../job-openings/job-openings-query.service';
import { PL_INFRA_POLICY_CODE } from '../pl-infra-members/pl-infra-members.constants';
import { TeamsService } from '../teams/teams.service';
import { APP_ENV } from '../utils/constants';
import { LabosAgentAccessService } from './labos-agent-access.service';
import { LabosAgentController } from './labos-agent.controller';
import { LabosAgentProposalStore } from './labos-agent-proposals';
import { LabosAgentService } from './labos-agent.service';
import {
  HOME_MENTION_SENTENCE,
  JOB_BOARD_SENTENCE,
  JOB_PAGE_SENTENCE,
  MEMBER_PAGE_SENTENCE,
  MENTIONS_SENTENCE,
  NEWS_SOURCE_HINT,
  NO_PAGE_SENTENCE,
  PROFILE_HINT,
  PROFILE_PAGE_SENTENCE,
  TEAM_PAGE_SENTENCE,
} from './labos-agent-page-context';

const NEWS_ITEM = {
  uid: 'news-1',
  title: 'Acme raises a seed round',
  summary: 'Acme raised money.',
  eventType: 'FUNDING',
  eventDate: '2026-11-10T00:00:00.000Z',
  teamUid: 't-acme',
  teamName: 'Acme Team',
  sourceUrl: 'https://example.com/acme',
};
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
  /** The `memberApproval.state` (LAB-3318 review). */
  approval: 'APPROVED' | 'PENDING' | 'REJECTED' | null;
  /** Holds `member.profile.visible`. */
  profileVisible: boolean;
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
  approval: 'APPROVED',
  profileVisible: false,
  ...extra,
});

/** The rule of `directoryVisibleMemberWhere`: approved, or `member.profile.visible` and not REJECTED. */
const directoryVisible = (row: Person) =>
  row.approval === 'APPROVED' || (row.approval !== 'REJECTED' && row.profileVisible);
const VISIBLE_OR = JSON.stringify(directoryVisibleMemberWhere().OR);

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

type Viewer = { isDirectoryAdmin?: boolean; leadingTeams?: string[]; policies?: string[]; permissions?: string[] };

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
    // S6 (LAB-3318): a second member for the mention tests.
    person('m-alan', 'Alan Turing'),
    // LAB-3318 review: members who are not directory-visible, and one who is visible by permission only.
    person('m-pending', 'Pending Person', { approval: 'PENDING' }),
    person('m-rejected', 'Rejected Person', { approval: 'REJECTED', profileVisible: true }),
    person('m-no-approval', 'No Approval', { approval: null }),
    person('m-visible', 'Visible Person', { approval: 'PENDING', profileVisible: true }),
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
        known(where, ['uid', 'email', 'deletedAt', 'OR']);
        // The only `OR` the fake knows is the real `directoryVisibleMemberWhere()` rule.
        if (where.OR && JSON.stringify(where.OR) !== VISIBLE_OR) throw new Error('fake Prisma: unsupported OR');
        const row = people.find(
          (item) =>
            (where.email ? item.email === where.email : item.uid === where.uid) &&
            (!('deletedAt' in where) || item.deletedAt === where.deletedAt) &&
            (!where.OR || directoryVisible(item))
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
  const telegram = { send: jest.fn() };
  const introRequests = new IntroRequestsService(prisma as any, telegram as any);
  const husky = { createContextualToolsResponse: jest.fn().mockResolvedValue({ pipeTo: jest.fn() }) };
  // S6 (LAB-3318): the S1 news lookup for news mentions. Only `news-1` exists.
  const newsQuery = {
    getTeamNewsItemDto: jest.fn(async (uid: string) => (uid === NEWS_ITEM.uid ? NEWS_ITEM : null)),
  };
  // LAB-3318 review: the viewer has `member.search.read` unless the test says otherwise.
  const accessControl = {
    getMemberAccess: jest
      .fn()
      .mockResolvedValue({ effectivePermissions: viewer.permissions ?? [MEMBER_PERMISSIONS.SEARCH_READ] }),
  };
  const service = new LabosAgentService(
    prisma as any,
    new LabosAgentAccessService({ hasPermission: jest.fn().mockResolvedValue({ allowed: false }) } as any),
    husky as any,
    newsQuery as any,
    { forApp: jest.fn(() => []) } as any,
    accessControl as any,
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
  /** S6: one chat turn with any extra body fields (for example `mentions`). */
  const turnBody = async (extra: Record<string, unknown>, ...calls: Array<Record<string, unknown>>) => {
    await controller.chat({ ...VALID, ...extra }, req, res as any);
    const options = husky.createContextualToolsResponse.mock.calls.at(-1)[3];
    const texts: string[] = [];
    for (const args of calls) texts.push(await options.extraTools.draft_intro.execute(args));
    return {
      texts,
      drafts: options.extraResponseFields.drafts as Array<Record<string, any>>,
      prompt: options.promptContext as string,
    };
  };
  const chatErrorBody = (extra: Record<string, unknown>) =>
    controller.chat({ ...VALID, ...extra }, req, res as any).then(
      () => null,
      (error) => error
    );
  const chatError = (context: unknown) =>
    controller.chat({ ...VALID, context }, req, res as any).then(
      () => null,
      (error) => error
    );
  const spies = {
    assert: jest.spyOn(teamsService, 'assertTeamVisibleToViewer'),
    getJob: jest.spyOn(jobsService, 'getJobOpening'),
  };
  return {
    prisma,
    husky,
    res,
    turn,
    chatError,
    turnBody,
    chatErrorBody,
    spies,
    membersService,
    newsQuery,
    telegram,
    accessControl,
  };
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

    it.each([
      ['a pending member', 'm-pending'],
      ['a rejected member with member.profile.visible', 'm-rejected'],
      ['a member with no approval', 'm-no-approval'],
    ])('LAB-3318 review: %s (not directory-visible) gives 404 MEMBER_NOT_FOUND', async (_name, memberUid) => {
      const h = setup();
      expect404(await h.chatError({ page: 'member', memberUid }), 'MEMBER_NOT_FOUND', h);
      expect(h.prisma.member.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { uid: memberUid, deletedAt: null, ...directoryVisibleMemberWhere() } })
      );
    });

    it('LAB-3318 review: a pending member with member.profile.visible gives the member row', async () => {
      const h = setup();
      const { prompt } = await h.turn({ page: 'member', memberUid: 'm-visible' });
      expect(promptRow(prompt, 'Member')).toEqual(
        expect.objectContaining({ uid: 'm-visible', name: 'Visible Person' })
      );
    });

    it('LAB-3318 review: the member page needs no member.search.read (the S5 rule stays)', async () => {
      const h = setup({ permissions: [] });
      const { prompt } = await h.turn({ page: 'member', memberUid: 'm-grace' });
      expect(promptRow(prompt, 'Member').uid).toBe('m-grace');
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

// S6 @mentions in C1 (LAB-3318, contract 10.3, 10.4 and 10.6). The same fake Prisma and real page rules as S5.
describe('LabOS agent mentions in chat (LAB-3318)', () => {
  const originalEnv = process.env.ENVIRONMENT;
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => {
    process.env.ENVIRONMENT = originalEnv;
  });

  const mentionPaths = (mentions: unknown) => {
    const result = LabosAgentChatRequestSchema.safeParse({ ...VALID, mentions });
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
  };
  const ok = (mentions: unknown) => LabosAgentChatRequestSchema.safeParse({ ...VALID, mentions }).success;

  /** The mention 404: the S5 body plus `mentionIndex`, before the stream and the model. */
  function expectMention404(error: any, code: string, mentionIndex: number, h: ReturnType<typeof setup>) {
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toEqual({ statusCode: 404, code, message: expect.any(String), mentionIndex });
    expect(h.husky.createContextualToolsResponse).not.toHaveBeenCalled();
    expect(h.res.flushHeaders).not.toHaveBeenCalled();
  }

  /** The JSON row of mention line `n`. */
  function itemRow(prompt: string, n: number, type: string) {
    return promptRow(prompt, `Item ${n} (${type})`);
  }

  describe('schema', () => {
    it.each([
      ['member', [{ type: 'member', uid: 'm-grace' }]],
      ['team', [{ type: 'team', uid: 't-acme' }]],
      ['news', [{ type: 'news', uid: 'news-1' }]],
      ['page home', [{ type: 'page', page: 'home' }]],
      ['page job', [{ type: 'page', page: 'job' }]],
      ['page profile', [{ type: 'page', page: 'profile' }]],
      [
        '5 items',
        [
          { type: 'member', uid: 'm-grace' },
          { type: 'team', uid: 't-acme' },
          { type: 'news', uid: 'news-1' },
          { type: 'page', page: 'home' },
          { type: 'page', page: 'job' },
        ],
      ],
    ])('S6-C21: accepts mentions with %s', (_name, mentions) => {
      const result = LabosAgentChatRequestSchema.safeParse({ ...VALID, mentions });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.mentions).toEqual(mentions);
    });

    it('S6-C21: an empty mentions array and no mentions both parse', () => {
      expect(ok([])).toBe(true);
      expect(ok(undefined)).toBe(true);
    });

    it('S6-C21: the page value is job, not jobs', () => {
      expect(ok([{ type: 'page', page: 'jobs' }])).toBe(false);
    });

    it('S6-C22: 6 mentions give 400 VALIDATION_ERROR with path mentions', async () => {
      const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((uid) => ({ type: 'team', uid: `t-${uid}` }));
      expect(mentionPaths(six)).toEqual(['mentions']);
      const h = setup();
      const error = await h.chatErrorBody({ mentions: six });
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).toEqual(
        expect.objectContaining({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          errors: [expect.objectContaining({ path: 'mentions' })],
        })
      );
      expect(h.husky.createContextualToolsResponse).not.toHaveBeenCalled();
    });

    it.each([
      [
        'two team items with one uid',
        [
          { type: 'team', uid: 't-acme' },
          { type: 'team', uid: 't-acme' },
        ],
      ],
      [
        'two page home items',
        [
          { type: 'page', page: 'home' },
          { type: 'page', page: 'home' },
        ],
      ],
    ])('S6-C23: %s give 400', (_name, mentions) => {
      expect(mentionPaths(mentions)).toEqual(['mentions']);
    });

    it('S6-C23: one uid with two types is not a duplicate', () => {
      expect(
        ok([
          { type: 'team', uid: 'x-1' },
          { type: 'member', uid: 'x-1' },
        ])
      ).toBe(true);
    });

    it.each([
      ['uid on a page item', { type: 'page', page: 'home', uid: 'x' }],
      ['page on a member item', { type: 'member', uid: 'm-grace', page: 'home' }],
      ['a label', { type: 'team', uid: 't-acme', label: 'Acme' }],
      ['a page item with no page', { type: 'page' }],
      ['a member item with no uid', { type: 'member' }],
      ['an unknown type', { type: 'job', uid: 'j-open' }],
    ])('S6-C24: %s gives 400', (_name, mention) => {
      expect(ok([mention])).toBe(false);
    });

    it.each(['member', 'team', 'news'])('S6-C25: a %s uid of 0 or 65 characters gives 400, 64 passes', (type) => {
      expect(ok([{ type, uid: '' }])).toBe(false);
      expect(ok([{ type, uid: 'x'.repeat(65) }])).toBe(false);
      expect(ok([{ type, uid: 'x'.repeat(64) }])).toBe(true);
    });
  });

  describe('lookups before the stream', () => {
    it.each([
      ['an unknown member', 'm-missing'],
      ['a deleted member', 'm-gone'],
    ])('S6-C27: %s mention gives 404 MEMBER_NOT_FOUND with mentionIndex and no model call', async (_n, uid) => {
      const h = setup();
      const error = await h.chatErrorBody({
        mentions: [
          { type: 'team', uid: 't-acme' },
          { type: 'member', uid },
        ],
      });
      expectMention404(error, 'MEMBER_NOT_FOUND', 1, h);
    });

    it.each([
      ['an unknown team', 't-missing', {}],
      ['an INACTIVE team for a member who is not a directory admin', 't-deleted', {}],
      ['an L0 team for a member who is not a lead', 't-l0', { leadingTeams: ['t-acme'] }],
    ])('S6-C28: %s mention gives 404 TEAM_NOT_FOUND with mentionIndex', async (_n, uid, viewer) => {
      const h = setup(viewer);
      const error = await h.chatErrorBody({ mentions: [{ type: 'team', uid }] });
      expect(error).not.toBeInstanceOf(ForbiddenException);
      expectMention404(error, 'TEAM_NOT_FOUND', 0, h);
    });

    it('S6-C29: an unknown news mention gives 404 NEWS_NOT_FOUND with mentionIndex', async () => {
      const h = setup();
      const error = await h.chatErrorBody({
        mentions: [
          { type: 'page', page: 'home' },
          { type: 'news', uid: 'news-1' },
          { type: 'news', uid: 'news-missing' },
        ],
      });
      expectMention404(error, 'NEWS_NOT_FOUND', 2, h);
      expect(h.newsQuery.getTeamNewsItemDto).toHaveBeenCalledWith('news-missing', new Set(), 'm-ada');
    });

    it('S6-C30: a 404 for context has no mentionIndex key', async () => {
      const h = setup();
      const error = await h.chatErrorBody({ context: { page: 'team', teamUid: 't-missing' }, mentions: [] });
      expect404(error, 'TEAM_NOT_FOUND', h);
      expect('mentionIndex' in error.getResponse()).toBe(false);
    });

    it('S6-C31: with a bad context and a bad mention, the 404 is for the context', async () => {
      const h = setup();
      const error = await h.chatErrorBody({
        context: { page: 'member', memberUid: 'm-missing' },
        mentions: [{ type: 'team', uid: 't-missing' }],
      });
      expect404(error, 'MEMBER_NOT_FOUND', h);
      expect(h.spies.assert).not.toHaveBeenCalled();
    });

    it('S6-C32: a member outside the gate gets 403, also with an unknown mention uid, and no lookup runs', async () => {
      const h = setup({}, APP_ENV.PRODUCTION);
      const error = await h.chatErrorBody({
        mentions: [
          { type: 'team', uid: 't-missing' },
          { type: 'member', uid: 'm-missing' },
          { type: 'news', uid: 'news-missing' },
        ],
      });
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'AGENT_NOT_ENABLED' }));
      expect(h.spies.assert).not.toHaveBeenCalled();
      expect(h.prisma.member.findFirst).not.toHaveBeenCalled();
      expect(h.newsQuery.getTeamNewsItemDto).not.toHaveBeenCalled();
      expect(h.husky.createContextualToolsResponse).not.toHaveBeenCalled();
    });

    it.each([
      ['a pending member', 'm-pending'],
      ['a rejected member with member.profile.visible', 'm-rejected'],
      ['a member with no approval', 'm-no-approval'],
    ])('LAB-3318 review: %s mention (not directory-visible) gives 404 MEMBER_NOT_FOUND', async (_n, uid) => {
      const h = setup();
      const error = await h.chatErrorBody({
        mentions: [
          { type: 'team', uid: 't-acme' },
          { type: 'member', uid },
        ],
      });
      expectMention404(error, 'MEMBER_NOT_FOUND', 1, h);
    });

    it('LAB-3318 review: a visible member mention gives the member row', async () => {
      const h = setup();
      const { prompt } = await h.turnBody({ mentions: [{ type: 'member', uid: 'm-visible' }] });
      expect(itemRow(prompt, 1, 'member')).toEqual(expect.objectContaining({ uid: 'm-visible' }));
    });

    it('LAB-3318 review: a member mention without member.search.read gives 404 MEMBER_NOT_FOUND and no lookup', async () => {
      const h = setup({ permissions: ['team.search.read'] });
      const error = await h.chatErrorBody({
        mentions: [
          { type: 'team', uid: 't-acme' },
          { type: 'member', uid: 'm-grace' },
        ],
      });
      expect(error).not.toBeInstanceOf(ForbiddenException);
      expectMention404(error, 'MEMBER_NOT_FOUND', 1, h);
      expect(h.accessControl.getMemberAccess).toHaveBeenCalledWith('m-ada');
      expect(h.prisma.member.findFirst).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ uid: 'm-grace' }) })
      );
    });

    it('LAB-3318 review: team, news and own-member mentions need no member.search.read', async () => {
      const h = setup({ permissions: [] });
      const { prompt } = await h.turnBody({
        mentions: [
          { type: 'team', uid: 't-acme' },
          { type: 'news', uid: 'news-1' },
          { type: 'member', uid: 'm-ada' },
        ],
      });
      expect(itemRow(prompt, 1, 'team').uid).toBe('t-acme');
      expect(prompt).toContain('Item 2 (news)');
      expect(prompt).toContain('Item 3 (page)');
      // One read only: the MCP actor. The mention step reads no permissions when no other member is mentioned.
      expect(h.accessControl.getMemberAccess).toHaveBeenCalledTimes(1);
    });

    it('S6-C33: a member mention with the session uid gives the profile item and no lookup', async () => {
      const h = setup();
      const { prompt } = await h.turnBody({ mentions: [{ type: 'member', uid: 'm-ada' }] });
      expect(prompt).toBe(`${MENTIONS_SENTENCE}\nItem 1 (page): ${JSON.stringify({ uid: 'm-ada' })} ${PROFILE_HINT}`);
      expect(h.prisma.member.findFirst).not.toHaveBeenCalled();
    });

    it('S6-C33: the own uid and the profile page are one item', async () => {
      const h = setup();
      const { prompt } = await h.turnBody({
        mentions: [
          { type: 'page', page: 'profile' },
          { type: 'member', uid: 'm-ada' },
        ],
      });
      expect(prompt.match(/Item \d/g)).toEqual(['Item 1']);
    });
  });

  describe('prompt context', () => {
    it('S6-C34: a mention with the key of the context is used once', async () => {
      const h = setup();
      const page = await h.turn({ page: 'team', teamUid: 't-acme' });
      const { prompt } = await h.turnBody({
        context: { page: 'team', teamUid: 't-acme' },
        mentions: [{ type: 'team', uid: 't-acme' }],
      });
      expect(prompt).toBe(page.prompt);
      expect(prompt).not.toContain(MENTIONS_SENTENCE);
      expect(prompt.match(/"uid":"t-acme"/g)).toHaveLength(1);
    });

    it.each([
      ['the profile page and the profile mention', { page: 'profile' }, { type: 'page', page: 'profile' }],
      [
        'the own member page and the profile mention',
        { page: 'member', memberUid: 'm-ada' },
        { type: 'page', page: 'profile' },
      ],
      ['the job board and the job mention', { page: 'job' }, { type: 'page', page: 'job' }],
      ['the Home page and the home mention', { page: 'home' }, { type: 'page', page: 'home' }],
      ['a news page and the same story', { page: 'news-story', newsUid: 'news-1' }, { type: 'news', uid: 'news-1' }],
      [
        'a member page and the same member',
        { page: 'member', memberUid: 'm-grace' },
        { type: 'member', uid: 'm-grace' },
      ],
    ])('S6-C34: %s are one item', async (_n, context, mention) => {
      const h = setup();
      const { prompt } = await h.turnBody({ context, mentions: [mention] });
      expect(prompt).not.toContain(MENTIONS_SENTENCE);
    });

    it('S6-C35: 3 mentions give 3 item lines in the order of mentions, after the page text', async () => {
      const h = setup();
      const { prompt } = await h.turnBody({
        context: { page: 'job' },
        mentions: [
          { type: 'team', uid: 't-acme' },
          { type: 'news', uid: 'news-1' },
          { type: 'member', uid: 'm-grace' },
        ],
      });
      const lines = prompt.split('\n');
      expect(lines[0]).toBe(JOB_BOARD_SENTENCE);
      expect(lines[1]).toBe(MENTIONS_SENTENCE);
      expect(lines.slice(2).map((line) => line.slice(0, line.indexOf(':')))).toEqual([
        'Item 1 (team)',
        'Item 2 (news)',
        'Item 3 (member)',
      ]);
      expect(itemRow(prompt, 1, 'team')).toEqual({
        uid: 't-acme',
        name: 'Acme Team',
        shortDescription: 'We build rockets.',
      });
      expect(itemRow(prompt, 2, 'news')).toEqual({
        uid: 'news-1',
        title: 'Acme raises a seed round',
        summary: 'Acme raised money.',
        teamName: 'Acme Team',
        eventDate: '2026-11-10T00:00:00.000Z',
      });
      expect(lines[3]).toContain(NEWS_SOURCE_HINT);
      expect(itemRow(prompt, 3, 'member').uid).toBe('m-grace');
    });

    it('S6-C35: the page mentions give the page lines with no row', async () => {
      const h = setup();
      const { prompt } = await h.turnBody({
        mentions: [
          { type: 'page', page: 'home' },
          { type: 'page', page: 'job' },
        ],
      });
      expect(prompt).toBe(
        [MENTIONS_SENTENCE, `Item 1 (page): ${HOME_MENTION_SENTENCE}`, `Item 2 (page): ${JOB_BOARD_SENTENCE}`].join(
          '\n'
        )
      );
      expect(h.spies.getJob).not.toHaveBeenCalled();
    });

    it('S6-C36: the mention rows have the S5 fields; no email, handle or Telegram value', async () => {
      const h = setup();
      const page = await h.turn({ page: 'member', memberUid: 'm-grace' });
      const { prompt } = await h.turnBody({ mentions: [{ type: 'member', uid: 'm-grace' }] });
      const row = itemRow(prompt, 1, 'member');
      expect(Object.keys(row)).toEqual(['uid', 'name', 'bio', 'teams', 'skills']);
      expect(row).toEqual(promptRow(page.prompt, 'Member'));
      for (const secret of ['grace.private@example.com', 'grace_tg', 'grace_x', 'calendly.example.com']) {
        expect(prompt).not.toContain(secret);
      }
    });

    it('S6-C37: a turn with no context and no mentions has the no-page sentence and no page data', async () => {
      const h = setup();
      const none = await h.turnBody({});
      expect(none.prompt).toBe(NO_PAGE_SENTENCE);
      const empty = await h.turnBody({ mentions: [] });
      expect(empty.prompt).toBe(NO_PAGE_SENTENCE);
    });

    it('S6-C37: a turn with mentions and no context has no no-page sentence', async () => {
      const h = setup();
      const { prompt } = await h.turnBody({ mentions: [{ type: 'page', page: 'home' }] });
      expect(prompt).not.toContain(NO_PAGE_SENTENCE);
    });

    it('S6-C26: an S5 body with an empty mentions array gives the S5 text', async () => {
      const h = setup();
      const page = await h.turn({ page: 'member', memberUid: 'm-grace' });
      const { prompt } = await h.turnBody({ context: { page: 'member', memberUid: 'm-grace' }, mentions: [] });
      expect(prompt).toBe(page.prompt);
    });
  });

  describe('intro drafts with mentions', () => {
    it('S6-C38: an eligible member with a team mention on the Home page gets 1 draft for that team', async () => {
      const h = setup();
      const { prompt, drafts } = await h.turnBody(
        { context: { page: 'home' }, mentions: [{ type: 'team', uid: 't-acme' }] },
        { type: 'team', targetUid: 't-acme', text: TEXT }
      );
      expect(prompt).toContain('call draft_intro with type "team" and targetUid "t-acme"');
      expect(drafts).toEqual([
        expect.objectContaining({
          kind: 'intro',
          target: { type: 'team', uid: 't-acme', name: 'Acme Team' },
          text: TEXT,
        }),
      ]);
      expect(h.prisma.introRequest.create).not.toHaveBeenCalled();
    });

    it('S6-C38: a member mention on a team page makes both intro targets', async () => {
      const h = setup();
      const { drafts } = await h.turnBody(
        { context: { page: 'team', teamUid: 't-acme' }, mentions: [{ type: 'member', uid: 'm-grace' }] },
        { type: 'member', targetUid: 'm-grace', text: TEXT }
      );
      expect(drafts).toEqual([
        expect.objectContaining({ target: { type: 'member', uid: 'm-grace', name: 'Grace Hopper' } }),
      ]);
    });

    it.each([
      ['another team', { type: 'team', targetUid: 't-future' }],
      ['a member who is not mentioned', { type: 'member', targetUid: 'm-alan' }],
      ['the mentioned uid with the other type', { type: 'member', targetUid: 't-acme' }],
      ['the own member', { type: 'member', targetUid: 'm-ada' }],
    ])('S6-C39: draft_intro with %s gives no draft', async (_n, args) => {
      const h = setup();
      const { texts, drafts } = await h.turnBody(
        {
          mentions: [
            { type: 'team', uid: 't-acme' },
            { type: 'member', uid: 'm-ada' },
          ],
        },
        { ...args, text: TEXT }
      );
      expect(drafts).toEqual([]);
      expect(texts[0]).toContain('not the intro target of this turn');
    });

    it('S6-C39: a deleted team that an admin mentions is no intro target', async () => {
      const h = setup({ isDirectoryAdmin: true });
      const { prompt, drafts } = await h.turnBody(
        { mentions: [{ type: 'team', uid: 't-deleted' }] },
        { type: 'team', targetUid: 't-deleted', text: TEXT }
      );
      expect(prompt).not.toContain('draft_intro');
      expect(drafts).toEqual([]);
    });

    it('S6-C40: a turn with 2 member mentions has at most 1 draft', async () => {
      const h = setup();
      const { drafts } = await h.turnBody(
        {
          mentions: [
            { type: 'member', uid: 'm-grace' },
            { type: 'member', uid: 'm-alan' },
          ],
        },
        { type: 'member', targetUid: 'm-grace', text: TEXT },
        { type: 'member', targetUid: 'm-alan', text: TEXT }
      );
      expect(drafts).toEqual([
        expect.objectContaining({ target: { type: 'member', uid: 'm-alan', name: 'Alan Turing' } }),
      ]);
    });

    it('S6-C41: C1 with mentions calls no Telegram or write code', async () => {
      const h = setup();
      await h.turnBody(
        {
          mentions: [
            { type: 'member', uid: 'm-grace' },
            { type: 'team', uid: 't-acme' },
            { type: 'news', uid: 'news-1' },
          ],
        },
        { type: 'team', targetUid: 't-acme', text: TEXT }
      );
      expect(h.telegram.send).not.toHaveBeenCalled();
      expect(h.prisma.introRequest.create).not.toHaveBeenCalled();
      expect(h.prisma.introRequest.update).not.toHaveBeenCalled();
      expect(h.prisma.introRequest.updateMany).not.toHaveBeenCalled();
    });

    it('S6-C43: C1 with mentions calls createContextualToolsResponse once', async () => {
      const h = setup();
      await h.turnBody({ mentions: [{ type: 'team', uid: 't-acme' }] });
      expect(h.husky.createContextualToolsResponse).toHaveBeenCalledTimes(1);
    });
  });
});
