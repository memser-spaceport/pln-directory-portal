// `ai` pulls in untranspiled ESM this jest config can't parse; `tool()` just needs to hand
// back its config object so `getTool()` yields something with a callable `execute`.
jest.mock('ai', () => ({ tool: (config: any) => config }));

import { NewsTool, DEFAULT_NEWS_WINDOW_DAYS, NEWS_PRESENTATION_HINT } from './news.tool';

describe('NewsTool', () => {
  const logger = { error: jest.fn(), info: jest.fn() };
  const prisma = {} as any;
  const auth = { isLoggedIn: true, memberUid: 'member-1' };

  function item(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      uid: 'news-1',
      teamName: 'bio.xyz',
      teamUid: 'team-bio',
      title: 'Bio Protocol CEO on DeSci funding',
      eventType: 'FUNDING',
      eventDate: '2026-09-16T00:00:00.000Z',
      summary: 'A podcast conversation on on-chain biotech funding.',
      focusAreas: ['DeSci'],
      sourceUrl: 'https://example.com/podcast',
      ...overrides,
    };
  }

  function setup(items: unknown[]) {
    const listTeamNews = jest.fn().mockResolvedValue({ items });
    const tool = new NewsTool(logger as any, prisma, { listTeamNews } as any);
    return { tool, listTeamNews };
  }

  function execute(tool: NewsTool, args: Record<string, unknown>) {
    const coreTool = tool.getTool(auth);
    if (!coreTool.execute) {
      throw new Error('tool has no execute');
    }
    return coreTool.execute(args, { toolCallId: 'call-1', messages: [] });
  }

  beforeEach(() => jest.clearAllMocks());

  it('looks back a quarter by default and passes the caller through for personalisation', async () => {
    const { tool, listTeamNews } = setup([item()]);

    await execute(tool, { search: 'bio.xyz' });

    expect(listTeamNews.mock.calls[0][0]).toMatchObject({ q: 'bio.xyz', windowDays: DEFAULT_NEWS_WINDOW_DAYS });
    expect(listTeamNews.mock.calls[0][2]).toBe('member-1');
  });

  it('keeps an explicit window from the model', async () => {
    const { tool, listTeamNews } = setup([item()]);

    await execute(tool, { search: 'bio.xyz', windowDays: 365 });

    expect(listTeamNews.mock.calls[0][0].windowDays).toBe(365);
  });

  it('leads with the presentation hint and gives each item a plain date, team link and source', async () => {
    const { tool } = setup([item()]);

    const result = (await execute(tool, { search: 'bio.xyz' })) as string;

    expect(result.startsWith(NEWS_PRESENTATION_HINT)).toBe(true);
    expect(result).toContain('Date: 2026-09-16');
    expect(result).not.toContain('2026-09-16T00:00:00.000Z');
    expect(result).toContain('[TeamLink](/teams/team-bio)');
    expect(result).toContain('[NewsLink](/home?news=news-1)');
    expect(result).toContain('Source: https://example.com/podcast');
  });

  it('falls back to the longest word of a multi-word search before giving up', async () => {
    const { tool, listTeamNews } = setup([]);

    const result = await execute(tool, { search: 'Prime Intellect AI' });

    expect(result).toBe('No network news found matching the search criteria.');
    expect(listTeamNews).toHaveBeenCalledTimes(2);
    expect(listTeamNews.mock.calls[1][0].q).toBe('Intellect');
  });
});
