import { PrismaService } from '../shared/prisma.service';
import { FeedLikesService } from './feed-likes.service';

describe('FeedLikesService', () => {
  let service: FeedLikesService;

  const feedForumPostLikeUpsert = jest.fn();
  const feedForumPostLikeDeleteMany = jest.fn();
  const feedForumPostLikeCount = jest.fn();

  const prismaMock = {
    feedForumPostLike: {
      upsert: feedForumPostLikeUpsert,
      deleteMany: feedForumPostLikeDeleteMany,
      count: feedForumPostLikeCount,
    },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    feedForumPostLikeUpsert.mockResolvedValue({});
    feedForumPostLikeDeleteMany.mockResolvedValue({ count: 1 });
    feedForumPostLikeCount.mockResolvedValue(2);
    service = new FeedLikesService(prismaMock);
  });

  it('upserts a like and returns the updated count', async () => {
    const result = await service.like('member-1', 'fp_123');

    expect(feedForumPostLikeUpsert).toHaveBeenCalledWith({
      where: { forumPostUid_memberUid: { forumPostUid: 'fp_123', memberUid: 'member-1' } },
      create: { forumPostUid: 'fp_123', memberUid: 'member-1' },
      update: {},
    });
    expect(result).toEqual({ likeCount: 2, viewerHasLiked: true });
  });

  it('removes a like idempotently and returns viewerHasLiked false', async () => {
    feedForumPostLikeCount.mockResolvedValue(1);

    const result = await service.unlike('member-1', 'fp_123');

    expect(feedForumPostLikeDeleteMany).toHaveBeenCalledWith({
      where: { forumPostUid: 'fp_123', memberUid: 'member-1' },
    });
    expect(result).toEqual({ likeCount: 1, viewerHasLiked: false });
  });
});
