// S3 intro drafts (LAB-3300, contract section 8). The real IntroRequestsService runs against a fake Prisma, so the
// agent and C3 share one sender rule in these tests. Same light mocks as labos-agent.spec.ts.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), isAxiosError: () => false } }));
jest.mock('../guards/user-token-validation.guard', () => ({ UserTokenValidation: class UserTokenValidation {} }));
jest.mock('../husky/husky-ai.service', () => ({ HuskyAiService: jest.fn() }));
jest.mock('../team-news/team-news-query.service', () => ({ TeamNewsQueryService: jest.fn() }));
jest.mock('../team-news/team-news-suggestions.service', () => ({ TeamNewsSuggestionsService: jest.fn() }));
jest.mock('../mcp/mcp-tool-catalog', () => ({ McpToolCatalog: jest.fn() }));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({ AccessControlV2Service: jest.fn() }));
// The service imports TeamsService as a value; its real module pulls cheerio and undici, which need ReadableStream.
jest.mock('../teams/teams.service', () => ({ TeamsService: jest.fn() }));
jest.mock('ai', () => ({ tool: (def: unknown) => def }));

import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { MCP_SCOPE_KEYS } from 'libs/contracts/src/schema/mcp-scopes';
import { LabosAgentChatRequestSchema } from 'libs/contracts/src/schema/labos-agent';
import { AISDKError, TypeValidationError } from '@ai-sdk/provider';
import { logSafeError } from '../husky/log-safe-error.util';
import { IntroRequestsService } from '../intro-requests/intro-requests.service';
import { PL_INFRA_POLICY_CODE } from '../pl-infra-members/pl-infra-members.constants';
import { PL_PORTFOLIO_COMMUNITY_AFFILIATION } from '../teams/team-affiliation.constants';
import { APP_ENV } from '../utils/constants';
import { MEMBER_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { LabosAgentAccessService } from './labos-agent-access.service';
import { LabosAgentController } from './labos-agent.controller';
import {
  INTRO_DRAFT_FAILED_TEXT,
  INTRO_DRAFT_LINE,
  INTRO_NOT_ELIGIBLE_TEXT,
  profileToolsLine,
  DRAFT_LIMITS_RULE,
} from './labos-agent-drafts';
import { LabosAgentProposalStore } from './labos-agent-proposals';
import {
  ASK_AGAIN_RULE,
  CARD_OPEN_RULE,
  LAST_ANSWER_RULES,
  LabosAgentService,
  latestReplyCacheKey,
  PASTED_TEXT_RULE,
  PREVIOUS_REPLY_RULE,
} from './labos-agent.service';
import { WHICH_REPLY_LINE } from './labos-agent-last-answer';
import * as pageContextModule from './labos-agent-page-context';

/** Far from today, so the role end-date checks do not depend on the clock. */
const PAST = new Date('2000-01-01T00:00:00.000Z');
const FUTURE = new Date('2999-01-01T00:00:00.000Z');
const TEXT = 'I lead fundraising at Acme. We raise a seed round and want your advice.';

type Role = { endDate: Date | null; affiliations: string[]; teamName: string };
type Person = { uid: string; name: string; email: string; deletedAt: Date | null; roles: Role[]; policies: string[] };

const portfolio = (endDate: Date | null = null): Role => ({
  endDate,
  affiliations: [PL_PORTFOLIO_COMMUNITY_AFFILIATION],
  teamName: 'Acme',
});

/** The sender fixtures: one table for the agent and for C3 (S3-R6). */
const SENDERS: Array<[string, Partial<Person>, boolean]> = [
  ['a current portfolio role', { roles: [portfolio()] }, true],
  ['a portfolio role that ends in the future', { roles: [portfolio(FUTURE)] }, true],
  ['the PL Infra policy and no role', { policies: [PL_INFRA_POLICY_CODE] }, true],
  ['an ended portfolio role', { roles: [portfolio(PAST)] }, false],
  [
    'a role on a team that is not portfolio',
    { roles: [{ endDate: null, affiliations: ['Other'], teamName: 'X' }] },
    false,
  ],
  ['another policy', { policies: ['some_other_policy'] }, false],
  ['no role and no policy', {}, false],
];

const VALID = { threadId: 'thread-1', chatId: 'chat-1', message: 'Help me write an intro request to Grace.' };
const MEMBER_CONTEXT = { page: 'intro', introTarget: { type: 'member', uid: 'm-grace' } };
/** LAB-3367 Q1, s4, t3 (Oleg): the exact fact rule, in the tool description and the card prompt. A literal, not the export. */
const DRAFT_FACTS_RULE =
  'In the draft text, facts about the member come only from the member’s messages or their LabOS profile (a tool ' +
  'result). When the member asks you to mention something about themselves, use their words. Do not add or ' +
  'strengthen experience, duration, results, roles, opinions, shared work or a vouch about the member from anywhere ' +
  'else. Facts about the target can come from the page or a tool.';
const TEAM_CONTEXT = { page: 'intro', introTarget: { type: 'team', uid: 't-acme' } };

/** `permissions` are the RBAC permissions of the sender, for example `member.search.read` for a member chip. */
function setup(sender: Partial<Person> = { roles: [portfolio()] }, permissions: string[] = []) {
  process.env.ENVIRONMENT = APP_ENV.DEV;
  const people: Person[] = [
    { uid: 'm-ada', name: 'Ada', email: 'ada@example.com', deletedAt: null, roles: [], policies: [], ...sender },
    { uid: 'm-grace', name: 'Grace Hopper', email: 'grace@example.com', deletedAt: null, roles: [], policies: [] },
    { uid: 'm-gone', name: 'Gone', email: 'gone@example.com', deletedAt: PAST, roles: [], policies: [] },
  ];
  const teams = new Map([
    ['t-acme', { name: 'Acme Team', status: 'ACTIVE' }],
    ['t-deleted', { name: 'Deleted Team', status: 'INACTIVE' }],
  ]);

  /** Applies the C3 `requesterSelect` filters, so the real query shape decides eligibility. */
  const requester = (person: Person, select: any) => {
    const roleWhere = select.teamMemberRoles.where;
    const since: Date = roleWhere.OR[1].endDate.gte;
    const title: string = roleWhere.team.communityAffiliations.some.title;
    const code: string = select.policyAssignmentsV2.where.policy.code;
    return {
      uid: person.uid,
      name: person.name,
      teamMemberRoles: person.roles
        .filter((role) => (role.endDate === null || role.endDate >= since) && role.affiliations.includes(title))
        .map((role) => ({ mainTeam: true, team: { name: role.teamName } })),
      policyAssignmentsV2: person.policies.filter((item) => item === code).map((item) => ({ uid: `pa-${item}` })),
    };
  };
  const prisma = {
    member: {
      // Honours `where.deletedAt` as Prisma does: the code under test must ask for live members (S3-R7).
      findFirst: jest.fn(async ({ where, select }: any) => {
        const person = people.find(
          (item) =>
            (where.email ? item.email === where.email : item.uid === where.uid) &&
            (!('deletedAt' in where) || item.deletedAt === where.deletedAt)
        );
        if (!person) return null;
        if (where.email) return requester(person, select);
        // The member page row and the member chip row (memberPageRow) ask for the bio. The fixture has no profile data.
        if (select?.bio) return { uid: person.uid, name: person.name, bio: null, skills: [], teamMemberRoles: [] };
        return { name: person.name };
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const person = people.find((item) => item.email === where.email || item.uid === where.uid);
        return person ? { uid: person.uid, deletedAt: person.deletedAt } : null;
      }),
    },
    team: {
      findUnique: jest.fn(async ({ where }: any) => teams.get(where.uid) ?? null),
      // Honours `where.status.not` as Prisma does: the code under test must drop deleted teams (S3-R7).
      findFirst: jest.fn(async ({ where }: any) => {
        const team = teams.get(where.uid);
        if (!team) return null;
        if (where.status?.not !== undefined && team.status === where.status.not) return null;
        return team;
      }),
    },
    introRequest: {
      create: jest.fn(async () => ({ uid: 'req-1' })),
      // The claim finds no row, so C3 returns before the Telegram post.
      updateMany: jest.fn(async () => ({ count: 0 })),
      update: jest.fn(),
    },
  };
  const telegram = { send: jest.fn(async () => '42') };
  // LAB-3323: C3 asks MembersService whether the sender is a directory admin. No sender here is an admin.
  const introMembers = { findMemberByEmail: jest.fn(async () => null) };
  const introRequests = new IntroRequestsService(prisma as any, telegram as any, introMembers as any);
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const husky = { createContextualToolsResponse: jest.fn().mockResolvedValue({ pipeTo: jest.fn() }) };
  const service = new LabosAgentService(
    prisma as any,
    new LabosAgentAccessService({ hasPermission: jest.fn().mockResolvedValue({ allowed: false }) } as any),
    husky as any,
    { getTeamNewsItemDto: jest.fn() } as any,
    { forApp: jest.fn(() => []) } as any,
    { getMemberAccess: jest.fn().mockResolvedValue({ effectivePermissions: permissions }) } as any,
    new LabosAgentProposalStore(cache as any),
    { adminCaps: jest.fn(async () => Object.fromEntries(MCP_SCOPE_KEYS.map((key) => [key, 'write']))) } as any,
    introRequests,
    {} as any,
    {} as any
  );
  const controller = new LabosAgentController(service);
  const req = { userEmail: 'ada@example.com' };
  const res = {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  };

  /** One chat turn: the model calls draft_intro with each args object, in order. */
  const turn = async (context: unknown, ...calls: Array<Record<string, unknown>>) => {
    await controller.chat({ ...VALID, context }, req, res as any);
    const options = husky.createContextualToolsResponse.mock.calls.at(-1)[3];
    const texts: string[] = [];
    for (const args of calls) texts.push(await options.extraTools.draft_intro.execute(args));
    return { texts, drafts: options.extraResponseFields.drafts as Array<Record<string, any>>, options };
  };
  return { prisma, telegram, cache, husky, controller, req, res, introRequests, turn, teams };
}

describe('LabOS agent intro drafts (LAB-3300)', () => {
  const originalEnv = process.env.ENVIRONMENT;
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => {
    process.env.ENVIRONMENT = originalEnv;
  });

  it('S3-R1: an eligible member on the intro page gets exactly 1 intro draft for the context target', async () => {
    const h = setup();
    const { texts, drafts } = await h.turn(MEMBER_CONTEXT, { type: 'member', targetUid: 'm-grace', text: TEXT });
    expect(texts[0]).toContain('Nothing is sent');
    expect(drafts).toEqual([
      {
        draftId: expect.stringMatching(/^dr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
        kind: 'intro',
        target: { type: 'member', uid: 'm-grace', name: 'Grace Hopper' },
        text: TEXT,
        minLength: 20,
        maxLength: 3500,
        source: 'agent',
      },
    ]);
  });

  it('S3-R1: a team target gives a team draft, and a second call in the turn replaces the first', async () => {
    const h = setup();
    const { drafts } = await h.turn(
      TEAM_CONTEXT,
      { type: 'team', targetUid: 't-acme', text: TEXT },
      { type: 'team', targetUid: 't-acme', text: `${TEXT} Second version.` }
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0].target).toEqual({ type: 'team', uid: 't-acme', name: 'Acme Team' });
    expect(drafts[0].text).toBe(`${TEXT} Second version.`);
  });

  it('S3-R1: the intro page context goes to the model with the target from the database', async () => {
    const h = setup();
    const { options } = await h.turn(MEMBER_CONTEXT);
    expect(options.promptContext).toContain('Grace Hopper');
    expect(options.promptContext).toContain('draft_intro');
    expect(options.promptContext).toContain('m-grace');
  });

  it('S3-R2: draft_intro writes nothing: no IntroRequest row, no Telegram post, no cache write', async () => {
    const h = setup();
    const { drafts } = await h.turn(MEMBER_CONTEXT, { type: 'member', targetUid: 'm-grace', text: TEXT });
    expect(drafts).toHaveLength(1);
    expect(h.prisma.introRequest.create).not.toHaveBeenCalled();
    expect(h.prisma.introRequest.updateMany).not.toHaveBeenCalled();
    expect(h.prisma.introRequest.update).not.toHaveBeenCalled();
    expect(h.telegram.send).not.toHaveBeenCalled();
    expect(h.cache.set).not.toHaveBeenCalled();
    expect(h.cache.del).not.toHaveBeenCalled();
  });

  it.each([
    ['10 characters', 'x'.repeat(10), false],
    ['19 characters after trim', `   ${'x'.repeat(19)}   `, false],
    ['20 characters after trim', `   ${'x'.repeat(20)}   `, true],
    ['3500 characters', 'x'.repeat(3500), true],
    ['3501 characters', 'x'.repeat(3501), false],
    ['3600 characters', 'x'.repeat(3600), false],
  ])('S3-R3: model text of %s gives a draft only inside 20..3500, trimmed', async (_name, text, ok) => {
    const h = setup();
    const { texts, drafts } = await h.turn(MEMBER_CONTEXT, { type: 'member', targetUid: 'm-grace', text });
    if (ok) {
      expect(drafts).toHaveLength(1);
      expect(drafts[0].text).toBe(text.trim());
    } else {
      expect(drafts).toEqual([]);
      expect(texts[0]).toContain('refused');
      expect(texts[0]).toContain('20 to 3500');
    }
  });

  it.each([
    ['another uid', MEMBER_CONTEXT, { type: 'member', targetUid: 'm-other' }],
    ['the other type', MEMBER_CONTEXT, { type: 'team', targetUid: 'm-grace' }],
    ['a target on the Home page (no introTarget)', { page: 'home' }, { type: 'member', targetUid: 'm-grace' }],
    ['a target with no context', undefined, { type: 'member', targetUid: 'm-grace' }],
  ])('S3-R4: %s gives no draft', async (_name, context, args) => {
    const h = setup();
    const { texts, drafts } = await h.turn(context, { ...args, text: TEXT });
    expect(drafts).toEqual([]);
    expect(texts[0]).toContain('not the intro target of this turn');
  });

  it('S3-R4: target uid and name come from the database, not from the model', async () => {
    const h = setup();
    const { drafts } = await h.turn(MEMBER_CONTEXT, {
      type: 'member',
      targetUid: 'm-grace',
      text: TEXT,
      name: 'Model Name',
    });
    expect(drafts[0].target).toEqual({ type: 'member', uid: 'm-grace', name: 'Grace Hopper' });
  });

  it.each(SENDERS.filter(([, , eligible]) => !eligible))(
    'S3-R5: a member with %s gets drafts [] and the portfolio and PL Infra answer',
    async (_name, sender) => {
      const h = setup(sender);
      const { texts, drafts } = await h.turn(MEMBER_CONTEXT, { type: 'member', targetUid: 'm-grace', text: TEXT });
      expect(drafts).toEqual([]);
      expect(texts[0]).toBe(INTRO_NOT_ELIGIBLE_TEXT);
      expect(texts[0]).toContain('Only members of portfolio teams and PL Infra can');
    }
  );

  it.each(SENDERS)(
    'S3-R6: draft_intro and C3 give the same result for a member with %s',
    async (_name, sender, eligible) => {
      const h = setup(sender);
      const rule = jest.spyOn(h.introRequests, 'findEligibleRequester');
      const { drafts } = await h.turn(MEMBER_CONTEXT, { type: 'member', targetUid: 'm-grace', text: TEXT });
      const c3 = await h.introRequests
        .create('ada@example.com', { type: 'MEMBER', targetId: 'm-grace', text: TEXT })
        .then(
          () => true,
          (error) => {
            expect(error).toBeInstanceOf(ForbiddenException);
            return false;
          }
        );
      expect(drafts.length === 1).toBe(eligible);
      expect(c3).toBe(eligible);
      // One shared method: the tool call and C3 each call it once.
      expect(rule).toHaveBeenCalledTimes(2);
    }
  );

  it.each([
    ['an unknown member', { type: 'member', uid: 'm-missing' }],
    ['a deleted member', { type: 'member', uid: 'm-gone' }],
    ['an unknown team', { type: 'team', uid: 't-missing' }],
    ['a deleted (INACTIVE) team', { type: 'team', uid: 't-deleted' }],
    ['a team uid sent as a member', { type: 'member', uid: 't-acme' }],
  ])('S3-R7: %s returns 404 INTRO_TARGET_NOT_FOUND before the stream', async (_name, introTarget) => {
    const h = setup();
    const body = { ...VALID, context: { page: 'intro', introTarget } };
    const error = await h.controller.chat(body, h.req, h.res as any).catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toEqual(expect.objectContaining({ statusCode: 404, code: 'INTRO_TARGET_NOT_FOUND' }));
    expect(h.husky.createContextualToolsResponse).not.toHaveBeenCalled();
    expect(h.res.flushHeaders).not.toHaveBeenCalled();
  });

  it('S3-R7: draft_intro refuses a team that is deleted (INACTIVE) during the turn', async () => {
    const h = setup();
    const { options } = await h.turn(TEAM_CONTEXT);
    h.teams.set('t-acme', { name: 'Acme Team', status: 'INACTIVE' });
    const text = await options.extraTools.draft_intro.execute({ type: 'team', targetUid: 't-acme', text: TEXT });
    expect(text).toContain('was not found');
    expect(options.extraResponseFields.drafts).toEqual([]);
  });

  it.each([
    ['a text that is too short', { type: 'member', targetUid: 'm-grace', text: 'short' }],
    ['another target', { type: 'member', targetUid: 'm-other', text: TEXT }],
  ])('S3-R8: a refused second call (%s) clears the first draft', async (_name, second) => {
    const h = setup();
    const { texts, drafts } = await h.turn(
      MEMBER_CONTEXT,
      { type: 'member', targetUid: 'm-grace', text: TEXT },
      second
    );
    expect(texts[0]).toContain('Nothing is sent');
    expect(texts[1]).toContain('refused');
    expect(drafts).toEqual([]);
  });

  it('S3-R8: an error gives a fixed text to the model, logs the error, and gives drafts []', async () => {
    const h = setup();
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(h.introRequests, 'findEligibleRequester').mockRejectedValue(new Error('db host 10.0.0.1 is down'));
    const { texts, drafts } = await h.turn(MEMBER_CONTEXT, { type: 'member', targetUid: 'm-grace', text: TEXT });
    expect(texts[0]).toBe(INTRO_DRAFT_FAILED_TEXT);
    expect(texts[0]).not.toContain('10.0.0.1');
    expect(drafts).toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('db host 10.0.0.1 is down'));
  });

  it('S3-R8: a turn with no draft or a refused draft has drafts [] next to proposals []', async () => {
    const h = setup();
    const home = await h.turn({ page: 'home' });
    expect(home.options.extraResponseFields).toEqual({ proposals: [], drafts: [] });
    const refused = await h.turn(MEMBER_CONTEXT, { type: 'member', targetUid: 'm-grace', text: 'short' });
    expect(refused.options.extraResponseFields).toEqual({ proposals: [], drafts: [] });
  });

  it('S3-R9: a direct C3 request from a member who is not eligible still returns 403 and stores nothing', async () => {
    const h = setup({});
    const error = await h.introRequests
      .create('ada@example.com', { type: 'MEMBER', targetId: 'm-grace', text: TEXT })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.message).toBe('Only members of portfolio teams and PL Infra can send an intro request');
    expect(h.prisma.introRequest.create).not.toHaveBeenCalled();
    expect(h.telegram.send).not.toHaveBeenCalled();
  });

  it('S3-R9: C3 refuses a deleted (INACTIVE) team with 404 "Team not found" for a non-admin (LAB-3323)', async () => {
    const h = setup();
    const error = await h.introRequests
      .create('ada@example.com', { type: 'TEAM', targetId: 't-deleted', text: TEXT })
      .catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.message).toBe('Team not found');
    expect(h.prisma.introRequest.create).not.toHaveBeenCalled();
    expect(h.telegram.send).not.toHaveBeenCalled();
  });

  it('S3-R9: C3 still refuses a deleted member with 404', async () => {
    const h = setup();
    const error = await h.introRequests
      .create('ada@example.com', { type: 'MEMBER', targetId: 'm-gone', text: TEXT })
      .catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect(h.prisma.introRequest.create).not.toHaveBeenCalled();
  });

  it('S3-R9: a direct C3 request from an eligible member still stores the row', async () => {
    const h = setup();
    await expect(
      h.introRequests.create('ada@example.com', { type: 'TEAM', targetId: 't-acme', text: TEXT })
    ).resolves.toEqual({ uid: 'req-1' });
    expect(h.prisma.introRequest.create).toHaveBeenCalledTimes(1);
  });
});

describe('LabOS agent intro draft answer (LAB-3362 D4)', () => {
  const originalEnv = process.env.ENVIRONMENT;
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => {
    process.env.ENVIRONMENT = originalEnv;
  });

  it('gives the stream one short answer line while the turn has a draft', async () => {
    const h = setup();
    const { options } = await h.turn(MEMBER_CONTEXT);
    expect(options.answerLine()).toBeUndefined();

    await options.extraTools.draft_intro.execute({ type: 'member', targetUid: 'm-grace', text: TEXT });
    expect(options.answerLine()).toBe(INTRO_DRAFT_LINE);
    expect(INTRO_DRAFT_LINE).toBe('Here is a draft intro. Edit it in the card, then send.');

    // A refused second call removes the draft, so the model text streams again.
    await options.extraTools.draft_intro.execute({ type: 'member', targetUid: 'm-other', text: TEXT });
    expect(options.answerLine()).toBeUndefined();
  });

  it('LAB-3367 Q1: a new intro draft gets the exact fact rule', async () => {
    const h = setup();
    const { options } = await h.turn(MEMBER_CONTEXT);
    expect(options.extraTools.draft_intro.description).toContain(DRAFT_FACTS_RULE);
  });

  it.each([
    [
      ['get_my_profile', 'list_my_experiences'],
      'To read the member’s own LabOS profile, you can call get_my_profile or list_my_experiences.',
    ],
    [['get_my_profile'], 'To read the member’s own LabOS profile, you can call get_my_profile.'],
  ])('LAB-3367 t3: with the read tools %j, the description names them', async (names, line) => {
    const defs = names.map((name) => ({ name, description: name, inputSchema: {}, execute: jest.fn() }));
    jest.spyOn(LabosAgentService.prototype as any, 'tools').mockResolvedValue(defs);
    const h = setup();
    const { options } = await h.turn(MEMBER_CONTEXT);
    expect(options.extraTools.draft_intro.description).toContain(line);
    expect(options.extraTools.draft_intro.description).toContain(DRAFT_FACTS_RULE);
  });

  it.each([[[]], [['search_members']]])(
    'LAB-3367 t3: with the tools %j and no profile read tool, the description names none',
    async (names) => {
      const defs = names.map((name) => ({ name, description: name, inputSchema: {}, execute: jest.fn() }));
      jest.spyOn(LabosAgentService.prototype as any, 'tools').mockResolvedValue(defs);
      const h = setup();
      const { options } = await h.turn(MEMBER_CONTEXT);
      const description: string = options.extraTools.draft_intro.description;
      expect(description).not.toMatch(/get_my_profile|list_my_experiences|search_members/);
      // Mutant: no "you can call ." with an empty tool list.
      expect(description).not.toContain('you can call');
      expect(description).not.toContain('LabOS profile, ');
      expect(description).toContain(DRAFT_FACTS_RULE);
    }
  );

  // LAB-3367 G8 (Oleg): the exact limit lines, so a change of the text shows in review.
  const G8_LIMITS =
    'When a fact is not given, leave it out. A short draft is correct. ' +
    'To know a member, a team or a project is not experience with it: do not write that the member has experience, ' +
    'skills or work with it. Do not add a reason for the intro that the member did not give. ' +
    'For a request such as "make it more convincing", only reorder or reword the facts of the current text. ' +
    'If the draft needs a reason and the member gave none, make no draft and ask the member for the reason.';

  it('LAB-3367 G8: the draft_intro description and the card prompt give the draft limits', async () => {
    const h = setup();
    const { options } = await h.turn(MEMBER_CONTEXT);
    expect(DRAFT_LIMITS_RULE).toBe(G8_LIMITS);
    const description: string = options.extraTools.draft_intro.description;
    expect(description).toContain(`${DRAFT_FACTS_RULE} ${G8_LIMITS}`);
    expect(description).toContain('and why (only a reason that the member gave)');
  });

  it('LAB-3367 G8: with get_my_profile, the model calls it before the first draft', () => {
    expect(profileToolsLine(['get_my_profile'])).toContain('Call get_my_profile before the first draft.');
    expect(profileToolsLine(['get_my_profile', 'list_my_experiences'])).toContain(
      'Call get_my_profile before the first draft.'
    );
    expect(profileToolsLine(['list_my_experiences'])).not.toContain('get_my_profile');
  });

  it('LAB-3367 t3: profileToolsLine gives no text for no profile read tool', () => {
    expect(profileToolsLine([])).toBe('');
    expect(profileToolsLine(['search_members'])).toBe('');
  });

  it('tells the model not to repeat the draft text in the answer', async () => {
    const h = setup();
    const { texts, options } = await h.turn(MEMBER_CONTEXT, { type: 'member', targetUid: 'm-grace', text: TEXT });

    expect(options.extraTools.draft_intro.description).toContain('Do not write the draft text in the answer');
    expect(texts[0]).toContain('Do not repeat the draft text.');
    expect(texts[0]).toContain(`Write only this line as the answer: "${INTRO_DRAFT_LINE}"`);
    expect(texts[0]).not.toContain(TEXT);
  });

  it('keeps the model text for a refusal', async () => {
    const h = setup({});
    const { texts, options } = await h.turn(MEMBER_CONTEXT, { type: 'member', targetUid: 'm-grace', text: TEXT });

    expect(texts[0]).toBe(INTRO_NOT_ELIGIBLE_TEXT);
    expect(options.answerLine()).toBeUndefined();
  });
});

describe('LabOS agent C1 introDraft (LAB-3362, contract change 4, section 11)', () => {
  const originalEnv = process.env.ENVIRONMENT;
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => {
    process.env.ENVIRONMENT = originalEnv;
  });

  /** The card text with the member's edits. It must reach the prompt and nothing else. */
  const CARD_TEXT = 'Card-text-7f3a: I lead fundraising at Acme. We raise a seed round and want your advice soon.';
  const SHORT = 'I lead fundraising at Acme and want your advice on our seed round.';
  const GRACE = { type: 'member' as const, uid: 'm-grace' };
  const SHORTER = { ...VALID, message: 'Make it shorter.' };

  async function chat(h: ReturnType<typeof setup>, body: Record<string, unknown>) {
    await h.controller.chat(body as any, h.req, h.res as any);
    return h.husky.createContextualToolsResponse.mock.calls.at(-1)[3];
  }

  it('C4-R1: the schema accepts a valid introDraft and rejects an extra key, an empty text and 3501 characters', () => {
    const parse = (introDraft: unknown) => LabosAgentChatRequestSchema.safeParse({ ...VALID, introDraft });

    const ok = parse({ target: GRACE, text: `  ${CARD_TEXT}  ` });
    expect(ok.success && ok.data.introDraft).toEqual({ target: GRACE, text: CARD_TEXT });
    expect(parse({ target: { type: 'team', uid: 't-acme' }, text: 'x' }).success).toBe(true);
    expect(parse({ target: GRACE, text: 'x'.repeat(3500) }).success).toBe(true);
    expect(LabosAgentChatRequestSchema.safeParse(VALID).success).toBe(true);

    expect(parse({ target: GRACE, text: CARD_TEXT, draftId: 'dr_1' }).success).toBe(false);
    expect(parse({ target: { ...GRACE, name: 'Grace Hopper' }, text: CARD_TEXT }).success).toBe(false);
    expect(parse({ target: GRACE, text: '   ' }).success).toBe(false);
    expect(parse({ target: GRACE, text: 'x'.repeat(3501) }).success).toBe(false);
    expect(parse({ target: { type: 'project', uid: 'p-1' }, text: CARD_TEXT }).success).toBe(false);
    expect(parse({ text: CARD_TEXT }).success).toBe(false);
  });

  it('accepts and strips extra keys from context.introTarget', () => {
    const result = LabosAgentChatRequestSchema.safeParse({
      ...VALID,
      context: { page: 'intro', introTarget: { ...GRACE, extra: true } },
    });
    expect(result.success && result.data.context?.introTarget).toEqual(GRACE);
  });

  it.each([
    ['an unknown member', { type: 'member', uid: 'm-missing' }],
    ['a deleted member', { type: 'member', uid: 'm-gone' }],
    ['a deleted (INACTIVE) team', { type: 'team', uid: 't-deleted' }],
  ])(
    'C4-R2: %s as the introDraft target returns 404 INTRO_TARGET_NOT_FOUND before the stream',
    async (_name, target) => {
      const h = setup();
      const error = await h.controller
        .chat({ ...SHORTER, introDraft: { target, text: CARD_TEXT } } as any, h.req, h.res as any)
        .catch((e) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getResponse()).toEqual(expect.objectContaining({ statusCode: 404, code: 'INTRO_TARGET_NOT_FOUND' }));
      expect(h.husky.createContextualToolsResponse).not.toHaveBeenCalled();
      expect(h.res.flushHeaders).not.toHaveBeenCalled();
    }
  );

  it('C4-R3: "make it shorter" with introDraft and no context gives 1 new draft, and the model input has the card text', async () => {
    const h = setup();
    const options = await chat(h, { ...SHORTER, introDraft: { target: GRACE, text: CARD_TEXT } });

    expect(options.promptContext).toContain(JSON.stringify(CARD_TEXT));
    expect(options.promptContext).toContain('call draft_intro with type "member" and targetUid "m-grace"');
    const result = await options.extraTools.draft_intro.execute({ type: 'member', targetUid: 'm-grace', text: SHORT });

    expect(result).toContain(INTRO_DRAFT_LINE);
    expect(options.extraResponseFields.drafts).toHaveLength(1);
    expect(options.extraResponseFields.drafts[0]).toEqual(
      expect.objectContaining({ target: { type: 'member', uid: 'm-grace', name: 'Grace Hopper' }, text: SHORT })
    );
    expect(options.answerLine()).toBe(INTRO_DRAFT_LINE);
  });

  it('LAB-3367 G8: the card prompt gives the draft limits after the fact rule', async () => {
    const options = await chat(setup(), {
      ...VALID,
      message: 'make it more convincing',
      introDraft: { target: GRACE, text: CARD_TEXT },
    });
    expect(options.promptContext).toContain(`${DRAFT_FACTS_RULE} ${DRAFT_LIMITS_RULE}`);
  });

  it('C4-R3: introDraft works next to another page context, and the target is checked again', async () => {
    const h = setup();
    const options = await chat(h, {
      ...SHORTER,
      context: { page: 'home' },
      introDraft: { target: GRACE, text: CARD_TEXT },
    });

    expect(options.promptContext).toContain('Home');
    expect(options.promptContext).toContain(JSON.stringify(CARD_TEXT));
    // Only the card target is a target of the turn, not another member.
    expect(
      await options.extraTools.draft_intro.execute({ type: 'member', targetUid: 'm-other', text: SHORT })
    ).toContain('not the intro target of this turn');
    expect(options.extraResponseFields.drafts).toEqual([]);
  });

  const BRIEF_REVISION =
    'If the member makes a brief revision request such as "make it shorter" and does not ask to change your last ' +
    'answer, revise this draft.';
  const PAGE_OR_CHIPS =
    'This rule applies also when the page or the items added to the message point to another member or team.';
  const NAME_IN_EDIT =
    'A member or team name in the revision, such as "mention that I know Acme Team", is part of the new text. ' +
    'It does not change the target.';
  const FACTS_ONLY =
    'In a revision, keep the facts of the current text: the member may have typed them. ' + DRAFT_FACTS_RULE;
  // LAB-3367 k1: the exact text from the review, in place of four card sentences that repeated LAST_ANSWER_RULES.
  const LAST_ANSWER_WINS =
    'If the member asks to change your last answer, the rules for your last answer apply, and they win over this draft.';
  const BRIEF_NOT_LAST_ANSWER = 'A brief revision request that does not name your last answer revises this draft.';
  const DIFFERENT_ITEM =
    'If the member asks for a different draft or asks to change other content instead, follow that request. ' +
    'Do not use this draft text for that request. ' +
    'Example: "write the intro to Acme Team instead" with Acme Team in the items added to the message.';
  const NAME_ONLY =
    'A draft for a different member or team needs a target of this turn: the page, the items added to the message ' +
    'or this card. ' +
    'If the member gives only a name, and that member or team is not a target of this turn, do not call ' +
    'draft_intro for it. Ask the member to @mention that member or team in the message.';
  const RULES = [
    BRIEF_REVISION,
    PAGE_OR_CHIPS,
    NAME_IN_EDIT,
    FACTS_ONLY,
    LAST_ANSWER_WINS,
    BRIEF_NOT_LAST_ANSWER,
    DIFFERENT_ITEM,
    NAME_ONLY,
  ];
  const ACME = { type: 'team' as const, uid: 't-acme' };
  const draftFor = (target: { type: string; uid: string; name: string }) =>
    expect.objectContaining({ target, text: SHORT });

  it('LAB-3367 R2: "Make it shorter." revises this draft, also next to another page target', async () => {
    const h = setup();
    const options = await chat(h, {
      ...SHORTER,
      context: TEAM_CONTEXT,
      introDraft: { target: GRACE, text: CARD_TEXT },
    });

    for (const rule of RULES) expect(options.promptContext).toContain(rule);
    expect(options.promptContext).toContain('call draft_intro with type "member" and targetUid "m-grace"');
    expect(
      await options.extraTools.draft_intro.execute({ type: 'member', targetUid: 'm-grace', text: SHORT })
    ).toContain(INTRO_DRAFT_LINE);
    expect(options.extraResponseFields.drafts).toEqual([draftFor({ ...GRACE, name: 'Grace Hopper' })]);
  });

  it('LAB-3367 R2: "Make it shorter." revises this draft, also next to a member mention chip', async () => {
    const h = setup(undefined, [MEMBER_PERMISSIONS.SEARCH_READ]);
    const options = await chat(h, {
      ...SHORTER,
      mentions: [{ type: 'member', uid: 'm-grace' }],
      introDraft: { target: ACME, text: CARD_TEXT },
    });

    // The chip is still a permitted target of the turn, but the rule sends the brief revision to the card.
    expect(options.promptContext).toContain('Item 1 (member)');
    expect(options.promptContext).toContain('call draft_intro with type "member" and targetUid "m-grace"');
    expect(options.promptContext).toContain(BRIEF_REVISION);
    expect(options.promptContext).toContain(PAGE_OR_CHIPS);
    expect(options.promptContext).toContain('call draft_intro with type "team" and targetUid "t-acme"');
    expect(await options.extraTools.draft_intro.execute({ type: 'team', targetUid: 't-acme', text: SHORT })).toContain(
      INTRO_DRAFT_LINE
    );
    expect(options.extraResponseFields.drafts).toEqual([draftFor({ ...ACME, name: 'Acme Team' })]);
  });

  it('LAB-3367 R4: an edit that names a team is new text for this draft, and the target stays', async () => {
    const h = setup();
    const options = await chat(h, {
      ...VALID,
      message: 'Mention that I know Acme Team.',
      context: TEAM_CONTEXT,
      introDraft: { target: GRACE, text: CARD_TEXT },
    });

    expect(options.promptContext).toContain(NAME_IN_EDIT);
    await options.extraTools.draft_intro.execute({ type: 'member', targetUid: 'm-grace', text: SHORT });
    expect(options.extraResponseFields.drafts).toEqual([draftFor({ ...GRACE, name: 'Grace Hopper' })]);
  });

  it('LAB-3367 R3: a request for a different draft instead keeps the page target as a permitted target', async () => {
    const h = setup();
    const options = await chat(h, {
      ...VALID,
      message: 'Write the intro to Acme Team instead.',
      context: TEAM_CONTEXT,
      introDraft: { target: GRACE, text: CARD_TEXT },
    });

    expect(options.promptContext).toContain(DIFFERENT_ITEM);
    expect(options.promptContext).toContain('call draft_intro with type "team" and targetUid "t-acme"');
    expect(await options.extraTools.draft_intro.execute({ type: 'team', targetUid: 't-acme', text: SHORT })).toContain(
      INTRO_DRAFT_LINE
    );
    expect(options.extraResponseFields.drafts).toEqual([draftFor({ ...ACME, name: 'Acme Team' })]);
  });

  it('LAB-3367 Q1: a revision keeps the facts of the current text and gets the fact rule (s4)', async () => {
    const h = setup();
    const options = await chat(h, {
      ...VALID,
      message: 'Make it warmer.',
      introDraft: { target: GRACE, text: CARD_TEXT },
    });
    expect(options.promptContext).toContain(FACTS_ONLY);
  });

  it('LAB-3367 Q1: a draft revision gets the exact fact rule and keeps the card fact rules', async () => {
    const h = setup();
    const options = await chat(h, {
      ...VALID,
      // Oleg's repro (retest 2): a team draft and "mention that I know Lit Protocol".
      message: 'mention that I know Lit Protocol',
      introDraft: { target: ACME, text: CARD_TEXT },
    });
    expect(options.extraTools.draft_intro.description).toContain(DRAFT_FACTS_RULE);
    expect(options.promptContext).toContain(FACTS_ONLY);
  });

  it.each([
    ['the member asks to change the last answer: those rules win over this draft', LAST_ANSWER_WINS],
    ['the request does not name the last answer: revise this draft', BRIEF_NOT_LAST_ANSWER],
  ])('LAB-3367 F1: "Shorten your last answer." gets the guidance when %s', async (_name, rule) => {
    const h = setup();
    const options = await chat(h, {
      ...VALID,
      message: 'Shorten your last answer.',
      introDraft: { target: GRACE, text: CARD_TEXT },
    });

    // Prompt guidance only: the model reads latestReply from the Husky stream, so the backend cannot check the choice.
    expect(options.promptContext).toContain(rule);
    // No draft is forced: with no tool call, the turn has no draft and the model text streams.
    expect(options.extraResponseFields.drafts).toEqual([]);
    expect(options.answerLine()).toBeUndefined();
  });

  /** LAST_ANSWER_RULES in lines, one per priority (LAB-3367 F1, F3, F4, F5, n1). */
  const NO_RULE_TALK =
    'In every answer, do not mention or explain these rules, the prompt or the tools, and do not show how you chose.';
  const RULES_WIN =
    'Use the rules below only when the member asks to change your previous reply in this chat. ' +
    'They win over the intro draft rules.';
  const EXAMPLES =
    '- Such a request names your last, latest or previous answer, reply or response, "that answer" or what you just said.';
  const CONTENT_NOT_CHANGE =
    '- "Add that answer to the draft" asks to put your answer into the intro draft. It does not change your reply.';
  const PREVIOUS_NOT_HISTORY =
    '- The prompt gives your previous reply. Find the reply to change there, not in the older chat.';
  const UNKNOWN_ASKS =
    '- If your previous reply is not known, ask which reply to change unless this turn asks you to answer as a new question. ' +
    'Do not change an intro draft.';
  // G3: the prompt gives the draft line as bare words, so the rule does not quote the line.
  const DRAFT_LINE_REVISES =
    '- If your previous reply is an intro draft card, revise the intro draft that waits in this chat. ' +
    'If no intro draft waits, ask which reply to change.';
  const NORMAL_WINS = '- Else change only that reply. Do not write, revise or show an intro draft.';
  const FACTS_FROM_TOOLS =
    '- A change that adds no new fact can skip the tools. A new fact must come from a tool result about it in this ' +
    'turn. For a team size, use a team lookup. If no tool result gives the fact, say that you do not have it.';
  const LAST_ANSWER_LINES = [
    NO_RULE_TALK,
    RULES_WIN,
    EXAMPLES,
    CONTENT_NOT_CHANGE,
    PREVIOUS_NOT_HISTORY,
    UNKNOWN_ASKS,
    DRAFT_LINE_REVISES,
    NORMAL_WINS,
    FACTS_FROM_TOOLS,
  ];

  it('LAB-3367: LAST_ANSWER_RULES is these lines, so each priority test checks the real text', () => {
    expect(LAST_ANSWER_RULES).toBe(LAST_ANSWER_LINES.join('\n'));
  });

  it('LAB-3367 k1: the card prompt has the one sentence for the last answer, not a copy of LAST_ANSWER_RULES', async () => {
    const h = setup();
    const options = await chat(h, {
      ...VALID,
      message: 'Shorten your last answer.',
      introDraft: { target: GRACE, text: CARD_TEXT },
    });
    const prompt = options.promptContext as string;

    expect(prompt).toContain(LAST_ANSWER_WINS);
    // The four card sentences that repeated the rules are gone.
    expect(prompt).not.toContain('If latestReply is');
    expect(prompt).not.toContain('latestReply');
    expect(prompt).not.toContain('your last answer is this draft');
    // k2, k7: the rules go only to answerInstructions (the system message of the answer calls), never the context.
    expect(prompt).not.toContain(LAST_ANSWER_RULES);
    expect(options.answerInstructions).toBe(LAST_ANSWER_RULES);
    // The rules are fixed text, with no card text and no member data.
    expect(options.answerInstructions).not.toContain(CARD_TEXT);
    expect(options.answerInstructions).not.toContain('Grace');
    // Prompt guidance only: no draft is forced.
    expect(options.extraResponseFields.drafts).toEqual([]);
    expect(options.answerLine()).toBeUndefined();
  });

  it('LAB-3367 k1: R2 keeps a brief revision and an earlier answer as content apart from a last-answer change', async () => {
    const h = setup();
    const options = await chat(h, {
      ...VALID,
      message: 'Add that answer to the draft.',
      introDraft: { target: GRACE, text: CARD_TEXT },
    });
    expect(options.promptContext).toContain(BRIEF_REVISION);
    // k1: the guard is only in the system rules. The card has no extra sentence for it, so the Q1 fact rules stay.
    expect(options.promptContext).not.toContain('add that answer to the draft');
    expect(options.promptContext).toContain(FACTS_ONLY);
    expect(options.answerInstructions).toContain(CONTENT_NOT_CHANGE);
    // A real change of the answer still goes to the rules.
    expect(options.answerInstructions).toContain(RULES_WIN);
    expect(
      await options.extraTools.draft_intro.execute({ type: 'member', targetUid: 'm-grace', text: SHORT })
    ).toContain(INTRO_DRAFT_LINE);
    expect(options.extraResponseFields.drafts).toEqual([draftFor({ ...GRACE, name: 'Grace Hopper' })]);
  });

  it.each([
    ['"your previous answer"', 'Shorten your previous answer.'],
    ['"your last response"', 'Shorten your last response.'],
    ['"that answer"', 'Make that answer shorter.'],
    ['"your last reply"', 'Shorten your last reply.'],
  ])('LAB-3367 k4: %s is covered by the last-answer rules', async (_name, message) => {
    const h = setup();
    const options = await chat(h, { ...VALID, message, introDraft: { target: GRACE, text: CARD_TEXT } });
    expect(options.answerInstructions).toContain(EXAMPLES);
    expect(options.answerInstructions).toContain(NORMAL_WINS);
  });

  it('LAB-3367 F5: the rules name no prompt field, no tool, no heading and no shared prompt rule', () => {
    for (const word of ['latestReply', 'chatHistory', 'pageContext', 'draft_intro', 'answerInstructions', '##']) {
      expect(LAST_ANSWER_RULES).not.toContain(word);
    }
    expect(LAST_ANSWER_RULES).not.toContain('Always call at least one tool');
    expect(LAST_ANSWER_RULES).not.toContain('unknown');
    // o4: the F5 line is the first line, outside the list for a change, so it holds for every answer.
    expect(LAST_ANSWER_RULES.split('\n')[0]).toBe(NO_RULE_TALK);
    // F4: the draft line with no card still asks which reply.
    expect(LAST_ANSWER_RULES).toContain(DRAFT_LINE_REVISES);
  });

  it('LAB-3367 n1: a pure edit can skip the tools, but a new fact needs a tool result, else the answer says so', () => {
    expect(LAST_ANSWER_RULES).toContain(FACTS_FROM_TOOLS);
    expect(LAST_ANSWER_RULES).not.toContain('needs no tool call');
    expect(LAST_ANSWER_RULES).toContain('For a team size, use a team lookup.');
  });

  it.each([
    ['no context', {}],
    ['a page context', { context: TEAM_CONTEXT }],
  ])(
    'LAB-3367 F4: with no card (%s), the last-answer rules still apply, and no card text is in the prompt',
    async (_name, extra) => {
      const h = setup();
      const options = await chat(h, { ...VALID, message: 'Shorten your last answer.', ...extra });

      expect(options.answerInstructions).toBe(LAST_ANSWER_RULES);
      expect(options.promptContext).not.toContain('An intro draft card waits');
      expect(options.promptContext).not.toContain(BRIEF_REVISION);
      expect(options.promptContext).not.toContain(LAST_ANSWER_WINS);
      expect(options.extraResponseFields.drafts).toEqual([]);
    }
  );

  it('LAB-3367: other questions and a brief revision keep their rules next to the last-answer rules', async () => {
    const h = setup();
    const question = await chat(h, { ...VALID, message: 'What is new in LabOS?' });
    expect(question.answerInstructions).toBe(LAST_ANSWER_RULES);
    expect(question.promptContext ?? '').not.toContain('An intro draft card waits');

    const brief = await chat(h, { ...SHORTER, context: TEAM_CONTEXT, introDraft: { target: GRACE, text: CARD_TEXT } });
    for (const rule of RULES) expect(brief.promptContext).toContain(rule);
    expect(brief.answerInstructions).toBe(LAST_ANSWER_RULES);
  });

  describe('LAB-3367 F1, F3, K3: the code gate for an explicit last-answer request with a card', () => {
    const NORMAL = 'Lit Protocol is a key management network. It gives programmable signing.';
    const card = { introDraft: { target: GRACE, text: CARD_TEXT } };

    async function turnFor(message: string, latestReply: string, extra: Record<string, unknown> = card) {
      const h = setup();
      const options = await chat(h, { ...VALID, message, ...extra });
      return { options, turn: options.latestReplyTurn(latestReply) };
    }

    it.each([
      ['Shorten your last answer.'],
      ['add the team size to your last answer'],
      ['Shorten your previous reply.'],
      ['Rewrite YOUR  LATEST\nRESPONSE in one line.'],
      ['Shorten your last answers.'],
      // o3: a negated draft word does not point to the draft.
      ['shorten your last answer, not the draft'],
      ['Shorten your last answer but don’t change the draft.'],
      ["Shorten your last answer and don't touch the Draft."],
      ['Shorten your previous answer and leave the intro as it is.'],
      ['Rewrite your last reply, keep the card.'],
      ['Shorten your last answer without the draft.'],
      // o5: what you said or wrote.
      ['what you just said, make it shorter'],
      ['Shorten what you wrote.'],
    ])('"%s" after a normal answer: no draft tool and no card text for the turn', async (message) => {
      const { options, turn } = await turnFor(message, NORMAL);

      expect(turn.extraTools).not.toHaveProperty('draft_intro');
      const others = Object.fromEntries(Object.entries(options.extraTools).filter(([name]) => name !== 'draft_intro'));
      expect(turn.extraTools).toEqual(others);
      expect(turn.promptContext ?? '').not.toContain(CARD_TEXT);
      expect(turn.promptContext ?? '').not.toContain('An intro draft card waits');
      expect(turn).toHaveProperty('answerLine', undefined);
      expect(turn).not.toHaveProperty('fixedAnswer');
      // The card text stays in the default options. Only this turn drops it.
      expect(options.promptContext).toContain(CARD_TEXT);
    });

    it.each([
      ['an unknown reply (first turn, Stop or a cache failure)', ''],
      ['a blank reply', '  \n'],
      ['the fixed answer (K3)', WHICH_REPLY_LINE],
    ])('after %s: the fixed answer, no draft tool and no card text', async (_name, latestReply) => {
      const { turn } = await turnFor('Shorten your last answer.', latestReply, { ...card, context: TEAM_CONTEXT });
      // The page context of the turn stays. Only the card text goes.
      expect(turn.promptContext).toBeTruthy();
      expect(turn.fixedAnswer).toBe(WHICH_REPLY_LINE);
      expect(turn.extraTools).not.toHaveProperty('draft_intro');
      expect(turn.promptContext ?? '').not.toContain(CARD_TEXT);
      expect(turn).toHaveProperty('answerLine', undefined);
    });

    it('o3: after Stop, a message with no change word goes to the model, with no draft tool and no card text', async () => {
      const { turn } = await turnFor('Your last answer did not load. What is new in LabOS?', '');
      expect(turn).not.toHaveProperty('fixedAnswer');
      expect(turn.extraTools).not.toHaveProperty('draft_intro');
      expect(turn.promptContext ?? '').not.toContain(CARD_TEXT);
      expect(turn).toHaveProperty('answerLine', undefined);
    });

    it.each([
      ['a normal answer', NORMAL],
      ['an unknown reply', ''],
      ['the real draft line', INTRO_DRAFT_LINE],
    ])('item 4: after %s, a pasted text gets no draft tool and no card text', async (_name, latestReply) => {
      const { options, turn } = await turnFor(
        'shorten this: We build open tools for research teams and we want to meet more labs.',
        latestReply
      );
      expect(options.extraTools).toHaveProperty('draft_intro');
      expect(turn.extraTools).not.toHaveProperty('draft_intro');
      expect(turn.promptContext ?? '').not.toContain(CARD_TEXT);
      expect(turn.promptContext ?? '').not.toContain('An intro draft card waits');
      expect(turn).toHaveProperty('answerLine', undefined);
      expect(turn).not.toHaveProperty('fixedAnswer');
    });

    it.each([
      ['edit this: add my PS to it'],
      ['fix this: the name is wrong, it is Grace'],
      ['rewrite this: more friendly'],
    ])('t2: "%s" keeps the draft tool and the card', async (message) => {
      for (const reply of [NORMAL, INTRO_DRAFT_LINE]) {
        const { options, turn } = await turnFor(message, reply);
        expect(turn).toEqual({});
        expect(options.extraTools).toHaveProperty('draft_intro');
        expect(options.promptContext).toContain(CARD_TEXT);
      }
    });

    it('item 4: "shorten this draft: ..." keeps the draft tool and the card', async () => {
      const { options, turn } = await turnFor('shorten this draft: keep the part about Lit', INTRO_DRAFT_LINE);
      expect(turn).toEqual({});
      expect(options.extraTools).toHaveProperty('draft_intro');
      expect(options.promptContext).toContain(CARD_TEXT);
    });

    it('the fixed answer gives the full recovery request, not an open question', () => {
      expect(WHICH_REPLY_LINE).toBe(
        'I cannot tell which reply to change, so I changed nothing. To change the intro draft, say “make the draft shorter”.'
      );
    });

    it('keeps every other tool, and drops only draft_intro', async () => {
      const def = { name: 'list_news', description: 'News.', inputSchema: {}, execute: jest.fn() };
      jest.spyOn(LabosAgentService.prototype as any, 'tools').mockResolvedValue([def]);
      const { options, turn } = await turnFor('Shorten your last answer.', NORMAL);
      expect(Object.keys(options.extraTools).sort()).toEqual(['draft_intro', 'list_news']);
      expect(Object.keys(turn.extraTools)).toEqual(['list_news']);
      expect(turn.extraTools.list_news).toBe(options.extraTools.list_news);
    });

    it.each([
      ['F4: a member page that is also the card target', { context: { page: 'member', memberUid: 'm-grace' } }],
      ['a team page', { context: { page: 'team', teamUid: 't-acme' } }],
      ['the intro page', { context: TEAM_CONTEXT }],
      ['a member mention', { mentions: [{ type: 'member', uid: 'm-grace' }] }],
    ])('o1: on %s, the turn has no text that names draft_intro', async (_name, extra) => {
      const h = setup(undefined, [MEMBER_PERMISSIONS.SEARCH_READ]);
      jest.spyOn(pageContextModule, 'teamPagePrompt').mockResolvedValue('Team page.');
      const options = await chat(h, { ...VALID, message: 'Shorten your last answer.', ...card, ...extra });
      expect(options.promptContext).toContain('draft_intro');
      for (const latestReply of [NORMAL, '']) {
        const turn = options.latestReplyTurn(latestReply);
        expect(turn.promptContext ?? '').not.toContain('draft_intro');
        expect(turn.promptContext ?? '').not.toContain(CARD_TEXT);
        expect(turn.extraTools).not.toHaveProperty('draft_intro');
      }
    });

    describe('LAB-3367 G (Oleg QA p1795618192018809)', () => {
      const lines = (turn: { answerInstructions?: string }) => (turn.answerInstructions ?? '').split('\n');

      it('G1: an answer edit drops the page context, but keeps the mentions', async () => {
        const h = setup(undefined, [MEMBER_PERMISSIONS.SEARCH_READ]);
        jest.spyOn(pageContextModule, 'teamPagePrompt').mockResolvedValue('Team page Acme.');
        const extra = { context: { page: 'team', teamUid: 't-acme' } };
        const options = await chat(h, { ...VALID, message: 'Shorten your last answer.', ...card, ...extra });
        expect(options.promptContext).toContain('Team page Acme.');
        expect(options.latestReplyTurn(NORMAL).promptContext ?? '').not.toContain('Team page Acme.');
      });

      it.each([['this team'], ['this member'], ['this story'], ['this job'], ['this page']])(
        'G1: "%s" in the message keeps the page context',
        async (words) => {
          const h = setup(undefined, [MEMBER_PERMISSIONS.SEARCH_READ]);
          jest.spyOn(pageContextModule, 'teamPagePrompt').mockResolvedValue('Team page Acme.');
          const message = `Shorten your last answer about ${words}.`;
          const options = await chat(h, { ...VALID, message, ...card, context: { page: 'team', teamUid: 't-acme' } });
          expect(options.latestReplyTurn(NORMAL).promptContext).toContain('Team page Acme.');
        }
      );

      it('G1, G4: a change of a known reply gets the card line and "Change only the text in Previous reply."', async () => {
        const { turn } = await turnFor('Shorten your last answer.', NORMAL);
        expect(lines(turn)).toEqual([...LAST_ANSWER_RULES.split('\n'), CARD_OPEN_RULE, PREVIOUS_REPLY_RULE]);
        expect(PREVIOUS_REPLY_RULE).toBe('Change only the text in Previous reply.');
        expect(CARD_OPEN_RULE).toBe(
          'An intro draft card is open in the chat. This request is not about it. Do not say that there is no draft.'
        );
        expect(turn).not.toHaveProperty('omitLatestReply');
      });

      it('G1: a pasted text gets only the colon rule, also after a known reply', async () => {
        for (const reply of [NORMAL, '', INTRO_DRAFT_LINE]) {
          const { turn } = await turnFor('shorten this: We build open tools for research teams.', reply);
          expect(lines(turn).slice(-2)).toEqual([CARD_OPEN_RULE, PASTED_TEXT_RULE]);
          expect(turn.answerInstructions).not.toContain(PREVIOUS_REPLY_RULE);
          expect(turn).not.toHaveProperty('omitLatestReply');
        }
        expect(PASTED_TEXT_RULE).toBe(
          'Change only the text after the colon in the question. Write only the changed text.'
        );
      });

      it('G4: a question about the last answer with no change word gets the card line only', async () => {
        const { turn } = await turnFor('keep the draft, what was your last answer about?', NORMAL);
        expect(lines(turn).slice(-1)).toEqual([CARD_OPEN_RULE]);
      });

      it('G7: an unknown reply and a failure word: no Previous reply line, answer as a new question', async () => {
        for (const reply of ['', WHICH_REPLY_LINE]) {
          const { turn } = await turnFor('Your last answer did not load. What is new in LabOS?', reply);
          expect(turn.omitLatestReply).toBe(true);
          expect(lines(turn).slice(-2)).toEqual([CARD_OPEN_RULE, ASK_AGAIN_RULE]);
          expect(turn).not.toHaveProperty('fixedAnswer');
        }
        expect(ASK_AGAIN_RULE).toContain('Answer the message as a new question with the tools.');
      });

      it('G7: also with no card, the turn omits the Previous reply line', async () => {
        const h = setup();
        const options = await chat(h, { ...VALID, message: 'your last answer was cut off, tell me about Lit again' });
        const turn = options.latestReplyTurn('');
        expect(turn.omitLatestReply).toBe(true);
        expect(lines(turn).slice(-1)).toEqual([ASK_AGAIN_RULE]);
        expect(options.latestReplyTurn(NORMAL)).toEqual({});
      });

      it('G7: a known reply keeps the Previous reply line', async () => {
        const { turn } = await turnFor('Your last answer was cut off. Shorten it.', NORMAL);
        expect(turn).not.toHaveProperty('omitLatestReply');
      });

      it('G3: the options give the bare words for the draft line', async () => {
        const { options } = await turnFor('Shorten your last answer.', NORMAL);
        expect(options.reservedReplyLabel).toBe('an intro draft card');
        expect(options.reservedReply).toBe(INTRO_DRAFT_LINE);
      });

      it('v1: straight after the draft, "keep the draft and shorten your last answer" gets the fixed line', async () => {
        const { turn } = await turnFor('keep the draft and shorten your last answer', INTRO_DRAFT_LINE);
        expect(turn.fixedAnswer).toBe(WHICH_REPLY_LINE);
        expect(turn.extraTools).not.toHaveProperty('draft_intro');
        expect(turn.promptContext ?? '').not.toContain(CARD_TEXT);
      });
    });

    it('after the real draft line: no change, so the draft revision still works', async () => {
      const { options, turn } = await turnFor('Shorten your last answer.', INTRO_DRAFT_LINE);
      expect(turn).toEqual({});
      expect(options.extraTools).toHaveProperty('draft_intro');
    });

    it.each([
      ['F5 repro: "add that answer to the draft"', 'add that answer to the draft'],
      ['a named draft target', 'Add your last answer to the draft.'],
      ['a named intro target', 'Put your previous answer into the intro.'],
      // o3: card, introduction and plurals name the draft too, in any letter case.
      ['a named card', 'add your last answer to the card'],
      ['a named introduction', 'put your previous answer into the introduction'],
      ['a plural draft word', 'Use your last answer in both DRAFTS.'],
      ['"include" with a named intro', 'Include your latest response in the Intro.'],
      ['"make the draft shorter"', 'make the draft shorter'],
      ['"shorten the intro"', 'shorten the intro'],
      ['no "your" (a boundary of the check)', 'Shorten last answer.'],
      ['an implicit brief revision', 'Make it shorter.'],
      ['"that answer" (prompt rules only)', 'Make that answer shorter.'],
      ['a name only', 'Write the intro to Grace instead.'],
      ['no whole-word match', 'Shorten yourlast answer.'],
    ])('%s after a normal answer: no change', async (_name, message) => {
      const { options, turn } = await turnFor(message, NORMAL);
      expect(turn).toEqual({});
      expect(options.extraTools).toHaveProperty('draft_intro');
    });

    it('F4: with no card, no change, also for an unknown reply', async () => {
      expect((await turnFor('Shorten your last answer.', '', {})).turn).toEqual({});
      expect((await turnFor('Shorten your last answer.', NORMAL, {})).turn).toEqual({});
    });

    it('model text that is only the draft line is not stored as a draft turn', async () => {
      const { options } = await turnFor('Shorten your last answer.', NORMAL);
      expect(options.reservedReply).toBe(INTRO_DRAFT_LINE);
      // t7b, t1: the other forms of the line, and the answer when no text is left.
      expect(options.reservedReplyForms).toEqual([
        'Here’s a draft intro. Edit it in the card, then send.',
        "Here's a draft intro. Edit it in the card, then send.",
      ]);
      expect(options.emptyReplyLine).toBe('I did not change anything. Please say it again in other words.');
    });

    it('the fixed question has no prompt field, rule or member text', () => {
      expect(WHICH_REPLY_LINE).not.toMatch(/latestReply|unknown|draft_intro|Grace|Card-text/);
    });
  });

  it('LAB-3367 F2: a new draft to a permitted mentioned member works', async () => {
    const h = setup(undefined, [MEMBER_PERMISSIONS.SEARCH_READ]);
    const options = await chat(h, {
      ...VALID,
      message: 'Write the intro to Grace instead.',
      mentions: [{ type: 'member', uid: 'm-grace' }],
      introDraft: { target: ACME, text: CARD_TEXT },
    });

    expect(options.promptContext).toContain(DIFFERENT_ITEM);
    expect(options.promptContext).toContain('call draft_intro with type "member" and targetUid "m-grace"');
    await options.extraTools.draft_intro.execute({ type: 'member', targetUid: 'm-grace', text: SHORT });
    expect(options.extraResponseFields.drafts).toEqual([draftFor({ ...GRACE, name: 'Grace Hopper' })]);
  });

  it('LAB-3367 R4: an edit with a mention chip keeps the card target', async () => {
    const h = setup(undefined, [MEMBER_PERMISSIONS.SEARCH_READ]);
    const options = await chat(h, {
      ...VALID,
      message: 'Mention that I know Grace.',
      mentions: [{ type: 'member', uid: 'm-grace' }],
      introDraft: { target: ACME, text: CARD_TEXT },
    });

    expect(options.promptContext).toContain(NAME_IN_EDIT);
    await options.extraTools.draft_intro.execute({ type: 'team', targetUid: 't-acme', text: SHORT });
    expect(options.extraResponseFields.drafts).toEqual([draftFor({ ...ACME, name: 'Acme Team' })]);
  });

  it('LAB-3367 F2: a switch by name only gets the @mention rule, and adds no target', async () => {
    const h = setup();
    const options = await chat(h, {
      ...VALID,
      message: 'Write the intro to Linus instead.',
      introDraft: { target: GRACE, text: CARD_TEXT },
    });

    expect(options.promptContext).toContain(NAME_ONLY);
    // The only target of the turn is the card. A name gives no new target, so draft_intro refuses another uid.
    const refusal = await options.extraTools.draft_intro.execute({ type: 'member', targetUid: 'm-ada', text: SHORT });
    expect(refusal).toContain('not the intro target of this turn');
    // h5: the refusal also suggests an @mention. The tool description does not change.
    expect(refusal).toContain('Ask the member to @mention the member or team in the message');
    expect(options.extraTools.draft_intro.description).not.toContain('@mention');
    expect(options.extraResponseFields.drafts).toEqual([]);
  });

  it('LAB-3367 h3: the latest reply key is scoped to the signed-in member and the thread', async () => {
    const h = setup();
    const options = await chat(h, { ...SHORTER, introDraft: { target: GRACE, text: CARD_TEXT } });

    expect(options.latestReplyKey).toBe(latestReplyCacheKey('m-ada', 'thread-1'));
    // The env prefix of the proposal keys, so environments that share a Redis do not collide.
    expect(options.latestReplyKey).toBe(`${APP_ENV.DEV}:labos-agent:latest-reply:["m-ada","thread-1"]`);
    // Not the raw thread ID, and not the Husky summary key.
    expect(options.latestReplyKey).not.toBe('thread-1');
    expect(options.latestReplyKey).not.toBe('thread-1:summary');
  });

  it('LAB-3367 h3: the key of another member in the same thread is different, and IDs cannot collide', () => {
    expect(latestReplyCacheKey('m-ada', 'thread-1')).not.toBe(latestReplyCacheKey('m-grace', 'thread-1'));
    const env = process.env.ENVIRONMENT;
    process.env.ENVIRONMENT = 'feature-a';
    const featureA = latestReplyCacheKey('m-ada', 'thread-1');
    process.env.ENVIRONMENT = 'feature-b';
    expect(latestReplyCacheKey('m-ada', 'thread-1')).not.toBe(featureA);
    process.env.ENVIRONMENT = env;
    expect(latestReplyCacheKey('a:b', 'c')).not.toBe(latestReplyCacheKey('a', 'b:c'));
    expect(latestReplyCacheKey('a","b', 'c')).not.toBe(latestReplyCacheKey('a', 'b","c'));
    // A lone surrogate is a valid C1 threadId. JSON.stringify does not throw for it.
    expect(() => latestReplyCacheKey('m-ada', '\ud800')).not.toThrow();
  });

  it.each([
    ['no context', {}],
    ['the Home page', { context: { page: 'home' } }],
    ['a member page', { context: { page: 'member', memberUid: 'm-grace' } }],
    ['a member mention chip', { mentions: [{ type: 'member', uid: 'm-grace' }] }],
    ['the intro page', { context: MEMBER_CONTEXT }],
  ])('LAB-3367: with no introDraft, %s gives no revision rule and no card text', async (_name, extra) => {
    const h = setup(undefined, [MEMBER_PERMISSIONS.SEARCH_READ]);
    const options = await chat(h, { ...SHORTER, ...extra });
    for (const text of [...RULES, CARD_TEXT, 'An intro draft card waits']) {
      expect(options.promptContext ?? '').not.toContain(text);
    }
  });

  it('C4-R4: a turn with no introDraft has no draft text in the prompt context', async () => {
    const h = setup();
    const withCard = await chat(h, { ...SHORTER, introDraft: { target: GRACE, text: CARD_TEXT } });
    const noContext = await chat(h, SHORTER);
    const introPage = await chat(h, { ...SHORTER, context: MEMBER_CONTEXT });

    expect(withCard.promptContext).toContain(CARD_TEXT);
    for (const options of [noContext, introPage]) {
      expect(options.promptContext).not.toContain(CARD_TEXT);
      expect(options.promptContext).not.toContain('An intro draft card waits');
    }
  });

  it('C4-R5: the backend writes no cache key and no log line with the draft text', async () => {
    const h = setup();
    const logs = ['log', 'error', 'warn', 'debug', 'verbose'].map((level) =>
      jest.spyOn(Logger.prototype, level as 'log').mockImplementation(() => undefined)
    );
    const consoleSpies = ['log', 'error', 'warn', 'info', 'debug'].map((level) =>
      jest.spyOn(console, level as 'log').mockImplementation(() => undefined)
    );

    const options = await chat(h, { ...SHORTER, introDraft: { target: GRACE, text: CARD_TEXT } });
    await options.extraTools.draft_intro.execute({ type: 'member', targetUid: 'm-grace', text: SHORT });
    jest.spyOn(h.introRequests, 'findEligibleRequester').mockRejectedValueOnce(new Error('db down'));
    await options.extraTools.draft_intro.execute({ type: 'member', targetUid: 'm-grace', text: SHORT });

    const written = JSON.stringify([
      h.cache.set.mock.calls,
      ...logs.map((spy) => spy.mock.calls.map((call) => call.map(String))),
      ...consoleSpies.map((spy) => spy.mock.calls.map((call) => call.map(String))),
    ]);
    expect(written).not.toContain('Card-text-7f3a');
    expect(Object.keys(h.husky)).toEqual(['createContextualToolsResponse']);
  });

  it('C4-R6: the intro line shows only when drafts has a card, and a refused draft gives no line', async () => {
    const eligible = setup();
    const ok = await chat(eligible, { ...SHORTER, introDraft: { target: GRACE, text: CARD_TEXT } });
    expect(ok.answerLine()).toBeUndefined();
    await ok.extraTools.draft_intro.execute({ type: 'member', targetUid: 'm-grace', text: SHORT });
    expect(ok.answerLine()).toBe(INTRO_DRAFT_LINE);
    await ok.extraTools.draft_intro.execute({ type: 'member', targetUid: 'm-grace', text: 'too short' });
    expect(ok.answerLine()).toBeUndefined();

    const notEligible = setup({});
    const refused = await chat(notEligible, { ...SHORTER, introDraft: { target: GRACE, text: CARD_TEXT } });
    expect(await refused.extraTools.draft_intro.execute({ type: 'member', targetUid: 'm-grace', text: SHORT })).toBe(
      INTRO_NOT_ELIGIBLE_TEXT
    );
    expect(refused.extraResponseFields.drafts).toEqual([]);
    expect(refused.answerLine()).toBeUndefined();
  });
});

/** As `InvalidToolArgumentsError` in ai 4.0.19 (dist/index.js): the cause message, with the args, is in `message`. */
function invalidToolArgsError(toolName: string, toolArgs: string, cause: { message: string }) {
  return Object.assign(
    new AISDKError({
      name: 'AI_InvalidToolArgumentsError',
      message: `Invalid arguments for tool ${toolName}: ${cause.message}`,
      cause,
    }),
    { toolName, toolArgs }
  );
}

describe('draft_intro invalid arguments (LAB-3362, Oleg 1795251083.950879)', () => {
  const SECRET = 'Secret-draft-5e1f: I lead fundraising at Acme and want your advice soon.';

  async function draftTool() {
    const h = setup();
    await h.controller.chat({ ...VALID, context: MEMBER_CONTEXT } as any, h.req, h.res as any);
    return h.husky.createContextualToolsResponse.mock.calls.at(-1)[3].extraTools.draft_intro;
  }

  it('an invalid type gives an AI SDK error with the text in its message, and the log form has no text', async () => {
    const args = { type: 'person', targetUid: 'm-grace', text: SECRET };
    const parsed = (await draftTool()).parameters.safeParse(args);
    expect(parsed.success).toBe(false);

    // As the AI SDK does when the model sends bad tool args.
    const error = invalidToolArgsError(
      'draft_intro',
      JSON.stringify(args),
      TypeValidationError.wrap({ value: args, cause: parsed.error })
    );
    expect(error.message).toContain(SECRET);

    expect(logSafeError(error, ['draft_intro'])).toBe(
      '{"name":"AI_InvalidToolArgumentsError","toolName":"draft_intro"}'
    );
    expect(logSafeError(error.cause)).toBe('{"name":"AI_TypeValidationError"}');
  });

  it('an extra field is dropped from the args and does not reach execute', async () => {
    const parsed = (await draftTool()).parameters.safeParse({
      type: 'member',
      targetUid: 'm-grace',
      text: 'I lead fundraising at Acme and want your advice.',
      note: SECRET,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty('note');
    expect(JSON.stringify(parsed.data)).not.toContain('Secret-draft-5e1f');
  });
});
