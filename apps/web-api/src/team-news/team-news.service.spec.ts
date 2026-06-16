import { NotFoundException } from '@nestjs/common';

// Mock the push-notifications module so loading TeamNewsService does not pull in
// the websocket gateway (and its ESM-only axios import) under jest.
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));

import type { PrismaService } from '../shared/prisma.service';
import type { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { TeamNewsService } from './team-news.service';

type PrismaMock = {
  teamNewsItem: { findUnique: jest.Mock };
  teamNewsForumLink: { findUnique: jest.Mock; upsert: jest.Mock };
};

const buildPrismaMock = (): PrismaMock => ({
  teamNewsItem: { findUnique: jest.fn() },
  teamNewsForumLink: { findUnique: jest.fn(), upsert: jest.fn() },
});

const buildPushMock = () => ({ create: jest.fn().mockResolvedValue(undefined) });

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  uid: 'link-1',
  newsItemUid: 'news-1',
  forumTopicId: 42,
  forumTopicSlug: '42/some-slug',
  forumTopicUrl: '/forum/topics/1/42',
  createdByUid: 'member-1',
  createdAt: new Date('2026-05-21T12:00:00.000Z'),
  ...overrides,
});

describe('TeamNewsService.createForumLink', () => {
  let service: TeamNewsService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new TeamNewsService(
      prisma as unknown as PrismaService,
      buildPushMock() as unknown as PushNotificationsService,
    );
  });

  it('throws NotFound when the news item does not exist', async () => {
    prisma.teamNewsItem.findUnique.mockResolvedValue(null);
    await expect(
      service.createForumLink(
        'news-missing',
        { forumTopicId: 42, forumTopicSlug: '42/x', forumTopicUrl: '/forum/topics/1/42' },
        'member-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.teamNewsForumLink.upsert).not.toHaveBeenCalled();
  });

  it('creates a new link and returns created=true when no row exists', async () => {
    prisma.teamNewsItem.findUnique.mockResolvedValue({ uid: 'news-1' });
    prisma.teamNewsForumLink.findUnique.mockResolvedValue(null);
    prisma.teamNewsForumLink.upsert.mockResolvedValue(makeRow());

    const result = await service.createForumLink(
      'news-1',
      { forumTopicId: 42, forumTopicSlug: '42/some-slug', forumTopicUrl: '/forum/topics/1/42' },
      'member-1',
    );

    expect(result.created).toBe(true);
    expect(result.link.uid).toBe('link-1');
    expect(result.link.forumTopicId).toBe(42);
    expect(result.link.forumTopicUrl).toBe('/forum/topics/1/42');
  });

  it('returns the existing link with created=false when the row already exists', async () => {
    prisma.teamNewsItem.findUnique.mockResolvedValue({ uid: 'news-1' });
    prisma.teamNewsForumLink.findUnique.mockResolvedValue({ id: 7 });
    prisma.teamNewsForumLink.upsert.mockResolvedValue(makeRow({ uid: 'link-existing' }));

    const result = await service.createForumLink(
      'news-1',
      { forumTopicId: 42, forumTopicSlug: '42/x', forumTopicUrl: '/forum/topics/1/42' },
      'member-1',
    );

    expect(result.created).toBe(false);
    expect(result.link.uid).toBe('link-existing');
  });

  it('forwards createdByUid to the upsert create payload', async () => {
    prisma.teamNewsItem.findUnique.mockResolvedValue({ uid: 'news-1' });
    prisma.teamNewsForumLink.findUnique.mockResolvedValue(null);
    prisma.teamNewsForumLink.upsert.mockResolvedValue(makeRow({ createdByUid: 'member-7' }));

    await service.createForumLink(
      'news-1',
      { forumTopicId: 99, forumTopicSlug: '99/x', forumTopicUrl: '/forum/topics/1/99' },
      'member-7',
    );

    expect(prisma.teamNewsForumLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          newsItemUid: 'news-1',
          forumTopicId: 99,
          createdByUid: 'member-7',
        }),
        update: {},
      }),
    );
  });

  it('allows a null createdByUid for unattributed calls', async () => {
    prisma.teamNewsItem.findUnique.mockResolvedValue({ uid: 'news-1' });
    prisma.teamNewsForumLink.findUnique.mockResolvedValue(null);
    prisma.teamNewsForumLink.upsert.mockResolvedValue(makeRow({ createdByUid: null }));

    const result = await service.createForumLink(
      'news-1',
      { forumTopicId: 42, forumTopicSlug: '42/x', forumTopicUrl: '/forum/topics/1/42' },
      null,
    );

    expect(result.link.createdByUid).toBeNull();
  });
});

type IngestPrismaMock = {
  team: { findMany: jest.Mock };
  teamNewsItem: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; count: jest.Mock };
  teamNewsEnrichment: { upsert: jest.Mock };
  pushNotification: { findFirst: jest.Mock; update: jest.Mock };
};

const buildIngestPrismaMock = (): IngestPrismaMock => ({
  team: {
    findMany: jest.fn().mockResolvedValue([
      { uid: 't1', name: 'ARIA', logo: { url: 'https://cdn/aria.png' } },
      { uid: 't2', name: 'Bluesky', logo: null },
    ]),
  },
  teamNewsItem: {
    findUnique: jest.fn(),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(1),
  },
  teamNewsEnrichment: { upsert: jest.fn().mockResolvedValue({}) },
  pushNotification: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({}) },
});

const ingestItem = (overrides: Record<string, unknown> = {}) => ({
  teamUid: 't1',
  eventDate: '2026-06-10T00:00:00.000Z',
  title: 'ARIA raised a seed round',
  sourceUrl: 'https://news.example.com/a',
  eventType: 'FUNDING' as const,
  tags: [],
  ...overrides,
});

describe('TeamNewsService.ingestTeamNews notifications', () => {
  let service: TeamNewsService;
  let prisma: IngestPrismaMock;
  let push: ReturnType<typeof buildPushMock>;

  beforeEach(() => {
    prisma = buildIngestPrismaMock();
    push = buildPushMock();
    service = new TeamNewsService(
      prisma as unknown as PrismaService,
      push as unknown as PushNotificationsService,
    );
  });

  it('emits ONE run notification summarising all teams in the batch', async () => {
    prisma.teamNewsItem.findUnique.mockResolvedValue(null); // every item is new

    await service.ingestTeamNews({
      runId: 'run-1',
      items: [
        ingestItem({ teamUid: 't1', title: 'older', eventDate: '2026-06-09T00:00:00.000Z', sourceUrl: 'https://x/1' }),
        ingestItem({ teamUid: 't1', title: 'newest', eventDate: '2026-06-11T00:00:00.000Z', sourceUrl: 'https://x/2' }),
        ingestItem({ teamUid: 't2', title: 'bsky update', sourceUrl: 'https://x/3' }),
      ],
    });

    expect(push.create).toHaveBeenCalledTimes(1);
    const dto = push.create.mock.calls[0][0];
    expect(dto).toMatchObject({
      category: 'TEAM_NEWS',
      title: 'Latest Network News',
      description: '2 teams shared news across the network.',
      link: '/home',
      isPublic: true,
    });
    expect(dto.metadata).toMatchObject({ eventType: 'team_news', runId: 'run-1', teamCount: 2, updateCount: 3 });
    expect(dto.metadata.teamUids).toEqual(['t1', 't2']);
  });

  it('uses single-team copy with the latest headline when only one team has news', async () => {
    prisma.teamNewsItem.findUnique.mockResolvedValue(null);

    await service.ingestTeamNews({
      runId: 'run-2',
      items: [
        ingestItem({ teamUid: 't1', title: 'older', eventDate: '2026-06-09T00:00:00.000Z', sourceUrl: 'https://x/1' }),
        ingestItem({ teamUid: 't1', title: 'newest', eventDate: '2026-06-11T00:00:00.000Z', sourceUrl: 'https://x/2' }),
      ],
    });

    expect(push.create).toHaveBeenCalledTimes(1);
    expect(push.create.mock.calls[0][0]).toMatchObject({
      title: 'Latest Network News',
      description: 'newest +1 more', // latest headline + remaining count
      image: 'https://cdn/aria.png',
      metadata: { teamCount: 1, updateCount: 2 },
    });
  });

  it('merges a later batch of the same run in place, without re-broadcasting', async () => {
    prisma.teamNewsItem.findUnique.mockResolvedValue(null);

    // Batch 1 of run-3: no existing notification -> create.
    await service.ingestTeamNews({ runId: 'run-3', items: [ingestItem({ teamUid: 't1', sourceUrl: 'https://x/1' })] });
    expect(push.create).toHaveBeenCalledTimes(1);

    // Batch 2 of run-3: the run notification now exists -> update in place, no new broadcast.
    prisma.pushNotification.findFirst.mockResolvedValueOnce({
      id: 99,
      metadata: {
        runId: 'run-3',
        teamUids: ['t1'],
        teamCount: 1,
        updateCount: 1,
        latestTitle: 'ARIA raised a seed round',
        latestEventDate: '2026-06-10T00:00:00.000Z',
      },
    });

    await service.ingestTeamNews({ runId: 'run-3', items: [ingestItem({ teamUid: 't2', sourceUrl: 'https://x/2' })] });

    expect(push.create).toHaveBeenCalledTimes(1); // still only the first broadcast
    expect(prisma.pushNotification.update).toHaveBeenCalledTimes(1);
    const updateArg = prisma.pushNotification.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 99 });
    expect(updateArg.data.metadata).toMatchObject({ teamCount: 2, updateCount: 2 });
    expect(updateArg.data.metadata.teamUids).toEqual(['t1', 't2']);
    expect(updateArg.data.title).toBe('Latest Network News');
  });

  it('does not notify when items only update existing rows', async () => {
    prisma.teamNewsItem.findUnique.mockResolvedValue({ id: 1 }); // every item already exists

    await service.ingestTeamNews({ runId: 'run-4', items: [ingestItem()] });

    expect(prisma.teamNewsItem.update).toHaveBeenCalled();
    expect(push.create).not.toHaveBeenCalled();
    expect(prisma.pushNotification.findFirst).not.toHaveBeenCalled();
  });

  it('does not let a notification failure fail the ingest', async () => {
    prisma.teamNewsItem.findUnique.mockResolvedValue(null);
    push.create.mockRejectedValueOnce(new Error('ws down'));

    const result = await service.ingestTeamNews({ runId: 'run-5', items: [ingestItem()] });

    expect(result.created).toBe(1);
    expect(result.ingested).toBe(1);
  });
});
