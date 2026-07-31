import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { FeedCommentsService } from './feed-comments.service';

describe('FeedCommentsService', () => {
  let service: FeedCommentsService;

  const teamNewsItemFindUnique = jest.fn();
  const feedCommentFindMany = jest.fn();
  const feedCommentFindFirst = jest.fn();
  const feedCommentFindUnique = jest.fn();
  const feedCommentCreate = jest.fn();
  const feedCommentDelete = jest.fn();
  const feedCommentGroupBy = jest.fn();

  const prismaMock = {
    teamNewsItem: { findUnique: teamNewsItemFindUnique },
    feedComment: {
      findMany: feedCommentFindMany,
      findFirst: feedCommentFindFirst,
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

      await expect(
        service.createComment('author-1', { newsItemUid: 'news-missing', text: 'hi' })
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(feedCommentCreate).not.toHaveBeenCalled();
    });

    it('creates a top-level comment on a news item', async () => {
      feedCommentCreate.mockResolvedValue({
        uid: 'c1',
        newsItemUid: 'news-1',
        parentUid: null,
        text: 'hi',
        authorUid: 'author-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        author: authorInclude,
      });

      const result = await service.createComment('author-1', { newsItemUid: 'news-1', text: 'hi' });

      expect(feedCommentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { newsItemUid: 'news-1', parentUid: null, text: 'hi', authorUid: 'author-1' },
        })
      );
      expect(result).toEqual({
        uid: 'c1',
        newsItemUid: 'news-1',
        parentUid: null,
        text: 'hi',
        author: { uid: 'author-1', name: 'Ada Lovelace', avatarUrl: 'https://img/ada.png' },
        createdAt: '2026-01-01T00:00:00.000Z',
        isOwn: true,
        replies: [],
      });
    });

    it('creates a reply when parentUid points at an existing comment on the same news item', async () => {
      feedCommentFindFirst.mockResolvedValue({ uid: 'c1' });
      feedCommentCreate.mockResolvedValue({
        uid: 'c2',
        newsItemUid: 'news-1',
        parentUid: 'c1',
        text: 'a reply',
        authorUid: 'author-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        author: authorInclude,
      });

      const result = await service.createComment('author-1', {
        newsItemUid: 'news-1',
        parentUid: 'c1',
        text: 'a reply',
      });

      expect(feedCommentFindFirst).toHaveBeenCalledWith({
        where: { uid: 'c1', newsItemUid: 'news-1' },
        select: { uid: true },
      });
      expect(feedCommentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { newsItemUid: 'news-1', parentUid: 'c1', text: 'a reply', authorUid: 'author-1' },
        })
      );
      expect(result.parentUid).toBe('c1');
    });

    it('rejects a reply whose parentUid does not belong to the news item', async () => {
      feedCommentFindFirst.mockResolvedValue(null);

      await expect(
        service.createComment('author-1', { newsItemUid: 'news-1', parentUid: 'missing', text: 'a reply' })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(feedCommentCreate).not.toHaveBeenCalled();
    });
  });

  describe('listComments', () => {
    it('marks isOwn only for the viewer’s own comments', async () => {
      feedCommentFindMany.mockResolvedValue([
        {
          uid: 'c1',
          newsItemUid: 'news-1',
          parentUid: null,
          text: 'mine',
          authorUid: 'author-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          author: authorInclude,
        },
        {
          uid: 'c2',
          newsItemUid: 'news-1',
          parentUid: null,
          text: 'someone else',
          authorUid: 'author-2',
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          author: { uid: 'author-2', name: 'Bob', image: null },
        },
      ]);

      const result = await service.listComments('news-1', 'author-1');

      expect(result.items[0].isOwn).toBe(true);
      expect(result.items[1].isOwn).toBe(false);
      expect(result.items[1].author.avatarUrl).toBeNull();
    });

    it('nests replies under their parent at unlimited depth', async () => {
      feedCommentFindMany.mockResolvedValue([
        {
          uid: 'root',
          newsItemUid: 'news-1',
          parentUid: null,
          text: 'root comment',
          authorUid: 'author-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          author: authorInclude,
        },
        {
          uid: 'child',
          newsItemUid: 'news-1',
          parentUid: 'root',
          text: 'first reply',
          authorUid: 'author-2',
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          author: { uid: 'author-2', name: 'Bob', image: null },
        },
        {
          uid: 'grandchild',
          newsItemUid: 'news-1',
          parentUid: 'child',
          text: 'reply to the reply',
          authorUid: 'author-1',
          createdAt: new Date('2026-01-03T00:00:00.000Z'),
          author: authorInclude,
        },
      ]);

      const result = await service.listComments('news-1');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].uid).toBe('root');
      expect(result.items[0].replies).toHaveLength(1);
      expect(result.items[0].replies[0].uid).toBe('child');
      expect(result.items[0].replies[0].replies).toHaveLength(1);
      expect(result.items[0].replies[0].replies[0].uid).toBe('grandchild');
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

      feedCommentGroupBy.mockResolvedValue([{ newsItemUid: 'news-1', _count: { _all: 3 } }]);
      const result = await service.getCommentCounts(['news-1', 'news-2']);

      expect(result).toEqual({ counts: { 'news-1': 3 } });
    });
  });
});
