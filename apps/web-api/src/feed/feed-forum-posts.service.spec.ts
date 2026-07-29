import type { ProtosphereApiClient } from '../forum/protosphere-api.client';
import { FeedForumPostsService } from './feed-forum-posts.service';

// protosphere-api.client.ts imports axios, which ships an ESM build jest
// can't transform — mock the whole module so it's never actually loaded,
// same workaround used elsewhere in this repo (e.g. team-news.service.spec.ts).
jest.mock('../forum/protosphere-api.client', () => ({}));

describe('FeedForumPostsService', () => {
  let service: FeedForumPostsService;

  const getRecentTopics = jest.fn();

  const protosphereApiClientMock = { getRecentTopics } as unknown as ProtosphereApiClient;

  const topic = {
    tid: 42,
    cid: 7,
    categoryName: 'General',
    title: '<b>Hello</b> &amp; welcome',
    timestamp: 1700000000000,
    postcount: 3,
    upvotes: 5,
    bodyHtml: '<p>Body one</p><p>Body two</p>',
    author: { memberUid: 'member-9', name: 'Ada', avatarUrl: null, role: 'Contributor' },
    forumTopicUrl: 'https://plnetwork.io/forum/topics/7/42',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getRecentTopics.mockResolvedValue([topic]);
    service = new FeedForumPostsService(protosphereApiClientMock);
  });

  it('maps a NodeBB topic to a feed forum post with fp_-prefixed uid and stripped html', async () => {
    const result = await service.listForumPosts({ limit: 20, page: 0 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      uid: 'fp_42',
      title: 'Hello & welcome',
      body: 'Body one Body two',
      author: topic.author,
      category: 'General',
      createdAt: new Date(1700000000000).toISOString(),
      forumTopicUrl: topic.forumTopicUrl,
      // postcount (3) minus the topic's own opening post
      commentCount: 2,
      likeCount: 5,
      viewerHasLiked: false,
    });
  });

  it('never returns a negative commentCount for a topic with only its opening post', async () => {
    getRecentTopics.mockResolvedValue([{ ...topic, postcount: 0 }]);

    const result = await service.listForumPosts({ limit: 20, page: 0 });

    expect(result.items[0].commentCount).toBe(0);
  });

  it('slices results to the requested limit', async () => {
    getRecentTopics.mockResolvedValue([topic, { ...topic, tid: 43 }, { ...topic, tid: 44 }]);

    const result = await service.listForumPosts({ limit: 2, page: 0 });

    expect(result.items).toHaveLength(2);
  });
});
