import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { TeamNewsUpvotesService } from './team-news-upvotes.service';

describe('TeamNewsUpvotesService', () => {
  let service: TeamNewsUpvotesService;

  const teamNewsItemFindUnique = jest.fn();
  const teamNewsUpvoteUpsert = jest.fn();
  const teamNewsUpvoteDeleteMany = jest.fn();
  const teamNewsUpvoteCount = jest.fn();

  const prismaMock = {
    teamNewsItem: { findUnique: teamNewsItemFindUnique },
    teamNewsUpvote: {
      upsert: teamNewsUpvoteUpsert,
      deleteMany: teamNewsUpvoteDeleteMany,
      count: teamNewsUpvoteCount,
    },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    teamNewsItemFindUnique.mockResolvedValue({ uid: 'news-1' });
    teamNewsUpvoteUpsert.mockResolvedValue({});
    teamNewsUpvoteDeleteMany.mockResolvedValue({ count: 1 });
    teamNewsUpvoteCount.mockResolvedValue(2);
    service = new TeamNewsUpvotesService(prismaMock);
  });

  it('throws NotFound when the news item does not exist', async () => {
    teamNewsItemFindUnique.mockResolvedValue(null);

    await expect(service.upvote('member-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(teamNewsUpvoteUpsert).not.toHaveBeenCalled();
  });

  it('upserts an upvote and returns the updated count', async () => {
    const result = await service.upvote('member-1', 'news-1');

    expect(teamNewsUpvoteUpsert).toHaveBeenCalledWith({
      where: { newsItemUid_memberUid: { newsItemUid: 'news-1', memberUid: 'member-1' } },
      create: { newsItemUid: 'news-1', memberUid: 'member-1' },
      update: {},
    });
    expect(result).toEqual({ upvoteCount: 2, viewerHasUpvoted: true });
  });

  it('removes an upvote idempotently and returns viewerHasUpvoted false', async () => {
    teamNewsUpvoteCount.mockResolvedValue(1);

    const result = await service.removeUpvote('member-1', 'news-1');

    expect(teamNewsUpvoteDeleteMany).toHaveBeenCalledWith({
      where: { newsItemUid: 'news-1', memberUid: 'member-1' },
    });
    expect(result).toEqual({ upvoteCount: 1, viewerHasUpvoted: false });
  });
});
