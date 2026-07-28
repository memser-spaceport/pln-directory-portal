import { PrismaService } from '../shared/prisma.service';
import type { ProtosphereApiClient } from '../forum/protosphere-api.client';
import { FeedCommentsService } from './feed-comments.service';
import { FeedForumPostsService } from './feed-forum-posts.service';

// protosphere-api.client.ts imports axios, which ships an ESM build jest
// can't transform — mock the whole module so it's never actually loaded,
// same workaround used elsewhere in this repo (e.g. team-news.service.spec.ts).
jest.mock('../forum/protosphere-api.client', () => ({}));

describe('FeedForumPostsService', () => {
  let service: FeedForumPostsService;

  const getRecentTopics = jest.fn();
  const feedForumPostLikeGroupBy = jest.fn();
  const feedForumPostLikeFindMany = jest.fn();
  const loadCommentCounts = jest.fn();

  const protosphereApiClientMock = { getRecentTopics } as unknown as ProtosphereApiClient;
  const prismaMock = {
    feedForumPostLike: { groupBy: feedForumPostLikeGroupBy, findMany: feedForumPostLikeFindMany },
  } as unknown as PrismaService;
  const feedCommentsServiceMock = { loadCommentCounts } as unknown as FeedCommentsService;

  const topic = {
    tid: 42,
    cid: 7,
    categoryName: 'General',
    title: '<b>Hello</b> &amp; welcome',
    timestamp: 1700000000000,
    postcount: 3,
    bodyHtml: '<p>Body one</p><p>Body two</p>',
    author: { memberUid: 'member-9', name: 'Ada', avatarUrl: null, role: 'Contributor' },
    forumTopicUrl: 'https://plnetwork.io/forum/topics/7/42',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getRecentTopics.mockResolvedValue([topic]);
    feedForumPostLikeGroupBy.mockResolvedValue([{ forumPostUid: 'fp_42', _count: { _all: 5 } }]);
    feedForumPostLikeFindMany.mockResolvedValue([{ forumPostUid: 'fp_42' }]);
    loadCommentCounts.mockResolvedValue(new Map([['fp_42', 2]]));
    service = new FeedForumPostsService(protosphereApiClientMock, prismaMock, feedCommentsServiceMock);
  });

  it('maps a NodeBB topic to a feed forum post with fp_-prefixed uid and stripped html', async () => {
    const result = await service.listForumPosts({ limit: 20, page: 0 }, 'member-viewer');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      uid: 'fp_42',
      title: 'Hello & welcome',
      body: 'Body one Body two',
      author: topic.author,
      category: 'General',
      createdAt: new Date(1700000000000).toISOString(),
      forumTopicUrl: topic.forumTopicUrl,
      commentCount: 2,
      likeCount: 5,
      viewerHasLiked: true,
    });
  });

  it('slices results to the requested limit before enrichment', async () => {
    getRecentTopics.mockResolvedValue([topic, { ...topic, tid: 43 }, { ...topic, tid: 44 }]);

    const result = await service.listForumPosts({ limit: 2, page: 0 });

    expect(result.items).toHaveLength(2);
  });

  it('returns viewerHasLiked false and skips the viewer query when there is no viewer', async () => {
    await service.listForumPosts({ limit: 20, page: 0 });

    expect(feedForumPostLikeFindMany).not.toHaveBeenCalled();
  });
});
