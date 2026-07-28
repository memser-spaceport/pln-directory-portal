import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { FeedCommentsService } from './feed-comments.service';

describe('FeedCommentsService', () => {
  let service: FeedCommentsService;

  const teamNewsItemFindUnique = jest.fn();
  const feedCommentFindMany = jest.fn();
  const feedCommentFindUnique = jest.fn();
  const feedCommentCreate = jest.fn();
  const feedCommentDelete = jest.fn();
  const feedCommentGroupBy = jest.fn();

  const prismaMock = {
    teamNewsItem: { findUnique: teamNewsItemFindUnique },
    feedComment: {
      findMany: feedCommentFindMany,
      findUnique: feedCommentFindUnique,
      create: feedCommentCreate,
      delete: feedCommentDelete,
      groupBy: feedCommentGroupBy,
    },
  } as unknown as PrismaService;

  const authorInclude = { uid: 'author-1', name: 'Ada Lovelace', image: { url: 'https://img/ada.png' } };

  beforeEach(() => {
    jest.clearAllMocks();
    teamNewsItemFindUnique.mockResolvedValue({ uid: 'news-1' });
    service = new FeedCommentsService(prismaMock);
  });

  describe('createComment', () => {
    it('rejects a comment on a missing news item', async () => {
      teamNewsItemFindUnique.mockResolvedValue(null);

      await expect(service.createComment('author-1', { itemUid: 'news-missing', text: 'hi' })).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(feedCommentCreate).not.toHaveBeenCalled();
    });

    it('creates a NEWS comment when itemUid does not start with fp_', async () => {
      feedCommentCreate.mockResolvedValue({
        uid: 'c1',
        itemUid: 'news-1',
        text: 'hi',
        authorUid: 'author-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        author: authorInclude,
      });

      const result = await service.createComment('author-1', { itemUid: 'news-1', text: 'hi' });

      expect(feedCommentCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { itemType: 'NEWS', itemUid: 'news-1', text: 'hi', authorUid: 'author-1' } })
      );
      expect(result).toEqual({
        uid: 'c1',
        itemUid: 'news-1',
        text: 'hi',
        author: { uid: 'author-1', name: 'Ada Lovelace', avatarUrl: 'https://img/ada.png' },
        createdAt: '2026-01-01T00:00:00.000Z',
        isOwn: true,
      });
    });

    it('creates a FORUM_POST comment without validating a local news item', async () => {
      feedCommentCreate.mockResolvedValue({
        uid: 'c2',
        itemUid: 'fp_42',
        text: 'nice post',
        authorUid: 'author-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        author: authorInclude,
      });

      await service.createComment('author-1', { itemUid: 'fp_42', text: 'nice post' });

      expect(teamNewsItemFindUnique).not.toHaveBeenCalled();
      expect(feedCommentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { itemType: 'FORUM_POST', itemUid: 'fp_42', text: 'nice post', authorUid: 'author-1' },
        })
      );
    });
  });

  describe('listComments', () => {
    it('marks isOwn only for the viewer’s own comments', async () => {
      feedCommentFindMany.mockResolvedValue([
        {
          uid: 'c1',
          itemUid: 'fp_42',
          text: 'mine',
          authorUid: 'author-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          author: authorInclude,
        },
        {
          uid: 'c2',
          itemUid: 'fp_42',
          text: 'someone else',
          authorUid: 'author-2',
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          author: { uid: 'author-2', name: 'Bob', image: null },
        },
      ]);

      const result = await service.listComments('fp_42', 'author-1');

      expect(result.items[0].isOwn).toBe(true);
      expect(result.items[1].isOwn).toBe(false);
      expect(result.items[1].author.avatarUrl).toBeNull();
    });
  });

  describe('deleteComment', () => {
    it('throws NotFound when the comment does not exist', async () => {
      feedCommentFindUnique.mockResolvedValue(null);

      await expect(service.deleteComment('author-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws Forbidden when a non-author tries to delete', async () => {
      feedCommentFindUnique.mockResolvedValue({ uid: 'c1', authorUid: 'author-1' });

      await expect(service.deleteComment('author-2', 'c1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(feedCommentDelete).not.toHaveBeenCalled();
    });

    it('deletes when the caller is the author', async () => {
      feedCommentFindUnique.mockResolvedValue({ uid: 'c1', authorUid: 'author-1' });
      feedCommentDelete.mockResolvedValue({});

      const result = await service.deleteComment('author-1', 'c1');

      expect(feedCommentDelete).toHaveBeenCalledWith({ where: { uid: 'c1' } });
      expect(result).toEqual({ uid: 'c1', deleted: true });
    });
  });

  describe('getCommentCounts / loadCommentCounts', () => {
    it('returns 0 for uids with no comments and defaults empty input to an empty map', async () => {
      expect(await service.loadCommentCounts([])).toEqual(new Map());
      expect(feedCommentGroupBy).not.toHaveBeenCalled();

      feedCommentGroupBy.mockResolvedValue([{ itemUid: 'fp_1', _count: { _all: 3 } }]);
      const result = await service.getCommentCounts(['fp_1', 'fp_2']);

      expect(result).toEqual({ counts: { fp_1: 3 } });
    });
  });
});
