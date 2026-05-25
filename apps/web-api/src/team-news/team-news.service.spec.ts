import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../shared/prisma.service';
import { TeamNewsService } from './team-news.service';

type PrismaMock = {
  teamNewsItem: { findUnique: jest.Mock };
  teamNewsForumLink: { findUnique: jest.Mock; upsert: jest.Mock };
};

const buildPrismaMock = (): PrismaMock => ({
  teamNewsItem: { findUnique: jest.fn() },
  teamNewsForumLink: { findUnique: jest.fn(), upsert: jest.fn() },
});

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
    service = new TeamNewsService(prisma as unknown as PrismaService);
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
