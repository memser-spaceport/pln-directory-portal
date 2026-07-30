import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { FeedLikesService } from './feed-likes.service';

describe('FeedLikesService', () => {
  let service: FeedLikesService;

  const teamNewsItemFindUnique = jest.fn();
  const feedNewsLikeUpsert = jest.fn();
  const feedNewsLikeDeleteMany = jest.fn();
  const feedNewsLikeCount = jest.fn();

  const prismaMock = {
    teamNewsItem: { findUnique: teamNewsItemFindUnique },
    feedNewsLike: {
      upsert: feedNewsLikeUpsert,
      deleteMany: feedNewsLikeDeleteMany,
      count: feedNewsLikeCount,
    },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    teamNewsItemFindUnique.mockResolvedValue({ uid: 'news-1' });
    feedNewsLikeUpsert.mockResolvedValue({});
    feedNewsLikeDeleteMany.mockResolvedValue({ count: 1 });
    feedNewsLikeCount.mockResolvedValue(2);
    service = new FeedLikesService(prismaMock);
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
