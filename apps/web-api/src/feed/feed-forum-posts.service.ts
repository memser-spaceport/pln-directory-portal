import { Injectable } from '@nestjs/common';
import type { FeedForumPost, FeedForumPostsQuery, FeedForumPostsResponse } from 'libs/contracts/src/schema/feed';
import { NodeBBRecentTopic, ProtosphereApiClient } from '../forum/protosphere-api.client';
import { stripHtmlToPlainText } from '../utils/html-to-text';

const FORUM_POST_PREFIX = 'fp_';

@Injectable()
export class FeedForumPostsService {
  constructor(private readonly protosphereApiClient: ProtosphereApiClient) {}

  async listForumPosts(query: FeedForumPostsQuery): Promise<FeedForumPostsResponse> {
    const topics = await this.protosphereApiClient.getRecentTopics({ page: query.page || undefined });
    const limited = topics.slice(0, query.limit);

    return {
      items: limited.map((topic) => this.toDto(topic)),
    };
  }

  private toDto(topic: NodeBBRecentTopic): FeedForumPost {
    return {
      uid: `${FORUM_POST_PREFIX}${topic.tid}`,
      title: stripHtmlToPlainText(topic.title),
      body: stripHtmlToPlainText(topic.bodyHtml),
      author: topic.author,
      category: topic.categoryName,
      createdAt: new Date(topic.timestamp).toISOString(),
      forumTopicUrl: topic.forumTopicUrl,
      commentCount: Math.max(topic.postcount - 1, 0),
      likeCount: topic.upvotes,
      // /api/recent is guest-level and carries no per-viewer vote state.
      viewerHasLiked: false,
    };
  }
}
