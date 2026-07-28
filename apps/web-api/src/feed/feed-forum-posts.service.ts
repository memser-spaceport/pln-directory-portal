import { Injectable } from '@nestjs/common';
import type { FeedForumPost, FeedForumPostsQuery, FeedForumPostsResponse } from 'libs/contracts/src/schema/feed';
import { NodeBBRecentTopic, ProtosphereApiClient } from '../forum/protosphere-api.client';
import { stripHtmlToPlainText } from '../utils/html-to-text';
import { PrismaService } from '../shared/prisma.service';
import { FeedCommentsService } from './feed-comments.service';

const FORUM_POST_PREFIX = 'fp_';

interface LikeStamp {
  counts: Map<string, number>;
  viewerLiked: Set<string>;
}

@Injectable()
export class FeedForumPostsService {
  constructor(
    private readonly protosphereApiClient: ProtosphereApiClient,
    private readonly prisma: PrismaService,
    private readonly feedCommentsService: FeedCommentsService
  ) {}

  async listForumPosts(query: FeedForumPostsQuery, viewerMemberUid?: string): Promise<FeedForumPostsResponse> {
    const topics = await this.protosphereApiClient.getRecentTopics({ page: query.page || undefined });
    const limited = topics.slice(0, query.limit);
    const uids = limited.map((topic) => `${FORUM_POST_PREFIX}${topic.tid}`);

    const [commentCounts, likes] = await Promise.all([
      this.feedCommentsService.loadCommentCounts(uids),
      this.loadLikes(uids, viewerMemberUid),
    ]);

    return {
      items: limited.map((topic) => this.toDto(topic, commentCounts, likes)),
    };
  }

  private toDto(topic: NodeBBRecentTopic, commentCounts: Map<string, number>, likes: LikeStamp): FeedForumPost {
    const uid = `${FORUM_POST_PREFIX}${topic.tid}`;
    return {
      uid,
      title: stripHtmlToPlainText(topic.title),
      body: stripHtmlToPlainText(topic.bodyHtml),
      author: topic.author,
      category: topic.categoryName,
      createdAt: new Date(topic.timestamp).toISOString(),
      forumTopicUrl: topic.forumTopicUrl,
      commentCount: commentCounts.get(uid) ?? 0,
      likeCount: likes.counts.get(uid) ?? 0,
      viewerHasLiked: likes.viewerLiked.has(uid),
    };
  }

  /** Same groupBy + viewer-scoped findMany batching pattern as TeamNewsQueryService.loadUpvotes. */
  private async loadLikes(uids: string[], viewerMemberUid?: string): Promise<LikeStamp> {
    if (uids.length === 0) {
      return { counts: new Map(), viewerLiked: new Set() };
    }

    const [grouped, viewerRows] = await Promise.all([
      this.prisma.feedForumPostLike.groupBy({
        by: ['forumPostUid'],
        where: { forumPostUid: { in: uids } },
        _count: { _all: true },
      }),
      viewerMemberUid
        ? this.prisma.feedForumPostLike.findMany({
            where: { forumPostUid: { in: uids }, memberUid: viewerMemberUid },
            select: { forumPostUid: true },
          })
        : Promise.resolve([] as Array<{ forumPostUid: string }>),
    ]);

    return {
      counts: new Map(grouped.map((g) => [g.forumPostUid, g._count._all])),
      viewerLiked: new Set(viewerRows.map((r) => r.forumPostUid)),
    };
  }
}
