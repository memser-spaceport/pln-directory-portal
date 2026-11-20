// The guard and the AI search service pull in ESM packages (axios, @ai-sdk/*) that this jest
// config cannot parse. The guard itself is not under test: it owns 401, and is only checked here.
jest.mock('../guards/user-token-validation.guard', () => ({ UserTokenValidation: class UserTokenValidation {} }));
jest.mock('../husky/husky-ai.service', () => ({ HuskyAiService: jest.fn() }));
jest.mock('../team-news/team-news-query.service', () => ({ TeamNewsQueryService: jest.fn() }));
jest.mock('../team-news/team-news-suggestions.service', () => ({ TeamNewsSuggestionsService: jest.fn() }));
jest.mock('../mcp/mcp-tool-catalog', () => ({ McpToolCatalog: jest.fn() }));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({ AccessControlV2Service: jest.fn() }));
jest.mock('../intro-requests/intro-requests.service', () => ({ IntroRequestsService: jest.fn() }));
// The service imports TeamsService as a value; its real module pulls cheerio and undici, which need ReadableStream.
jest.mock('../teams/teams.service', () => ({ TeamsService: jest.fn() }));
jest.mock('ai', () => ({ tool: (def: unknown) => def }));

import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { APP_ENV } from '../utils/constants';
import { LabosAgentAccessService } from './labos-agent-access.service';
import { answerCounts } from './labos-agent-answer-counts';
import { LabosAgentController } from './labos-agent.controller';
import { LabosAgentService } from './labos-agent.service';
import { mcpToolsAsAgentTools, newsLinkFields, newsLinkLines, withNewsStoryLinks } from './labos-agent-news.tools';
import { NO_PAGE_SENTENCE } from './labos-agent-page-context';
import { buildSourceRefs } from '../husky/source-refs';

if (!(globalThis as any).WritableStream) {
  // The jest node environment predates the web streams globals this Node runtime has.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (globalThis as any).WritableStream = require('stream/web').WritableStream;
}

const NEWS_ITEM = {
  uid: 'news-1',
  title: 'Team X raises a seed round',
  summary: 'Team X raised money.',
  eventType: 'FUNDING',
  eventDate: '2026-11-10T00:00:00.000Z',
  teamUid: 'team-x',
  teamName: 'Team X',
  sourceUrl: 'https://example.com/x',
};

const VALID = { threadId: 'thread-1', chatId: 'chat-1', message: '  What does this story mean?  ' };

function setup(env = APP_ENV.DEV as string, pilot = false) {
  process.env.ENVIRONMENT = env;
  const prisma = { member: { findUnique: jest.fn().mockResolvedValue({ uid: 'member-1', deletedAt: null }) } };
  const stream = { pipeTo: jest.fn().mockResolvedValue(undefined) };
  const husky = { createContextualToolsResponse: jest.fn().mockResolvedValue(stream) };
  const query = { getTeamNewsItemDto: jest.fn().mockResolvedValue(NEWS_ITEM), listTeamNews: jest.fn() };
  const names = ['list_news', 'get_news_item', 'get_my_profile', 'list_my_experiences', 'delete_experience'];
  const names2 = ['update_my_profile', 'add_experience', 'update_experience', 'update_team'];
  const defs = [...names, ...names2].map((name) => ({
    name,
    description: name,
    visibility: 'always',
    execute: jest.fn(),
  }));
  const catalog = { forApp: jest.fn(() => defs) };
  const caps = { profile: 'write' };
  const scopes = { adminCaps: jest.fn().mockResolvedValue(caps) };
  const accessControl = { getMemberAccess: jest.fn().mockResolvedValue({ effectivePermissions: ['forum.read'] }) };
  const service = new LabosAgentService(
    prisma as any,
    new LabosAgentAccessService({ hasPermission: jest.fn().mockResolvedValue({ allowed: pilot }) } as any),
    husky as any,
    query as any,
    catalog as any,
    accessControl as any,
    {} as any,
    scopes as any,
    { findAgentTargetName: jest.fn(), findEligibleRequester: jest.fn() } as any,
    {} as any,
    {} as any
  );
  const controller = new LabosAgentController(service);
  const res = {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
  };
  const req = { userEmail: 'ada@example.com' };
  return { prisma, husky, query, stream, controller, res, req, catalog, caps };
}

async function chatError(body: unknown, env?: string) {
  const { controller, res, req } = setup(env);
  return controller.chat(body, req, res as any).then(
    () => null,
    (error) => error
  );
}

describe('LabosAgentController', () => {
  const originalEnv = process.env.ENVIRONMENT;
  afterAll(() => {
    process.env.ENVIRONMENT = originalEnv;
  });

  it('uses the UserTokenValidation guard on every route, so the guard returns 401', () => {
    const { chat, access, confirm } = LabosAgentController.prototype;
    for (const handler of [chat, access, confirm]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([UserTokenValidation]);
    }
  });

  it.each([
    ['no body', undefined],
    ['missing threadId', { chatId: 'c', message: 'hi' }],
    ['threadId over 64 characters', { ...VALID, threadId: 'x'.repeat(65) }],
    ['empty chatId', { ...VALID, chatId: '' }],
    ['blank message', { ...VALID, message: '   ' }],
    ['message over 2000 characters', { ...VALID, message: 'x'.repeat(2001) }],
    ['unknown page', { ...VALID, context: { page: 'forum' } }],
    ['news-story without newsUid', { ...VALID, context: { page: 'news-story' } }],
    ['intro without introTarget', { ...VALID, context: { page: 'intro' } }],
    [
      'introTarget on the home page',
      { ...VALID, context: { page: 'home', introTarget: { type: 'member', uid: 'm' } } },
    ],
    [
      'introTarget with a bad type',
      { ...VALID, context: { page: 'intro', introTarget: { type: 'project', uid: 'm' } } },
    ],
    [
      'introTarget uid over 64 characters',
      { ...VALID, context: { page: 'intro', introTarget: { type: 'team', uid: 'x'.repeat(65) } } },
    ],
  ])('returns 400 VALIDATION_ERROR for %s', async (_name, body) => {
    const error = await chatError(body);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toEqual(expect.objectContaining({ statusCode: 400, code: 'VALIDATION_ERROR' }));
  });

  it('returns 403 AGENT_NOT_ENABLED on production for a member without labos_agent.use', async () => {
    const error = await chatError(VALID, APP_ENV.PRODUCTION);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toEqual(expect.objectContaining({ statusCode: 403, code: 'AGENT_NOT_ENABLED' }));
  });

  it('returns 403 AGENT_NOT_ENABLED when the token has no live member', async () => {
    const { controller, prisma, res, req } = setup();
    prisma.member.findUnique.mockResolvedValue({ uid: 'member-1', deletedAt: new Date() });
    await expect(controller.chat(VALID, req, res as any)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 404 NEWS_NOT_FOUND for an unknown newsUid, before the stream starts', async () => {
    const { controller, query, husky, res, req } = setup();
    query.getTeamNewsItemDto.mockResolvedValue(null);
    const body = { ...VALID, context: { page: 'news-story', newsUid: 'missing' } };
    const error = await controller.chat(body, req, res as any).catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toEqual(expect.objectContaining({ statusCode: 404, code: 'NEWS_NOT_FOUND' }));
    expect(husky.createContextualToolsResponse).not.toHaveBeenCalled();
    expect(res.flushHeaders).not.toHaveBeenCalled();
  });

  it('streams the AI search answer with the story context, the tools and proposals []', async () => {
    const { controller, query, husky, stream, res, req, catalog, caps } = setup();
    const body = { ...VALID, context: { page: 'news-story', newsUid: 'news-1' } };
    await controller.chat(body, req, res as any);

    expect(query.getTeamNewsItemDto).toHaveBeenCalledWith('news-1', new Set(), 'member-1');
    const [chatInfo, isLoggedIn, email, options] = husky.createContextualToolsResponse.mock.calls[0];
    expect(chatInfo).toEqual({ question: 'What does this story mean?', threadId: 'thread-1', chatId: 'chat-1' });
    expect(isLoggedIn).toBe(true);
    expect(email).toBe('ada@example.com');
    expect(options.promptContext).toContain('Team X raises a seed round');
    expect(options.promptContext).toContain('news-1');
    // The member's real RBAC permissions and the admin MCP caps pick the tools from the shared MCP list (LAB-3299).
    expect(catalog.forApp).toHaveBeenCalledWith(new Set(['forum.read']), caps);
    expect(Object.keys(options.extraTools).sort()).toEqual([
      'add_experience',
      'draft_intro',
      'get_my_profile',
      'get_news_item',
      'list_my_experiences',
      'list_news',
      'update_experience',
      'update_my_profile',
      'update_team',
    ]);
    // S3-R8: a turn without a draft has drafts [], next to the S1 and S2 fields.
    expect(options.extraResponseFields).toEqual({ proposals: [], drafts: [] });
    expect(options.persistHistory).toBe(false);
    // LAB-3297 (V0-R4): the answer counts come from the finished turn. LAB-3362 D2: with the web `sources` only.
    const turn = { toolNames: ['searchWeb'], sources: ['https://example.com/a'], sourceRefs: [] };
    expect(options.turnFields(turn)).toEqual({ sources: ['https://example.com/a'], ...answerCounts(turn) });

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(res.setHeader).toHaveBeenCalledWith('Transfer-Encoding', 'chunked');
    expect(res.flushHeaders).toHaveBeenCalled();
    expect(stream.pipeTo).toHaveBeenCalled();
  });

  it('LAB-3362 D2: sends only web sources that are not the app and not in sourceRefs, keeps plnetwork.io, and counts what it sends', async () => {
    const { controller, husky, res, req } = setup();
    await controller.chat(VALID, req, res as any);
    const { turnFields } = husky.createContextualToolsResponse.mock.calls[0][3];
    const sourceRefs = [
      { index: 1, title: 'Story', type: 'news', directoryLink: '/?news=n-1' },
      { index: 2, title: 'Textile', type: 'team', directoryLink: '/teams/t-1', externalUrl: 'https://textile.io' },
    ];
    const sources = [
      'https://directory-portal-lab-3272.os.pl.xyz/?news=n-1',
      'https://www.textile.io/',
      'https://filecoin.io/blog/post',
      'https://plnetwork.io/blog/post',
    ];

    const fields = turnFields({ toolNames: ['getTeamNews', 'searchWeb'], sources, sourceRefs });

    expect(fields.sources).toEqual(['https://filecoin.io/blog/post', 'https://plnetwork.io/blog/post']);
    expect(fields.sourceCount).toBe(4);
  });

  it('LAB-3362 D1: sends news sourceRefs as /?news=<uid> and counts the refs it sends', async () => {
    const { controller, husky, res, req } = setup();
    await controller.chat(VALID, req, res as any);
    const { turnFields } = husky.createContextualToolsResponse.mock.calls[0][3];
    const sourceRefs = [
      // The AI search news tool writes the old Home path; the agent tool writes the new one. One story.
      { index: 1, title: 'Story', type: 'news', directoryLink: '/home?news=news-1' },
      { index: 2, title: 'Story', type: 'news', directoryLink: '/?news=news-1' },
      { index: 3, title: 'Team X', type: 'team', directoryLink: '/teams/team-x' },
    ];

    const fields = turnFields({ toolNames: ['getTeamNews', 'list_news'], sources: [], sourceRefs });

    expect(fields.sourceRefs.map((ref) => ref.directoryLink)).toEqual([
      '/?news=news-1',
      '/?news=news-1',
      '/teams/team-x',
    ]);
    expect(fields.sourceRefs.map((ref) => ref.index)).toEqual([1, 2, 3]);
    expect(fields.sourceCount).toBe(2);
    expect(fields.toolCount).toBe(2);
  });

  it('passes a Home context and no context through without a news lookup', async () => {
    const { controller, query, husky, res, req } = setup();
    await controller.chat({ ...VALID, context: { page: 'home' } }, req, res as any);
    await controller.chat(VALID, req, res as any);
    expect(query.getTeamNewsItemDto).not.toHaveBeenCalled();
    expect(husky.createContextualToolsResponse.mock.calls[0][3].promptContext).toContain('Home');
    // S6-C37 (LAB-3318, contract 10.6): no context and no mentions give the no-page sentence and no page data.
    expect(husky.createContextualToolsResponse.mock.calls[1][3].promptContext).toBe(NO_PAGE_SENTENCE);
  });

  it('destroys the connection when the stream fails after the headers', async () => {
    const { controller, stream, res, req } = setup();
    const failure = new Error('model failed');
    stream.pipeTo.mockRejectedValue(failure);
    await controller.chat(VALID, req, res as any);
    expect(res.destroy).toHaveBeenCalledWith(failure);
  });

  it('GET access returns enabled true outside production and false on production, never 403', async () => {
    const dev = setup(APP_ENV.DEV);
    await expect(dev.controller.access(dev.req)).resolves.toEqual({ enabled: true });
    const prod = setup(APP_ENV.PRODUCTION);
    await expect(prod.controller.access(prod.req)).resolves.toEqual({ enabled: false });
  });

  it('on production, GET access and the chat are on for a member with labos_agent.use (LAB-3344)', async () => {
    const prod = setup(APP_ENV.PRODUCTION, true);
    await expect(prod.controller.access(prod.req)).resolves.toEqual({ enabled: true });
    await prod.controller.chat(VALID, prod.req, prod.res as any);
    expect(prod.husky.createContextualToolsResponse).toHaveBeenCalledTimes(1);
  });
});

describe('LabosAgentAccessService.isEnabled (LAB-3344, D1 option A)', () => {
  const originalEnv = process.env.ENVIRONMENT;
  afterEach(() => {
    process.env.ENVIRONMENT = originalEnv;
  });

  /** A fake of AccessControlV2Service.hasPermission over direct and policy grants, like getMemberAccess. */
  function accessFor(grants: { direct?: string[]; policies?: Record<string, string[]> }) {
    const hasPermission = jest.fn(async (memberUid: string, code: string) => {
      const effective = [...(grants.direct ?? []), ...Object.values(grants.policies ?? {}).flat()];
      return { memberUid, permissionCode: code, allowed: effective.includes(code) };
    });
    return { access: new LabosAgentAccessService({ hasPermission } as any), hasPermission };
  }

  it('on production: enables a member with labos_agent.use granted directly', async () => {
    process.env.ENVIRONMENT = APP_ENV.PRODUCTION;
    const { access, hasPermission } = accessFor({ direct: ['labos_agent.use'] });
    await expect(access.isEnabled('member-1')).resolves.toBe(true);
    expect(hasPermission).toHaveBeenCalledWith('member-1', 'labos_agent.use');
  });

  it('on production: enables a member with labos_agent.use through the labos_agent_pilot policy', async () => {
    process.env.ENVIRONMENT = APP_ENV.PRODUCTION;
    const { access } = accessFor({ policies: { labos_agent_pilot: ['labos_agent.use'] } });
    await expect(access.isEnabled('member-1')).resolves.toBe(true);
  });

  it('on production: enables staff only through the same permission (no other staff rule)', async () => {
    process.env.ENVIRONMENT = APP_ENV.PRODUCTION;
    const staff = accessFor({
      policies: { labos_agent_pilot: ['labos_agent.use'], pl_infra: ['directory.admin.full'] },
    });
    await expect(staff.access.isEnabled('staff-1')).resolves.toBe(true);
    const adminOnly = accessFor({ direct: ['directory.admin.full'] });
    await expect(adminOnly.access.isEnabled('admin-1')).resolves.toBe(false);
  });

  it('on production: does not enable a member with no grant or with other permissions only', async () => {
    process.env.ENVIRONMENT = APP_ENV.PRODUCTION;
    await expect(accessFor({}).access.isEnabled('member-1')).resolves.toBe(false);
    const other = accessFor({ direct: ['forum.read'], policies: { pl_ats_user: ['ats_user'] } });
    await expect(other.access.isEnabled('member-1')).resolves.toBe(false);
  });

  it('on production: gives false when the permission lookup fails', async () => {
    process.env.ENVIRONMENT = APP_ENV.PRODUCTION;
    const hasPermission = jest.fn().mockRejectedValue(new Error('Member not found'));
    const access = new LabosAgentAccessService({ hasPermission } as any);
    await expect(access.isEnabled('member-1')).resolves.toBe(false);
  });

  it('keeps the earlier rule outside production: every live member is on, with no lookup', async () => {
    process.env.ENVIRONMENT = APP_ENV.DEV;
    const { access, hasPermission } = accessFor({});
    await expect(access.isEnabled('member-1')).resolves.toBe(true);
    expect(hasPermission).not.toHaveBeenCalled();
  });

  it('never enables a caller with no live member', async () => {
    for (const env of [APP_ENV.DEV, APP_ENV.PRODUCTION]) {
      process.env.ENVIRONMENT = env;
      const { access, hasPermission } = accessFor({ direct: ['labos_agent.use'] });
      await expect(access.isEnabled(undefined)).resolves.toBe(false);
      expect(hasPermission).not.toHaveBeenCalled();
    }
  });
});

describe('mcpToolsAsAgentTools', () => {
  const ctx = { memberUid: 'member-1' } as any;

  it('runs the MCP tool as the member and adds NewsLink lines for sourceRefs', async () => {
    const execute = jest.fn().mockResolvedValue({ items: [{ uid: 'news-1', title: 'Story' }] });
    const tools = mcpToolsAsAgentTools([{ name: 'list_news', description: 'd', visibility: 'always', execute }], ctx);
    const result = await (tools.list_news as any).execute({ search: 'x' });
    expect(execute).toHaveBeenCalledWith(ctx, { search: 'x' });
    expect(result).toContain('Title: Story [NewsLink](/home?news=news-1)');
    expect(result).toContain('"uid":"news-1"');
  });

  it('returns a failure as text so the answer stream goes on', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('News item not found: x'));
    const tools = mcpToolsAsAgentTools(
      [{ name: 'get_news_item', description: 'd', visibility: 'always', execute }],
      ctx
    );
    await expect((tools.get_news_item as any).execute({ uid: 'x' })).resolves.toContain('News item not found: x');
  });

  it('LAB-3362 D1: rewrites only the old Home news path of news refs', () => {
    const refs = [
      { index: 1, title: 'A', type: 'news' as const, directoryLink: '/home?news=a%20b' },
      { index: 2, title: 'B', type: 'news' as const, directoryLink: '/home/?news=b' },
      { index: 3, title: 'C', type: 'news' as const, directoryLink: '/?news=c' },
      { index: 4, title: 'D', type: 'news' as const, externalUrl: 'https://example.com/d' },
      { index: 5, title: 'E', type: 'forum' as const, directoryLink: '/home?news=e' },
    ];
    expect(withNewsStoryLinks(refs).map((ref) => ref.directoryLink)).toEqual([
      '/?news=a%20b',
      '/?news=b',
      '/?news=c',
      undefined,
      '/home?news=e',
    ]);
    expect(withNewsStoryLinks(refs)[3]).toEqual(refs[3]);
    expect(newsLinkFields({ toolNames: [], sources: [], sourceRefs: [] })).toEqual({});
  });

  it('builds one NewsLink line for a single story', () => {
    // LAB-3362 D1 review: the marker keeps the Home path of the news tool JSON `url`.
    expect(newsLinkLines({ uid: 'a b', title: 'T' })).toBe('Title: T [NewsLink](/home?news=a%20b)');
    expect(newsLinkLines({ feed: 'latest', items: [] })).toBe('');
  });

  it('LAB-3362 D1: folds a /home?news= URL in sources or in a citation into the one news ref', () => {
    const row = { uid: 'news-1', title: 'Story', url: 'https://lab-3272.os.pl.xyz/home?news=news-1' };
    const toolResults = `${newsLinkLines(row)}\n\n${JSON.stringify(row)}`;
    const content = 'Team X shipped v2 [1](https://lab-3272.os.pl.xyz/home?news=news-1).';
    const llmSources = [
      'https://lab-3272.os.pl.xyz/home?news=news-1',
      '/home?news=news-1',
      'https://www.example.com/a',
    ];

    const { sourceRefs } = buildSourceRefs({ content, toolResults, llmSources });
    const fields = newsLinkFields({ toolNames: ['list_news'], sources: llmSources, sourceRefs });

    expect(fields.sourceRefs).toEqual([
      { index: 1, title: 'Story', type: 'news', directoryLink: '/?news=news-1' },
      { index: 2, title: 'https://www.example.com/a', type: 'external', externalUrl: 'https://www.example.com/a' },
    ]);
    expect(fields.sourceRefs?.filter((ref) => ref.externalUrl?.includes('news='))).toEqual([]);
  });
});
