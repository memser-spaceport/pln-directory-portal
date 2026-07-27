import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateFeedCommentRequest,
  FeedComment,
  FeedCommentCountsResponse,
  FeedCommentsResponse,
  DeleteFeedCommentResponse,
} from 'libs/contracts/src/schema/feed';
import { PrismaService } from '../shared/prisma.service';

const FORUM_POST_PREFIX = 'fp_';

@Injectable()
export class FeedCommentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Batch comment counts for a list of feed item uids (news items or forum posts). */
  async getCommentCounts(uids: string[]): Promise<FeedCommentCountsResponse> {
    const counts = await this.loadCommentCounts(uids);
    return { counts: Object.fromEntries(counts) };
  }

  async listComments(itemUid: string, viewerMemberUid?: string): Promise<FeedCommentsResponse> {
    const comments = await this.prisma.feedComment.findMany({
      where: { itemUid },
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: { uid: true, name: true, image: { select: { url: true } } },
        },
      },
    });

    return {
      items: comments.map((comment) => this.toDto(comment, viewerMemberUid)),
    };
  }

  async createComment(memberUid: string, request: CreateFeedCommentRequest): Promise<FeedComment> {
    const { itemUid, text } = request;
    const itemType = itemUid.startsWith(FORUM_POST_PREFIX) ? 'FORUM_POST' : 'NEWS';

    if (itemType === 'NEWS') {
      const newsItem = await this.prisma.teamNewsItem.findUnique({ where: { uid: itemUid }, select: { uid: true } });
      if (!newsItem) {
        throw new NotFoundException(`News item with uid ${itemUid} not found`);
      }
    }
    // FORUM_POST uids are a soft reference to NodeBB-backed feed items with no
    // local table, so there's nothing to validate against locally (mirrors
    // FeedForumPostLike's soft-reference design).

    const comment = await this.prisma.feedComment.create({
      data: { itemType, itemUid, text, authorUid: memberUid },
      include: {
        author: {
          select: { uid: true, name: true, image: { select: { url: true } } },
        },
      },
    });

    return this.toDto(comment, memberUid);
  }

  async deleteComment(memberUid: string, commentUid: string): Promise<DeleteFeedCommentResponse> {
    const comment = await this.prisma.feedComment.findUnique({ where: { uid: commentUid } });
    if (!comment) {
      throw new NotFoundException(`Comment with uid ${commentUid} not found`);
    }
    if (comment.authorUid !== memberUid) {
      throw new ForbiddenException('You can only delete your own comment');
    }

    await this.prisma.feedComment.delete({ where: { uid: commentUid } });
    return { uid: commentUid, deleted: true };
  }

  /** Same groupBy-by-item-uid batching pattern as TeamNewsQueryService.loadUpvotes. */
  async loadCommentCounts(uids: string[]): Promise<Map<string, number>> {
    if (uids.length === 0) return new Map();
    const grouped = await this.prisma.feedComment.groupBy({
      by: ['itemUid'],
      where: { itemUid: { in: uids } },
      _count: { _all: true },
    });
    return new Map(grouped.map((g) => [g.itemUid, g._count._all]));
  }

  private toDto(
    comment: {
      uid: string;
      itemUid: string;
      text: string;
      authorUid: string;
      createdAt: Date;
      author: { uid: string; name: string; image: { url: string } | null };
    },
    viewerMemberUid?: string
  ): FeedComment {
    return {
      uid: comment.uid,
      itemUid: comment.itemUid,
      text: comment.text,
      author: {
        uid: comment.author.uid,
        name: comment.author.name ?? null,
        avatarUrl: comment.author.image?.url ?? null,
      },
      createdAt: comment.createdAt.toISOString(),
      isOwn: comment.authorUid === viewerMemberUid,
    };
  }
}
