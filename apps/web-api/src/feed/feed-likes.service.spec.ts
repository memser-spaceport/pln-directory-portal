import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { FeedLikesService } from './feed-likes.service';

describe('FeedLikesService', () => {
  let service: FeedLikesService;

  const teamNewsItemFindUnique = jest.fn();
  const feedNewsLikeFindUnique = jest.fn();
  const feedNewsLikeUpsert = jest.fn();
  const recordSignal = jest.fn();
  const feedNewsLikeDeleteMany = jest.fn();
  const feedNewsLikeCount = jest.fn();

  const prismaMock = {
    teamNewsItem: { findUnique: teamNewsItemFindUnique },
    feedNewsLike: {
      findUnique: feedNewsLikeFindUnique,
      upsert: feedNewsLikeUpsert,
      deleteMany: feedNewsLikeDeleteMany,
      count: feedNewsLikeCount,
    },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    teamNewsItemFindUnique.mockResolvedValue({ uid: 'news-1' });
    feedNewsLikeFindUnique.mockResolvedValue(null);
    feedNewsLikeUpsert.mockResolvedValue({});
    feedNewsLikeDeleteMany.mockResolvedValue({ count: 1 });
    feedNewsLikeCount.mockResolvedValue(2);
    service = new FeedLikesService(prismaMock, { record: recordSignal } as never);
  });

  it('upserts a like and returns the updated count', async () => {
    const result = await service.like('member-1', 'news-1');

    expect(feedNewsLikeUpsert).toHaveBeenCalledWith({
      where: { newsItemUid_memberUid: { newsItemUid: 'news-1', memberUid: 'member-1' } },
      create: { newsItemUid: 'news-1', memberUid: 'member-1' },
      update: {},
    });
    expect(result).toEqual({ likeCount: 2, viewerHasLiked: true });
  });

  it('rejects a like on a missing news item', async () => {
    teamNewsItemFindUnique.mockResolvedValue(null);

    await expect(service.like('member-1', 'news-missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(feedNewsLikeUpsert).not.toHaveBeenCalled();
  });

  it('removes a like idempotently and returns viewerHasLiked false', async () => {
    feedNewsLikeCount.mockResolvedValue(1);

    const result = await service.unlike('member-1', 'news-1');

    expect(feedNewsLikeDeleteMany).toHaveBeenCalledWith({
      where: { newsItemUid: 'news-1', memberUid: 'member-1' },
    });
    expect(result).toEqual({ likeCount: 1, viewerHasLiked: false });
  });
});

describe('FeedLikesService member signals (LAB-3121)', () => {
  const findUnique = jest.fn();
  const deleteMany = jest.fn();
  const record = jest.fn();
  const prisma = {
    teamNewsItem: { findUnique: jest.fn(async () => ({ uid: 'news-1' })) },
    feedNewsLike: { findUnique, upsert: jest.fn(async () => ({})), deleteMany, count: jest.fn(async () => 1) },
  } as unknown as PrismaService;
  const service = new FeedLikesService(prisma, { record } as never);

  beforeEach(() => jest.clearAllMocks());

  it('records news-like only for a new like', async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 1 });
    await service.like('member-1', 'news-1');
    await service.like('member-1', 'news-1');
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({
      memberUid: 'member-1',
      action: 'news-like',
      entityType: 'NEWS_ITEM',
      entityUid: 'news-1',
    });
  });

  it('records news-like-removed only when a like was deleted', async () => {
    deleteMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    await service.unlike('member-1', 'news-1');
    await service.unlike('member-1', 'news-1');
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: 'news-like-removed' }));
  });
});
