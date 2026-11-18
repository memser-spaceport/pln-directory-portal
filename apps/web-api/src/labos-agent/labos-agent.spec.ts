// The guard and the AI search service pull in ESM packages (axios, @ai-sdk/*) that this jest
// config cannot parse. The guard itself is not under test: it owns 401, and is only checked here.
jest.mock('../guards/user-token-validation.guard', () => ({ UserTokenValidation: class UserTokenValidation {} }));
jest.mock('../husky/husky-ai.service', () => ({ HuskyAiService: jest.fn() }));
jest.mock('../team-news/team-news-query.service', () => ({ TeamNewsQueryService: jest.fn() }));
jest.mock('../team-news/team-news-suggestions.service', () => ({ TeamNewsSuggestionsService: jest.fn() }));
jest.mock('../mcp/mcp-tool-catalog', () => ({ McpToolCatalog: jest.fn() }));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({ AccessControlV2Service: jest.fn() }));
jest.mock('../intro-requests/intro-requests.service', () => ({ IntroRequestsService: jest.fn() }));
jest.mock('ai', () => ({ tool: (def: unknown) => def }));

import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { APP_ENV } from '../utils/constants';
import { LabosAgentAccessService } from './labos-agent-access.service';
import { LabosAgentController } from './labos-agent.controller';
import { LabosAgentService } from './labos-agent.service';
import { mcpToolsAsAgentTools, newsLinkLines } from './labos-agent-news.tools';

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

function setup(env = APP_ENV.DEV as string) {
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
    new LabosAgentAccessService(),
    husky as any,
    query as any,
    catalog as any,
    accessControl as any,
    {} as any,
    scopes as any,
    { findTargetName: jest.fn(), findEligibleRequester: jest.fn() } as any
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

  it('returns 403 AGENT_NOT_ENABLED on production', async () => {
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

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(res.setHeader).toHaveBeenCalledWith('Transfer-Encoding', 'chunked');
    expect(res.flushHeaders).toHaveBeenCalled();
    expect(stream.pipeTo).toHaveBeenCalled();
  });

  it('passes a Home context and no context through without a news lookup', async () => {
    const { controller, query, husky, res, req } = setup();
    await controller.chat({ ...VALID, context: { page: 'home' } }, req, res as any);
    await controller.chat(VALID, req, res as any);
    expect(query.getTeamNewsItemDto).not.toHaveBeenCalled();
    expect(husky.createContextualToolsResponse.mock.calls[0][3].promptContext).toContain('Home');
    expect(husky.createContextualToolsResponse.mock.calls[1][3].promptContext).toBeUndefined();
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
});

describe('LabosAgentAccessService.isEnabled', () => {
  it('is on for a live member outside production, off on production and without a member', () => {
    const access = new LabosAgentAccessService();
    process.env.ENVIRONMENT = APP_ENV.DEV;
    expect(access.isEnabled('member-1')).toBe(true);
    expect(access.isEnabled(undefined)).toBe(false);
    process.env.ENVIRONMENT = APP_ENV.PRODUCTION;
    expect(access.isEnabled('member-1')).toBe(false);
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

  it('builds one NewsLink line for a single story', () => {
    expect(newsLinkLines({ uid: 'a b', title: 'T' })).toBe('Title: T [NewsLink](/home?news=a%20b)');
    expect(newsLinkLines({ feed: 'latest', items: [] })).toBe('');
  });
});
