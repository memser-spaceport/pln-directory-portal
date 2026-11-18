// S3 intro drafts (LAB-3300, contract section 8). The real IntroRequestsService runs against a fake Prisma, so the
// agent and C3 share one sender rule in these tests. Same light mocks as labos-agent.spec.ts.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), isAxiosError: () => false } }));
jest.mock('../guards/user-token-validation.guard', () => ({ UserTokenValidation: class UserTokenValidation {} }));
jest.mock('../husky/husky-ai.service', () => ({ HuskyAiService: jest.fn() }));
jest.mock('../team-news/team-news-query.service', () => ({ TeamNewsQueryService: jest.fn() }));
jest.mock('../team-news/team-news-suggestions.service', () => ({ TeamNewsSuggestionsService: jest.fn() }));
jest.mock('../mcp/mcp-tool-catalog', () => ({ McpToolCatalog: jest.fn() }));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({ AccessControlV2Service: jest.fn() }));
jest.mock('ai', () => ({ tool: (def: unknown) => def }));

import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { MCP_SCOPE_KEYS } from 'libs/contracts/src/schema/mcp-scopes';
import { IntroRequestsService } from '../intro-requests/intro-requests.service';
import { PL_INFRA_POLICY_CODE } from '../pl-infra-members/pl-infra-members.constants';
import { PL_PORTFOLIO_COMMUNITY_AFFILIATION } from '../teams/team-affiliation.constants';
import { APP_ENV } from '../utils/constants';
import { LabosAgentAccessService } from './labos-agent-access.service';
import { LabosAgentController } from './labos-agent.controller';
import { INTRO_DRAFT_FAILED_TEXT, INTRO_NOT_ELIGIBLE_TEXT } from './labos-agent-drafts';
import { LabosAgentProposalStore } from './labos-agent-proposals';
import { LabosAgentService } from './labos-agent.service';

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
const TEAM_CONTEXT = { page: 'intro', introTarget: { type: 'team', uid: 't-acme' } };

function setup(sender: Partial<Person> = { roles: [portfolio()] }) {
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
        return where.email ? requester(person, select) : { name: person.name };
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
  const introRequests = new IntroRequestsService(prisma as any, telegram as any);
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const husky = { createContextualToolsResponse: jest.fn().mockResolvedValue({ pipeTo: jest.fn() }) };
  const service = new LabosAgentService(
    prisma as any,
    new LabosAgentAccessService(),
    husky as any,
    { getTeamNewsItemDto: jest.fn() } as any,
    { forApp: jest.fn(() => []) } as any,
    { getMemberAccess: jest.fn().mockResolvedValue({ effectivePermissions: [] }) } as any,
    new LabosAgentProposalStore(cache as any),
    { adminCaps: jest.fn(async () => Object.fromEntries(MCP_SCOPE_KEYS.map((key) => [key, 'write']))) } as any,
    introRequests,
    {} as any,
    {} as any
  );
  const controller = new LabosAgentController(service);
  const req = { userEmail: 'ada@example.com' };
  const res = { setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(), end: jest.fn(), destroy: jest.fn() };

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

  it('S3-R9: C3 keeps its target rule: a deleted (INACTIVE) team is still a valid C3 target', async () => {
    const h = setup();
    await expect(
      h.introRequests.create('ada@example.com', { type: 'TEAM', targetId: 't-deleted', text: TEXT })
    ).resolves.toEqual({ uid: 'req-1' });
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
