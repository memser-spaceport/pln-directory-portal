jest.mock('../team-news/team-news.service', () => ({ TeamNewsService: jest.fn() }));
jest.mock('../team-news/team-news-query.service', () => ({ TeamNewsQueryService: jest.fn() }));
jest.mock('../members/members.service', () => ({ MembersService: jest.fn() }));
jest.mock('../members/members.hooks.service', () => ({ MembersHooksService: jest.fn() }));

import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { McpActorContext, McpToolDef, toolInputSchema } from './mcp-tools';
import { newsWriteTools, profileTools } from './mcp-write-tools';
import { McpWriteLimitService, MCP_WRITE_LIMIT_PER_HOUR } from './mcp-write-limit.service';

const CTX: McpActorContext = {
  memberUid: 'member-1',
  name: 'Ada',
  email: 'ada@example.com',
  permissions: new Set(),
  authorizationUid: 'auth-1',
  clientName: 'Codex',
  agentAccess: 'read',
};

const MEMBER = {
  uid: 'member-1',
  name: 'Ada',
  email: 'ada@example.com',
  bio: 'Builder',
  moreDetails: null,
  githubHandler: 'ada',
  telegramHandler: null,
  linkedinHandler: null,
  twitterHandler: null,
  discordHandler: null,
  officeHours: null,
  openToWork: false,
  jobSearchStatus: null,
  skills: [{ uid: 's1', title: 'Rust' }],
  teamMemberRoles: [{ teamUid: 'team-1' }],
};

function tool(tools: McpToolDef[], name: string): McpToolDef {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

describe('post_team_news', () => {
  function build() {
    const news = { createTeamPostedNews: jest.fn().mockResolvedValue({ uid: 'n1' }) };
    const newsQuery = {
      getTeamNewsItemDto: jest.fn().mockResolvedValue({
        uid: 'n1',
        title: 'We launched',
        summary: null,
        eventType: 'LAUNCH',
        eventDate: '2026-10-28',
        teamUid: 'team-1',
        teamName: 'Team One',
      }),
    };
    const members = { findMemberByUid: jest.fn().mockResolvedValue(MEMBER) };
    return { post: tool(newsWriteTools(news as any, newsQuery as any, members as any), 'post_team_news'), news };
  }

  it("posts as the member, with the member's team roles and admin flag", async () => {
    const { post, news } = build();
    const result: any = await post.execute(
      { ...CTX, permissions: new Set(['directory.admin.full']) },
      { teamUid: 'team-1', title: ' We launched ', url: 'https://example.com/launch', body: '<p>Hi</p>' }
    );
    expect(news.createTeamPostedNews).toHaveBeenCalledWith(
      'team-1',
      { title: 'We launched', url: 'https://example.com/launch', body: '<p>Hi</p>' },
      { uid: 'member-1', isDirectoryAdmin: true, teamMemberRoles: [{ teamUid: 'team-1' }] }
    );
    expect(result.posted).toMatchObject({ uid: 'n1', teamName: 'Team One' });
  });

  it.each([
    ['no team', { title: 'x', url: 'https://e.com' }],
    ['no title', { teamUid: 'team-1', url: 'https://e.com' }],
    ['title over 150', { teamUid: 'team-1', title: 'x'.repeat(151), url: 'https://e.com' }],
    ['no url', { teamUid: 'team-1', title: 'x' }],
  ])('rejects %s before calling the service', async (_label, args) => {
    const { post, news } = build();
    await expect(post.execute(CTX, args)).rejects.toBeInstanceOf(BadRequestException);
    expect(news.createTeamPostedNews).not.toHaveBeenCalled();
  });
});

describe('profile tools', () => {
  function build(
    skills = [
      { uid: 's1', title: 'Rust' },
      { uid: 's2', title: 'Go' },
    ]
  ) {
    const members = {
      findMemberByUid: jest.fn().mockResolvedValue(MEMBER),
      updateMemberByUid: jest.fn().mockResolvedValue(MEMBER),
    };
    const hooks = { postUpdateActions: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      skill: {
        findMany: jest.fn(async ({ where }) =>
          skills.filter((s) => where.OR.some((c: any) => c.title.equals.toLowerCase() === s.title.toLowerCase()))
        ),
      },
    };
    const tools = profileTools(members as any, hooks as any, prisma as any);
    return { tools, members, hooks };
  }

  it('reads only the editable fields', async () => {
    const { tools } = build();
    const profile: any = await tool(tools, 'get_my_profile').execute(CTX, {});
    expect(profile).toMatchObject({ uid: 'member-1', bio: 'Builder', githubHandler: 'ada', skills: ['Rust'] });
    expect(profile).not.toHaveProperty('email');
    expect(profile).not.toHaveProperty('teamMemberRoles');
  });

  it('updates allowed fields, clears empty text, maps job search status and skills, and runs the hooks', async () => {
    const { tools, members, hooks } = build();
    const result: any = await tool(tools, 'update_my_profile').execute(CTX, {
      bio: ' New bio ',
      twitterHandler: '',
      openToWork: true,
      jobSearchStatus: 'actively-looking',
      skills: ['rust', 'Go'],
    });
    expect(members.updateMemberByUid).toHaveBeenCalledWith('member-1', {
      bio: 'New bio',
      twitterHandler: null,
      openToWork: true,
      jobSearchStatus: 'ACTIVELY_LOOKING',
      skills: { set: [{ uid: 's1' }, { uid: 's2' }] },
    });
    expect(hooks.postUpdateActions).toHaveBeenCalledWith(MEMBER, 'ada@example.com');
    expect(result.updated).toEqual(['bio', 'twitterHandler', 'openToWork', 'jobSearchStatus', 'skills']);
  });

  it.each([
    ['a field outside the allowlist', { email: 'evil@example.com' }],
    ['an allowed field mixed with a blocked one', { bio: 'ok', email: 'evil@example.com' }],
    ['an admin field', { isDirectoryAdmin: true }],
    ['an unknown skill', { skills: ['Rust', 'Telepathy'] }],
    ['a bad job search status', { jobSearchStatus: 'sometimes' }],
    ['nothing', {}],
  ])('rejects %s and changes nothing', async (_label, args) => {
    const { tools, members, hooks } = build();
    await expect(tool(tools, 'update_my_profile').execute(CTX, args)).rejects.toBeInstanceOf(BadRequestException);
    expect(members.updateMemberByUid).not.toHaveBeenCalled();
    expect(hooks.postUpdateActions).not.toHaveBeenCalled();
  });

  // The SDK validates arguments with the tool's schema before `execute` and keeps only what the schema returns. A raw
  // shape strips unknown keys, so `email` never reached the allowlist check and `{ bio, email }` saved the bio.
  it('still refuses a blocked field after the SDK has parsed the arguments', async () => {
    const { tools, members } = build();
    const update = tool(tools, 'update_my_profile');
    const sdkParse = (args: Record<string, unknown>) => (toolInputSchema(update) as z.ZodTypeAny).parse(args);

    expect(z.object(update.inputSchema!).parse({ bio: 'ok', email: 'evil@example.com' })).toEqual({ bio: 'ok' });
    const parsed = sdkParse({ bio: 'ok', email: 'evil@example.com' });
    expect(parsed).toEqual({ bio: 'ok', email: 'evil@example.com' });
    await expect(update.execute(CTX, parsed)).rejects.toThrow("These fields can't be changed by an agent: email");
    expect(members.updateMemberByUid).not.toHaveBeenCalled();
  });
});

describe('McpWriteLimitService', () => {
  function cache() {
    const store = new Map<string, unknown>();
    return {
      store,
      get: jest.fn(async (k: string) => store.get(k)),
      set: jest.fn(async (k: string, v: unknown) => void store.set(k, v)),
    };
  }

  it(`allows ${MCP_WRITE_LIMIT_PER_HOUR} calls per member per tool per hour, then refuses`, async () => {
    const c = cache();
    const limit = new McpWriteLimitService(c as any);
    const now = Date.UTC(2026, 9, 28, 10, 15);
    for (let i = 0; i < MCP_WRITE_LIMIT_PER_HOUR; i++) {
      expect(await limit.tryConsume('m1', 'post_team_news', now)).toBe(true);
    }
    expect(await limit.tryConsume('m1', 'post_team_news', now)).toBe(false);
    // Another tool, another member and the next hour each have their own allowance.
    expect(await limit.tryConsume('m1', 'update_my_profile', now)).toBe(true);
    expect(await limit.tryConsume('m2', 'post_team_news', now)).toBe(true);
    expect(await limit.tryConsume('m1', 'post_team_news', now + 60 * 60 * 1000)).toBe(true);
  });

  it('fails open when the cache is down', async () => {
    const limit = new McpWriteLimitService({ get: jest.fn().mockRejectedValue(new Error('redis down')) } as any);
    await expect(limit.tryConsume('m1', 'post_team_news')).resolves.toBe(true);
  });
});
