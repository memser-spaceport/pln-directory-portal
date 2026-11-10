import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LabosDigestService } from './labos-digest.service';
import { TeamNewsQueryService } from './team-news-query.service';
import { PrismaService } from '../shared/prisma.service';

// Follows pulls PostHog in through member signals. This spec does not use it.
jest.mock('../analytics/service/analytics.service', () => ({ AnalyticsService: class AnalyticsService {} }));

const updatedAt = new Date('2026-11-09T12:00:00.000Z');

const story = (uid: string, editorialRank: number | null = null) => ({
  uid,
  title: `Title ${uid}`,
  summary: `Summary ${uid}`,
  sourceDomain: 'example.com',
  sourceUrl: `https://example.com/${uid}`,
  eventDate: new Date('2026-11-01T00:00:00.000Z'),
  tags: ['ai'],
  teamUid: 'team-1',
  editorialRank,
  viewCount: 0,
  postedByMemberUid: null,
  imageUrl: null,
  contentHtml: null,
  sourceUrls: [`https://example.com/${uid}`],
  eventType: 'FUNDING',
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  team: { uid: 'team-1', name: 'Acme', logo: null, teamFocusAreas: [] },
});

describe('LabosDigestService', () => {
  const overrideFindUnique = jest.fn();
  const overrideUpsert = jest.fn();
  const overrideDelete = jest.fn();
  const overrideDeleteMany = jest.fn();
  const stateUpsert = jest.fn();
  const stateFindMany = jest.fn();
  const newsFindMany = jest.fn();
  const newsCount = jest.fn();
  const newsFindUnique = jest.fn();
  const newsUpdate = jest.fn();
  const sendCreate = jest.fn();
  const sendFindMany = jest.fn();
  const sendCount = jest.fn();
  const sendFindUnique = jest.fn();
  const storyFindMany = jest.fn();

  const prisma = {
    labosDigestOverride: {
      findUnique: overrideFindUnique,
      upsert: overrideUpsert,
      delete: overrideDelete,
      deleteMany: overrideDeleteMany,
    },
    labosDigestFrequencyState: { upsert: stateUpsert, findMany: stateFindMany },
    labosDigestSend: {
      create: sendCreate,
      findMany: sendFindMany,
      count: sendCount,
      findUnique: sendFindUnique,
    },
    labosDigestSendStory: { findMany: storyFindMany },
    teamNewsItem: { findMany: newsFindMany, count: newsCount, findUnique: newsFindUnique, update: newsUpdate },
  } as unknown as PrismaService;

  const service = new LabosDigestService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    overrideFindUnique.mockResolvedValue(null);
    stateFindMany.mockResolvedValue([]);
    stateUpsert.mockResolvedValue({});
    newsFindMany.mockResolvedValue([]);
    newsCount.mockResolvedValue(0);
    storyFindMany.mockResolvedValue([]);
    sendCreate.mockResolvedValue({ id: 'send-1' });
  });

  it('returns the AI ranks when no override is saved', async () => {
    newsFindMany.mockResolvedValue([{ uid: 'lead' }, { uid: 'second' }]);

    const selection = await service.selectForDigest();

    expect(selection).toEqual({ source: 'ai', uids: ['lead', 'second'], overrideUpdatedAt: null });
    expect(newsFindMany.mock.calls[0][0].where.editorialRank).toEqual({ not: null, lte: 3 });
    expect(newsFindMany.mock.calls[0][0].orderBy).toEqual({ editorialRank: 'asc' });
  });

  it('returns the saved order and its version when an admin override exists', async () => {
    overrideFindUnique.mockResolvedValue({
      newsItemUids: ['second', 'lead'],
      updatedAt,
    });

    await expect(service.selectForDigest()).resolves.toEqual({
      source: 'admin',
      uids: ['second', 'lead'],
      overrideUpdatedAt: updatedAt.toISOString(),
    });
    expect(newsFindMany).not.toHaveBeenCalled();
  });

  it('stores the last shown lead for the frequency the digest job reports', async () => {
    await service.selectForDigest({ frequency: 'daily', lastShownLeadUid: 'lead' });

    expect(stateUpsert).toHaveBeenCalledWith({
      where: { frequency: 'DAILY' },
      create: { frequency: 'DAILY', lastLeadNewsItemUid: 'lead' },
      update: { lastLeadNewsItemUid: 'lead' },
    });
  });

  it('saves a reordered list and rejects a duplicate or a missing story', async () => {
    newsFindMany.mockImplementation(async (args: { select?: { title?: boolean } }) => {
      if (args.select?.title) return [story('a'), story('b')];
      return [{ uid: 'a' }, { uid: 'b' }];
    });
    overrideUpsert.mockResolvedValue({});

    await service.savePicks(['b', 'a'], 'admin-1');

    expect(overrideUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { id: 'current', newsItemUids: ['b', 'a'], setByMemberUid: 'admin-1' },
        update: { newsItemUids: ['b', 'a'], setByMemberUid: 'admin-1' },
      })
    );

    await expect(service.savePicks(['a', 'a'], 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    newsFindMany.mockResolvedValue([{ uid: 'a' }]);
    await expect(service.savePicks(['a', 'missing'], 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reset deletes the override', async () => {
    await service.resetPicks();
    expect(overrideDeleteMany).toHaveBeenCalledWith({ where: { id: 'current' } });
  });

  it('clears the override after a matching admin send and keeps a newer one', async () => {
    newsFindMany.mockResolvedValue([{ uid: 'a' }]);
    overrideFindUnique.mockResolvedValue({ updatedAt, newsItemUids: ['a'] });

    const cleared = await service.recordSend({
      frequency: 'weekly',
      sentAt: '2026-11-09T13:00:00.000Z',
      source: 'admin',
      leadNewsItemUid: 'a',
      lastShownLeadUid: 'a',
      storyUids: ['a', 'gone'],
      overrideUpdatedAt: updatedAt.toISOString(),
    });

    expect(cleared).toEqual({ uid: 'send-1', clearedOverride: true });
    expect(sendCreate.mock.calls[0][0].data.stories.create).toEqual([{ newsItemUid: 'a', position: 1, isLead: true }]);
    expect(overrideDelete).toHaveBeenCalledWith({ where: { id: 'current' } });

    overrideDelete.mockClear();
    overrideFindUnique.mockResolvedValue({ updatedAt: new Date('2026-11-09T15:00:00.000Z'), newsItemUids: ['b'] });
    const kept = await service.recordSend({
      frequency: 'daily',
      sentAt: '2026-11-09T13:00:00.000Z',
      source: 'admin',
      leadNewsItemUid: 'a',
      lastShownLeadUid: 'a',
      storyUids: ['a'],
      overrideUpdatedAt: updatedAt.toISOString(),
    });
    expect(kept.clearedOverride).toBe(false);
    expect(overrideDelete).not.toHaveBeenCalled();
  });

  it('does not clear the override when the send used the AI picks', async () => {
    const result = await service.recordSend({
      frequency: 'daily',
      sentAt: '2026-11-09T13:00:00.000Z',
      source: 'ai',
      leadNewsItemUid: null,
      lastShownLeadUid: 'lead',
      storyUids: ['lead'],
      overrideUpdatedAt: null,
    });

    expect(result.clearedOverride).toBe(false);
    expect(overrideDelete).not.toHaveBeenCalled();
    expect(stateUpsert).toHaveBeenCalledWith(expect.objectContaining({ update: { lastLeadNewsItemUid: 'lead' } }));
  });

  it('marks found news that was a top story and paginates', async () => {
    newsCount.mockResolvedValue(2);
    newsFindMany.mockResolvedValue([
      {
        uid: 'a',
        title: 'Alpha',
        sourceDomain: 'a.example',
        eventDate: new Date('2026-11-02T00:00:00.000Z'),
        tags: ['ai'],
      },
      {
        uid: 'b',
        title: 'Beta',
        sourceDomain: null,
        eventDate: new Date('2026-11-01T00:00:00.000Z'),
        tags: [],
      },
    ]);
    storyFindMany.mockResolvedValue([
      {
        newsItemUid: 'a',
        position: 1,
        isLead: true,
        send: { frequency: 'DAILY', sentAt: new Date('2026-11-03T00:00:00.000Z') },
      },
    ]);

    const page = await service.listFoundNews({ page: 2, limit: 1, from: undefined, to: undefined, tags: ['ai'] });

    expect(newsFindMany.mock.calls[0][0].skip).toBe(1);
    expect(newsFindMany.mock.calls[0][0].where.tags).toEqual({ hasSome: ['ai'] });
    expect(page.total).toBe(2);
    expect(page.items[0]).toEqual(
      expect.objectContaining({
        uid: 'a',
        wasTopStory: true,
        topStoryHistory: [expect.objectContaining({ frequency: 'daily', position: 1, isLead: true })],
      })
    );
    expect(page.items[1].wasTopStory).toBe(false);
  });

  it('searches title, summary, and content', async () => {
    await service.listFoundNews({ page: 1, limit: 20, from: undefined, to: undefined, tags: [], q: ' fundraise ' });

    expect(newsFindMany.mock.calls[0][0].where.OR).toEqual([
      { title: { contains: 'fundraise', mode: 'insensitive' } },
      { summary: { contains: 'fundraise', mode: 'insensitive' } },
      { contentHtml: { contains: 'fundraise', mode: 'insensitive' } },
    ]);
  });

  it('updates the real title, description, and sources', async () => {
    const detail = {
      uid: 'a',
      title: 'New title',
      summary: 'New description',
      contentHtml: '<p>Body</p>',
      sourceUrl: 'https://news.example/a',
      sourceUrls: ['https://news.example/a', 'https://other.example/a'],
      sourceDomain: 'news.example',
      imageUrl: null,
      eventDate: new Date('2026-11-01T00:00:00.000Z'),
      tags: ['ai'],
      team: { uid: 'team-1', name: 'Acme' },
    };
    newsFindUnique.mockResolvedValueOnce({ uid: 'a' }).mockResolvedValueOnce(detail);
    newsUpdate.mockResolvedValue({});
    storyFindMany.mockResolvedValue([]);

    const saved = await service.updateNewsItem('a', {
      title: 'New title',
      summary: 'New description',
      sourceUrls: ['https://news.example/a', 'https://other.example/a'],
    });

    expect(newsUpdate).toHaveBeenCalledWith({
      where: { uid: 'a' },
      data: {
        title: 'New title',
        summary: 'New description',
        sourceUrl: 'https://news.example/a',
        sourceUrls: ['https://news.example/a', 'https://other.example/a'],
        sourceDomain: 'news.example',
      },
    });
    expect(saved.title).toBe('New title');
    expect(saved.summary).toBe('New description');
  });

  it('posts news for a team as a directory admin', async () => {
    const createTeamPostedNews = jest.fn().mockResolvedValue({ uid: 'posted' });
    const posting = new LabosDigestService(prisma, { createTeamPostedNews } as any);
    newsFindUnique.mockResolvedValue({
      uid: 'posted',
      title: 'Headline',
      summary: null,
      contentHtml: '<p>Body</p>',
      sourceUrl: 'https://news.example/post',
      sourceUrls: ['https://news.example/post'],
      sourceDomain: 'news.example',
      imageUrl: null,
      eventDate: new Date('2026-11-01T00:00:00.000Z'),
      tags: [],
      team: { uid: 'team-1', name: 'Acme' },
    });

    const created = await posting.postNews(
      { teamUid: 'team-1', title: 'Headline', body: 'Body', url: 'https://news.example/post' },
      'admin-1'
    );

    expect(createTeamPostedNews).toHaveBeenCalledWith(
      'team-1',
      { title: 'Headline', body: 'Body', url: 'https://news.example/post' },
      { uid: 'admin-1', isDirectoryAdmin: true }
    );
    expect(created.uid).toBe('posted');
  });

  it('says the next AI email skips a lead that frequency already sent', async () => {
    newsFindMany.mockImplementation(async (args: { where?: { editorialRank?: unknown; uid?: unknown } }) => {
      if (args.where?.editorialRank) return [{ uid: 'lead' }];
      return [story('lead', 1)];
    });
    stateFindMany.mockResolvedValue([{ frequency: 'DAILY', lastLeadNewsItemUid: 'lead' }]);

    const view = await service.getView();

    expect(view.source).toBe('ai');
    expect(view.daily).toEqual({
      frequency: 'daily',
      leadIncluded: false,
      leadUid: null,
      lastLeadNewsItemUid: 'lead',
    });
    expect(view.weekly.leadIncluded).toBe(true);
    expect(view.weekly.leadUid).toBe('lead');
  });

  it('does not skip an admin lead', async () => {
    overrideFindUnique.mockResolvedValue({ newsItemUids: ['lead'], updatedAt });
    newsFindMany.mockResolvedValue([story('lead')]);
    stateFindMany.mockResolvedValue([{ frequency: 'DAILY', lastLeadNewsItemUid: 'lead' }]);

    const view = await service.getView();

    expect(view.source).toBe('admin');
    expect(view.stories.map((item) => item.uid)).toEqual(['lead']);
    expect(view.daily.leadIncluded).toBe(true);
    expect(view.daily.leadUid).toBe('lead');
  });

  it('returns one past send in story order and 404s when it is missing', async () => {
    sendFindUnique.mockResolvedValue({
      id: 'send-1',
      frequency: 'WEEKLY',
      sentAt: new Date('2026-11-08T00:00:00.000Z'),
      source: 'ADMIN',
      channel: 'forum-digest',
      stories: [
        { position: 1, isLead: true, newsItem: story('a') },
        { position: 2, isLead: false, newsItem: story('b') },
      ],
    });

    const send = await service.getSend('send-1');
    expect(send.stories.map((item) => [item.position, item.uid])).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);

    sendFindUnique.mockResolvedValue(null);
    await expect(service.getSend('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('paginates the service news list', async () => {
    newsCount.mockResolvedValue(3);
    newsFindMany.mockResolvedValue([
      {
        ...story('a'),
        team: { uid: 'team-1', name: 'Acme' },
      },
    ]);

    const page = await service.listServiceNews({
      page: 1,
      limit: 1,
      from: '2026-11-01',
      to: '2026-11-09',
      tags: [],
    });

    expect(page).toEqual({
      page: 1,
      limit: 1,
      total: 3,
      items: [
        expect.objectContaining({
          uid: 'a',
          title: 'Title a',
          summary: 'Summary a',
          source: 'example.com',
          link: 'https://example.com/a',
          team: { uid: 'team-1', name: 'Acme' },
        }),
      ],
    });
    expect(newsFindMany.mock.calls[0][0].take).toBe(1);
  });
});

describe('TeamNewsQueryService digest top stories', () => {
  const teamNewsItemFindMany = jest.fn();
  const teamNewsForumLinkFindMany = jest.fn();
  const teamNewsUpvoteGroupBy = jest.fn();
  const memberFindMany = jest.fn();

  const prisma = {
    teamNewsItem: { findMany: teamNewsItemFindMany, findFirst: jest.fn() },
    teamNewsForumLink: { findMany: teamNewsForumLinkFindMany },
    teamNewsUpvote: { groupBy: teamNewsUpvoteGroupBy, findMany: jest.fn() },
    member: { findMany: memberFindMany },
  } as unknown as PrismaService;

  const selectForDigest = jest.fn();
  const labos = { selectForDigest } as unknown as LabosDigestService;
  const service = new TeamNewsQueryService(prisma, undefined, undefined, labos);

  beforeEach(() => {
    jest.clearAllMocks();
    teamNewsForumLinkFindMany.mockResolvedValue([]);
    teamNewsUpvoteGroupBy.mockResolvedValue([]);
    memberFindMany.mockResolvedValue([]);
  });

  it('uses the first admin story as the digest lead', async () => {
    selectForDigest.mockResolvedValue({
      source: 'admin',
      uids: ['second', 'lead'],
      overrideUpdatedAt: updatedAt.toISOString(),
    });
    teamNewsItemFindMany
      .mockResolvedValueOnce([story('window')])
      .mockResolvedValueOnce([story('lead', 1), story('second', null)]);

    const result = await service.getDigestNewsPicks({
      memberUids: ['member-1'],
      sinceCreatedAt: new Date('2026-11-01T00:00:00.000Z'),
      untilCreatedAt: new Date('2026-11-02T00:00:00.000Z'),
    });

    expect(result.topStorySource).toBe('admin');
    expect(result.topStory?.uid).toBe('second');
    expect(result.topStories.map((item) => item.uid)).toEqual(['second', 'lead']);
    expect(result.overrideUpdatedAt).toBe(updatedAt.toISOString());
    expect(result.picks['member-1'].map((item) => item.uid)).toEqual(['window']);
  });

  it('keeps editorial rank 1 as the AI lead when rank 2 is also returned', async () => {
    selectForDigest.mockResolvedValue({ source: 'ai', uids: ['second', 'lead'], overrideUpdatedAt: null });
    teamNewsItemFindMany
      .mockResolvedValueOnce([story('window')])
      .mockResolvedValueOnce([story('second', 2), story('lead', 1)]);

    const result = await service.getDigestNewsPicks({
      memberUids: ['member-1'],
      sinceCreatedAt: new Date('2026-11-01T00:00:00.000Z'),
      untilCreatedAt: new Date('2026-11-02T00:00:00.000Z'),
    });

    expect(result.topStorySource).toBe('ai');
    expect(result.topStory?.uid).toBe('lead');
    expect(result.overrideUpdatedAt).toBeNull();
  });
});
