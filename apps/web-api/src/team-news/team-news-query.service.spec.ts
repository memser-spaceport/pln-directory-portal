import { NotFoundException } from '@nestjs/common';
import { TeamNewsQueryService } from './team-news-query.service';
import { PrismaService } from '../shared/prisma.service';
// Imported rather than restated: the assertion's job is "the exclusion is
// applied", not "the list currently holds these four names". Restating them
// would turn every editorial change to the list into a failing unit test.
import { TEAM_NEWS_EXCLUDED_TEAM_NAMES } from './team-news-public-list.config';

describe('TeamNewsQueryService.listTeamNewsByTeam', () => {
  let service: TeamNewsQueryService;

  const teamFindUnique = jest.fn();
  const teamNewsItemFindMany = jest.fn();
  const teamNewsItemCount = jest.fn();
  const teamNewsForumLinkFindMany = jest.fn();
  const teamNewsUpvoteGroupBy = jest.fn();
  const teamNewsUpvoteFindMany = jest.fn();

  const prismaMock = {
    team: { findUnique: teamFindUnique },
    teamNewsItem: { findMany: teamNewsItemFindMany, count: teamNewsItemCount },
    teamNewsForumLink: { findMany: teamNewsForumLinkFindMany },
    teamNewsUpvote: { groupBy: teamNewsUpvoteGroupBy, findMany: teamNewsUpvoteFindMany },
  } as unknown as PrismaService;

  const makeRow = (overrides: Record<string, unknown> = {}) => ({
    uid: 'news-1',
    teamUid: 'team-1',
    eventType: 'FUNDING',
    eventDate: new Date('2026-06-01T00:00:00.000Z'),
    title: 'Raised Series A',
    summary: 'Funding round closed',
    contentHtml: null,
    sourceUrl: 'https://example.com/news',
    sourceUrls: ['https://example.com/news'],
    sourceDomain: 'example.com',
    tags: ['funding'],
    editorialRank: null,
    viewCount: 0,
    createdAt: new Date('2026-06-02T00:00:00.000Z'),
    team: {
      uid: 'team-1',
      name: 'Acme Labs',
      logo: { url: 'https://example.com/logo.png' },
      teamFocusAreas: [
        {
          focusArea: { title: 'Neurotech', parentUid: 'fa-parent' },
          ancestorArea: { title: 'Neurotech' },
        },
      ],
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    teamFindUnique.mockResolvedValue({ uid: 'team-1', name: 'Acme Labs' });
    teamNewsItemFindMany.mockResolvedValue([makeRow()]);
    teamNewsItemCount.mockResolvedValue(1);
    teamNewsForumLinkFindMany.mockResolvedValue([]);
    teamNewsUpvoteGroupBy.mockResolvedValue([]);
    teamNewsUpvoteFindMany.mockResolvedValue([]);
    service = new TeamNewsQueryService(prismaMock);
  });

  it('throws NotFound when the team does not exist', async () => {
    teamFindUnique.mockResolvedValue(null);

    await expect(service.listTeamNewsByTeam('missing-team', { page: 1, limit: 50 })).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(teamNewsItemFindMany).not.toHaveBeenCalled();
  });

  it('returns paginated news ordered newest first for the team', async () => {
    const result = await service.listTeamNewsByTeam('team-1', { page: 2, limit: 10 });

    expect(result).toEqual({
      teamUid: 'team-1',
      teamName: 'Acme Labs',
      page: 2,
      limit: 10,
      total: 1,
      items: [
        expect.objectContaining({
          uid: 'news-1',
          teamUid: 'team-1',
          teamName: 'Acme Labs',
          title: 'Raised Series A',
          discussion: { count: 0, latestTopicUrl: null },
          upvoteCount: 0,
          viewerHasUpvoted: false,
        }),
      ],
    });

    expect(teamNewsItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ teamUid: 'team-1' }] },
        orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
        skip: 10,
        take: 10,
      })
    );
  });

  it('stamps upvoteCount and viewerHasUpvoted when the viewer has voted', async () => {
    teamNewsUpvoteGroupBy.mockResolvedValue([{ newsItemUid: 'news-1', _count: { _all: 3 } }]);
    teamNewsUpvoteFindMany.mockResolvedValue([{ newsItemUid: 'news-1' }]);

    const result = await service.listTeamNewsByTeam('team-1', { page: 1, limit: 50 }, new Set(), 'member-1');

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        upvoteCount: 3,
        viewerHasUpvoted: true,
      })
    );
    expect(teamNewsUpvoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { newsItemUid: { in: ['news-1'] }, memberUid: 'member-1' },
      })
    );
  });

  it('applies search across title, summary, and source domain', async () => {
    await service.listTeamNewsByTeam('team-1', { page: 1, limit: 50, q: 'series' });

    expect(teamNewsItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { teamUid: 'team-1' },
            {
              OR: [
                { title: { contains: 'series', mode: 'insensitive' } },
                { summary: { contains: 'series', mode: 'insensitive' } },
                { sourceDomain: { contains: 'series', mode: 'insensitive' } },
              ],
            },
          ],
        },
      })
    );
  });
});

describe('TeamNewsQueryService — viewCount', () => {
  let service: TeamNewsQueryService;

  const teamFindUnique = jest.fn();
  const teamNewsItemFindMany = jest.fn();
  const teamNewsItemCount = jest.fn();
  const teamNewsForumLinkFindMany = jest.fn();
  const teamNewsUpvoteGroupBy = jest.fn();
  const teamNewsUpvoteFindMany = jest.fn();

  // viewCount is a plain scalar column on TeamNewsItem, so it's already present
  // on the row returned by the primary (include-based) query — no separate
  // batched loader/query needed, unlike discussions/upvotes which live in
  // other tables.
  const makeRow = (overrides: Record<string, unknown> = {}) => ({
    uid: 'news-1',
    teamUid: 'team-1',
    eventType: 'FUNDING',
    eventDate: new Date('2026-06-01T00:00:00.000Z'),
    title: 'Raised Series A',
    summary: 'Funding round closed',
    contentHtml: null,
    sourceUrl: 'https://example.com/news',
    sourceUrls: ['https://example.com/news'],
    sourceDomain: 'example.com',
    tags: ['funding'],
    editorialRank: null,
    viewCount: 0,
    createdAt: new Date('2026-06-02T00:00:00.000Z'),
    team: {
      uid: 'team-1',
      name: 'Acme Labs',
      logo: null,
      teamFocusAreas: [],
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    teamFindUnique.mockResolvedValue({ uid: 'team-1', name: 'Acme Labs' });
    teamNewsItemCount.mockResolvedValue(1);
    teamNewsForumLinkFindMany.mockResolvedValue([]);
    teamNewsUpvoteGroupBy.mockResolvedValue([]);
    teamNewsUpvoteFindMany.mockResolvedValue([]);
    teamNewsItemFindMany.mockResolvedValue([makeRow()]);

    service = new TeamNewsQueryService({
      team: { findUnique: teamFindUnique },
      teamNewsItem: { findMany: teamNewsItemFindMany, count: teamNewsItemCount },
      teamNewsForumLink: { findMany: teamNewsForumLinkFindMany },
      teamNewsUpvote: { groupBy: teamNewsUpvoteGroupBy, findMany: teamNewsUpvoteFindMany },
    } as unknown as PrismaService);
  });

  it('stamps viewCount straight off the row onto the DTO, with a single teamNewsItem.findMany call', async () => {
    teamNewsItemFindMany.mockResolvedValue([makeRow({ viewCount: 42 })]);

    const result = await service.listTeamNewsByTeam('team-1', { page: 1, limit: 50 });

    expect(result.items[0]).toEqual(expect.objectContaining({ uid: 'news-1', viewCount: 42 }));
    expect(teamNewsItemFindMany).toHaveBeenCalledTimes(1);
  });

  it('defaults viewCount to 0 for an item with no impressions yet', async () => {
    const result = await service.listTeamNewsByTeam('team-1', { page: 1, limit: 50 });

    expect(result.items[0]).toEqual(expect.objectContaining({ uid: 'news-1', viewCount: 0 }));
  });
});

describe('TeamNewsQueryService.getPopular', () => {
  let service: TeamNewsQueryService;
  const teamNewsItemFindMany = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TeamNewsQueryService({
      teamNewsItem: { findMany: teamNewsItemFindMany },
    } as unknown as PrismaService);
  });

  it('returns only items with at least 2 upvotes, sorted by count then eventDate', async () => {
    const now = Date.now();
    teamNewsItemFindMany.mockResolvedValue([
      {
        uid: 'n1',
        title: 'One upvote',
        teamUid: 't1',
        sourceUrl: 'https://a',
        eventDate: new Date(now - 1 * 24 * 60 * 60 * 1000),
        team: { name: 'A' },
        _count: { upvotes: 1 },
      },
      {
        uid: 'n2',
        title: 'Three upvotes older',
        teamUid: 't2',
        sourceUrl: 'https://b',
        eventDate: new Date(now - 3 * 24 * 60 * 60 * 1000),
        team: { name: 'B' },
        _count: { upvotes: 3 },
      },
      {
        uid: 'n3',
        title: 'Three upvotes newer',
        teamUid: 't3',
        sourceUrl: 'https://c',
        eventDate: new Date(now - 1 * 24 * 60 * 60 * 1000),
        team: { name: 'C' },
        _count: { upvotes: 3 },
      },
      {
        uid: 'n4',
        title: 'Two upvotes',
        teamUid: 't4',
        sourceUrl: 'https://d',
        eventDate: new Date(now - 2 * 24 * 60 * 60 * 1000),
        team: { name: 'D' },
        _count: { upvotes: 2 },
      },
    ]);

    const result = await service.getPopular({ limit: 3 });

    expect(result.items.map((i) => i.uid)).toEqual(['n3', 'n2', 'n4']);
    expect(result.items[0].upvoteCount).toBe(3);
    expect(teamNewsItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventDate: { gte: expect.any(Date) },
        }),
      })
    );
  });

  it('returns an empty list when nothing qualifies', async () => {
    teamNewsItemFindMany.mockResolvedValue([
      {
        uid: 'n1',
        title: 'Low',
        teamUid: 't1',
        sourceUrl: 'https://a',
        eventDate: new Date(),
        team: { name: 'A' },
        _count: { upvotes: 1 },
      },
    ]);

    await expect(service.getPopular({ limit: 3 })).resolves.toEqual({ items: [] });
  });
});

describe('TeamNewsQueryService.getLatestCreatedAt', () => {
  let service: TeamNewsQueryService;

  const teamNewsItemAggregate = jest.fn();

  const prismaMock = {
    teamNewsItem: { aggregate: teamNewsItemAggregate },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TeamNewsQueryService(prismaMock);
  });

  it('returns the newest ingestion time as an ISO string', async () => {
    teamNewsItemAggregate.mockResolvedValue({ _max: { createdAt: new Date('2026-08-14T09:12:44.000Z') } });

    await expect(service.getLatestCreatedAt()).resolves.toEqual({ latestAt: '2026-08-14T09:12:44.000Z' });
  });

  it('returns null when there is no visible news at all', async () => {
    teamNewsItemAggregate.mockResolvedValue({ _max: { createdAt: null } });

    // The client must read this as "nothing new", never "everything is new".
    await expect(service.getLatestCreatedAt()).resolves.toEqual({ latestAt: null });
  });

  it('excludes the same teams the public feed hides', async () => {
    teamNewsItemAggregate.mockResolvedValue({ _max: { createdAt: new Date('2026-08-14T00:00:00.000Z') } });

    await service.getLatestCreatedAt();

    // Without this the dot lights for news /home never lists, and the member
    // clicks through to find nothing new.
    expect(teamNewsItemAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        _max: { createdAt: true },
        where: expect.objectContaining({
          NOT: {
            OR: expect.arrayContaining([
              { team: { name: { equals: 'Nvidia', mode: 'insensitive' } } },
              { team: { name: { equals: 'Anthropic', mode: 'insensitive' } } },
            ]),
          },
        }),
      })
    );
  });

  it('does not apply the feed window — recency is not the same question as what the feed lists', async () => {
    teamNewsItemAggregate.mockResolvedValue({ _max: { createdAt: new Date('2026-08-14T00:00:00.000Z') } });

    await service.getLatestCreatedAt();

    const where = teamNewsItemAggregate.mock.calls[0][0].where;
    expect(where.eventDate).toBeUndefined();
    expect(where.createdAt).toBeUndefined();
  });
});

describe('TeamNewsQueryService.listGroupedByFocusArea', () => {
  let service: TeamNewsQueryService;

  const teamNewsItemFindMany = jest.fn();
  const focusAreaFindMany = jest.fn();
  const teamNewsForumLinkFindMany = jest.fn();
  const teamNewsUpvoteGroupBy = jest.fn();
  const teamNewsUpvoteFindMany = jest.fn();

  const query = { focus: [], eventType: [], windowDays: 14, page: 1, limit: 50 };

  const makeRow = (overrides: Record<string, unknown> = {}) => ({
    uid: 'news-1',
    teamUid: 'team-1',
    eventType: 'FUNDING',
    eventDate: new Date('2026-08-15T00:00:00.000Z'),
    title: 'Raised Series A',
    summary: 'Funding round closed',
    contentHtml: null,
    sourceUrl: 'https://example.com/news',
    sourceUrls: ['https://example.com/news'],
    sourceDomain: 'example.com',
    tags: ['funding'],
    editorialRank: null,
    viewCount: 0,
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    team: {
      uid: 'team-1',
      name: 'Acme Labs',
      logo: { url: 'https://example.com/logo.png' },
      teamFocusAreas: [] as Array<{
        focusArea: { title: string; parentUid: string | null };
        ancestorArea: { title: string };
      }>,
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    focusAreaFindMany.mockResolvedValue([{ uid: 'fa-ai', title: 'AI & Robotics' }]);
    teamNewsForumLinkFindMany.mockResolvedValue([]);
    teamNewsUpvoteGroupBy.mockResolvedValue([]);
    teamNewsUpvoteFindMany.mockResolvedValue([]);
    service = new TeamNewsQueryService({
      teamNewsItem: { findMany: teamNewsItemFindMany },
      focusArea: { findMany: focusAreaFindMany },
      teamNewsForumLink: { findMany: teamNewsForumLinkFindMany },
      teamNewsUpvote: { groupBy: teamNewsUpvoteGroupBy, findMany: teamNewsUpvoteFindMany },
    } as unknown as PrismaService);
  });

  it('puts an untagged editorial pick on All via allTabExtraItems', async () => {
    teamNewsItemFindMany.mockResolvedValue([
      makeRow({
        uid: 'editorial-untagged',
        teamUid: 'prime-intellect',
        editorialRank: 3,
        title: 'Open autonomous AI research',
        team: {
          uid: 'prime-intellect',
          name: 'Prime Intellect AI',
          logo: null,
          teamFocusAreas: [],
        },
      }),
    ]);

    const result = await service.listGroupedByFocusArea(query);

    expect(result.groups).toEqual([]);
    expect(result.allTabExtraItems).toEqual([expect.objectContaining({ uid: 'editorial-untagged', editorialRank: 3 })]);
  });

  it('does not put an untagged non-editorial item on All', async () => {
    teamNewsItemFindMany.mockResolvedValue([
      makeRow({
        uid: 'untagged-ordinary',
        teamUid: 'no-focus-team',
        editorialRank: null,
        team: {
          uid: 'no-focus-team',
          name: 'No Focus Inc',
          logo: null,
          teamFocusAreas: [],
        },
      }),
    ]);

    const result = await service.listGroupedByFocusArea(query);

    expect(result.groups).toEqual([]);
    expect(result.allTabExtraItems).toEqual([]);
  });

  it('keeps a focused editorial pick in its group, not extras', async () => {
    teamNewsItemFindMany.mockResolvedValue([
      makeRow({
        uid: 'editorial-focused',
        editorialRank: 1,
        team: {
          uid: 'team-1',
          name: 'Acme Labs',
          logo: null,
          teamFocusAreas: [
            {
              focusArea: { title: 'AI & Robotics', parentUid: null },
              ancestorArea: { title: 'AI & Robotics' },
            },
          ],
        },
      }),
    ]);

    const result = await service.listGroupedByFocusArea(query);

    expect(result.allTabExtraItems).toEqual([]);
    expect(result.groups).toEqual([
      expect.objectContaining({
        focusArea: { uid: 'fa-ai', title: 'AI & Robotics' },
        items: [expect.objectContaining({ uid: 'editorial-focused', editorialRank: 1 })],
      }),
    ]);
    expect(result.forYouTeamUids).toEqual([]);
  });

  it('attaches forYouTeamUids from suggestions when the viewer is known', async () => {
    teamNewsItemFindMany.mockResolvedValue([]);
    const getForYouTeamUids = jest.fn().mockResolvedValue(['seed-team', 'cand-1']);
    service = new TeamNewsQueryService(
      {
        teamNewsItem: { findMany: teamNewsItemFindMany },
        focusArea: { findMany: focusAreaFindMany },
        teamNewsForumLink: { findMany: teamNewsForumLinkFindMany },
        teamNewsUpvote: { groupBy: teamNewsUpvoteGroupBy, findMany: teamNewsUpvoteFindMany },
      } as unknown as PrismaService,
      { getForYouTeamUids } as never
    );

    const result = await service.listGroupedByFocusArea(query, new Set(), 'member-1');

    expect(getForYouTeamUids).toHaveBeenCalledWith('member-1');
    expect(result.forYouTeamUids).toEqual(['seed-team', 'cand-1']);
  });
});

describe('TeamNewsQueryService.getRecentCountsByTeam', () => {
  let service: TeamNewsQueryService;

  const teamNewsItemGroupBy = jest.fn();

  const prismaMock = {
    teamNewsItem: { groupBy: teamNewsItemGroupBy },
  } as unknown as PrismaService;

  // Frozen so the 30-day cutoff is an exact, assertable Date rather than a
  // moving target — same trick team-news-event-date.where.spec.ts plays with
  // its NOW constant.
  const NOW = new Date('2026-08-18T12:00:00.000Z').getTime();
  const CUTOFF = new Date(NOW - 30 * 24 * 60 * 60 * 1000);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    teamNewsItemGroupBy.mockResolvedValue([]);
    service = new TeamNewsQueryService(prismaMock);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns an empty map without touching the database when given no teams', async () => {
    const result = await service.getRecentCountsByTeam([]);

    expect(result).toEqual({ counts: {} });
    expect(teamNewsItemGroupBy).not.toHaveBeenCalled();
  });

  it('groups by team over the 30-day window, excluding the public-list teams', async () => {
    await service.getRecentCountsByTeam(['team-1', 'team-2']);

    expect(teamNewsItemGroupBy).toHaveBeenCalledWith({
      by: ['teamUid'],
      where: {
        AND: [
          { teamUid: { in: ['team-1', 'team-2'] } },
          { eventDate: { gte: CUTOFF } },
          {
            NOT: {
              OR: TEAM_NEWS_EXCLUDED_TEAM_NAMES.map((name) => ({
                team: { name: { equals: name, mode: 'insensitive' } },
              })),
            },
          },
        ],
      },
      _count: { _all: true },
    });
  });

  it('maps grouped rows to a uid-keyed count map', async () => {
    teamNewsItemGroupBy.mockResolvedValue([
      { teamUid: 'team-1', _count: { _all: 3 } },
      { teamUid: 'team-2', _count: { _all: 1 } },
    ]);

    const result = await service.getRecentCountsByTeam(['team-1', 'team-2']);

    expect(result).toEqual({ counts: { 'team-1': 3, 'team-2': 1 } });
  });

  it('omits teams with nothing recent rather than zero-filling them', async () => {
    // groupBy returns no row for a team with no matching items. The contract
    // says absent means zero, so the chip renders nothing either way — but the
    // response must not invent a `0` the query never produced.
    teamNewsItemGroupBy.mockResolvedValue([{ teamUid: 'team-1', _count: { _all: 2 } }]);

    const result = await service.getRecentCountsByTeam(['team-1', 'quiet-team']);

    expect(result).toEqual({ counts: { 'team-1': 2 } });
    expect(result.counts).not.toHaveProperty('quiet-team');
  });
});
