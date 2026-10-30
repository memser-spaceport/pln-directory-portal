jest.mock('../team-news/team-news-query.service', () => ({ TeamNewsQueryService: jest.fn() }));
jest.mock('../team-news/team-news-suggestions.service', () => ({ TeamNewsSuggestionsService: jest.fn() }));

import { NotFoundException } from '@nestjs/common';
import { newsTools } from './mcp-news-tools';
import { McpActorContext, McpToolDef } from './mcp-tools';

const CTX: McpActorContext = {
  memberUid: 'member-1',
  name: 'Ada',
  email: null,
  permissions: new Set(),
  authorizationUid: 'auth-1',
  clientName: 'Codex',
  agentAccess: 'read',
};

function item(uid: string, teamUid: string, eventDate: string) {
  return {
    uid,
    teamUid,
    teamName: `Team ${teamUid}`,
    teamLogoUrl: null,
    eventType: 'LAUNCH',
    eventDate,
    title: `Story ${uid}`,
    summary: `Summary ${uid}`,
    contentHtml: null,
    sourceUrl: `https://example.com/${uid}`,
    sourceDomain: 'example.com',
    tags: ['ai'],
    focusAreas: ['AI & Robotics'],
    subFocusAreas: [],
    createdAt: eventDate,
    isFollowed: false,
    upvoteCount: 3,
    viewerHasUpvoted: true,
  };
}

/** A tool by name; fails the test if it is missing. */
function tool(tools: Map<string, McpToolDef>, name: string): McpToolDef {
  const found = tools.get(name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

function build(opts: { forYou?: string[]; items?: any[]; total?: number } = {}) {
  const items = opts.items ?? [
    item('n1', 't1', '2026-10-27'),
    item('n2', 't2', '2026-10-26'),
    item('n3', 't1', '2026-10-25'),
  ];
  const query = {
    listTeamNews: jest.fn().mockResolvedValue({ page: 1, limit: 10, total: opts.total ?? items.length, items }),
    listTeamNewsByTeam: jest.fn().mockResolvedValue({
      teamUid: 't9',
      teamName: 'Team 9',
      page: 1,
      limit: 10,
      total: 1,
      items: [item('n9', 't9', '2026-10-20')],
    }),
    getTeamNewsItemDto: jest.fn(async (uid: string) => items.find((i) => i.uid === uid) ?? null),
  };
  const suggestions = { getForYouTeamUids: jest.fn().mockResolvedValue(opts.forYou ?? []) };
  const tools = new Map<string, McpToolDef>(newsTools(query as any, suggestions as any).map((t) => [t.name, t]));
  return { tools, query, suggestions };
}

describe('MCP news tools', () => {
  const originalWeb = process.env.WEB_UI_BASE_URL;
  beforeAll(() => {
    process.env.WEB_UI_BASE_URL = 'https://labos.example/';
  });
  afterAll(() => {
    process.env.WEB_UI_BASE_URL = originalWeb;
  });

  it('lists Latest with compact rows, the viewer, search and paging', async () => {
    const { tools, query } = build({ total: 25 });
    const result: any = await tool(tools, 'list_news').execute(CTX, { search: ' rust ', page: 2, limit: 10 });

    expect(query.listTeamNews).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'rust', page: 2, limit: 10, windowDays: 14 }),
      new Set(),
      'member-1'
    );
    expect(result).toMatchObject({ feed: 'latest', page: 2, hasMore: true });
    expect(result.items[0]).toEqual({
      uid: 'n1',
      title: 'Story n1',
      summary: 'Summary n1',
      eventType: 'LAUNCH',
      eventDate: '2026-10-27',
      teamUid: 't1',
      teamName: 'Team t1',
      url: 'https://labos.example/home?news=n1',
    });
    expect(result.items[0]).not.toHaveProperty('viewerHasUpvoted');
  });

  it('caps the limit at 25 and defaults to 10', async () => {
    const { tools, query } = build();
    await tool(tools, 'list_news').execute(CTX, { limit: 500 });
    await tool(tools, 'list_news').execute(CTX, {});
    expect(query.listTeamNews.mock.calls[0][0]).toMatchObject({ limit: 25 });
    expect(query.listTeamNews.mock.calls[1][0]).toMatchObject({ limit: 10, page: 1 });
  });

  it("returns For You: the latest story per the member's For You team", async () => {
    const { tools, suggestions } = build({ forYou: ['t1'] });
    const result: any = await tool(tools, 'list_news').execute(CTX, { feed: 'for_you' });
    expect(suggestions.getForYouTeamUids).toHaveBeenCalledWith('member-1');
    expect(result.feed).toBe('for_you');
    expect(result.items.map((i: any) => i.uid)).toEqual(['n1']);
  });

  it.each([
    ['no For You teams', []],
    ['For You teams with no recent news', ['t-quiet']],
  ])('falls back to Latest and says so when there are %s', async (_label, forYou) => {
    const { tools } = build({ forYou });
    const result: any = await tool(tools, 'list_news').execute(CTX, { feed: 'for_you' });
    expect(result.feed).toBe('latest');
    expect(result.items.map((i: any) => i.uid)).toEqual(['n1', 'n2', 'n3']);
  });

  it("lists one team's news with teamUid", async () => {
    const { tools, query } = build();
    const result: any = await tool(tools, 'list_news').execute(CTX, { teamUid: 't9', feed: 'for_you' });
    expect(query.listTeamNewsByTeam).toHaveBeenCalledWith(
      't9',
      expect.objectContaining({ page: 1, limit: 10 }),
      new Set(),
      'member-1'
    );
    expect(query.listTeamNews).not.toHaveBeenCalled();
    expect(result).toMatchObject({ teamUid: 't9', teamName: 'Team 9', items: [{ uid: 'n9' }] });
  });

  it('gets one story with its source, and 404s an unknown uid', async () => {
    const { tools } = build();
    await expect(tool(tools, 'get_news_item').execute(CTX, { uid: 'n2' })).resolves.toMatchObject({
      uid: 'n2',
      sourceUrl: 'https://example.com/n2',
      focusAreas: ['AI & Robotics'],
    });
    await expect(tool(tools, 'get_news_item').execute(CTX, { uid: 'nope' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(tool(tools, 'get_news_item').execute(CTX, {})).rejects.toBeInstanceOf(NotFoundException);
  });
});
