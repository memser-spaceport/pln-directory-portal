import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PushNotificationCategory } from '@prisma/client';
import type {
  CreateFeedCommentRequest,
  FeedComment,
  FeedCommentCountsResponse,
  FeedCommentsResponse,
  DeleteFeedCommentResponse,
} from 'libs/contracts/src/schema/feed';
import { PrismaService } from '../shared/prisma.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

type CommentRow = {
  uid: string;
  newsItemUid: string;
  parentUid: string | null;
  text: string;
  authorUid: string;
  createdAt: Date;
  author: { uid: string; name: string; image: { url: string } | null };
};

@Injectable()
export class FeedCommentsService {
  private readonly logger = new Logger(FeedCommentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotificationsService: PushNotificationsService
  ) {}

  /** Batch comment counts for a list of news item uids. Includes replies at any depth. */
  async getCommentCounts(uids: string[]): Promise<FeedCommentCountsResponse> {
    const counts = await this.loadCommentCounts(uids);
    return { counts: Object.fromEntries(counts) };
  }

  /** Threaded, unlimited-depth reply tree — same parent/child assembly as ArticleCommentsService.listComments. */
  async listComments(newsItemUid: string, viewerMemberUid?: string): Promise<FeedCommentsResponse> {
    const comments = await this.prisma.feedComment.findMany({
      where: { newsItemUid },
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: { uid: true, name: true, image: { select: { url: true } } },
        },
      },
    });

    const mapped = comments.map((comment) => this.toDto(comment, viewerMemberUid));
    const byUid = new Map(mapped.map((comment) => [comment.uid, comment]));

    const roots: FeedComment[] = [];
    for (const comment of mapped) {
      const parent = comment.parentUid ? byUid.get(comment.parentUid) : undefined;
      if (parent) {
        parent.replies.push(comment);
      } else {
        roots.push(comment);
      }
    }

    return { items: roots };
  }

  async createComment(memberUid: string, request: CreateFeedCommentRequest): Promise<FeedComment> {
    const { newsItemUid, parentUid, text } = request;

    const newsItem = await this.prisma.teamNewsItem.findUnique({
      where: { uid: newsItemUid },
      select: { uid: true, title: true },
    });
    if (!newsItem) {
      throw new NotFoundException(`News item with uid ${newsItemUid} not found`);
    }

    let parentAuthorUid: string | undefined;
    if (parentUid) {
      const parent = await this.prisma.feedComment.findFirst({
        where: { uid: parentUid, newsItemUid },
        select: { uid: true, authorUid: true },
      });
      if (!parent) {
        throw new BadRequestException('Parent comment not found for this news item');
      }
      parentAuthorUid = parent.authorUid;
    }

    const comment = await this.prisma.feedComment.create({
      data: { newsItemUid, parentUid: parentUid ?? null, text, authorUid: memberUid },
      include: {
        author: {
          select: { uid: true, name: true, image: { select: { url: true } } },
        },
      },
    });

    await this.notifyCommentRecipients(comment, newsItem.title, parentAuthorUid);

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

    // onDelete: Cascade on FeedComment.parentUid takes replies (at any depth) down with it.
    await this.prisma.feedComment.delete({ where: { uid: commentUid } });
    return { uid: commentUid, deleted: true };
  }

  /** Same groupBy-by-news-item-uid batching pattern as TeamNewsQueryService.loadUpvotes. */
  async loadCommentCounts(uids: string[]): Promise<Map<string, number>> {
    if (uids.length === 0) return new Map();
    const grouped = await this.prisma.feedComment.groupBy({
      by: ['newsItemUid'],
      where: { newsItemUid: { in: uids } },
      _count: { _all: true },
    });
    return new Map(grouped.map((g) => [g.newsItemUid, g._count._all]));
  }

  private async notifyCommentRecipients(
    comment: CommentRow,
    newsTitle: string,
    parentAuthorUid?: string
  ): Promise<void> {
    const authorName = comment.author.name || 'Someone';
    const description = comment.text
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
    const notified = new Set<string>();

    const mentionedUids = this.extractMentionUids(comment.text).filter((uid) => uid !== comment.authorUid);
    for (const recipientUid of mentionedUids) {
      notified.add(recipientUid);
      await this.sendNewsCommentNotification({
        recipientUid,
        title: `${authorName} mentioned you in "${newsTitle}"`,
        description,
        comment,
        authorName,
        eventType: 'team_news_mention',
      });
    }

    if (parentAuthorUid && parentAuthorUid !== comment.authorUid && !notified.has(parentAuthorUid)) {
      await this.sendNewsCommentNotification({
        recipientUid: parentAuthorUid,
        title: `${authorName} replied to your comment on "${newsTitle}"`,
        description,
        comment,
        authorName,
        eventType: 'team_news_reply',
      });
    }
  }

  private async sendNewsCommentNotification(params: {
    recipientUid: string;
    title: string;
    description: string;
    comment: CommentRow;
    authorName: string;
    eventType: 'team_news_mention' | 'team_news_reply';
  }): Promise<void> {
    const { recipientUid, title, description, comment, authorName, eventType } = params;
    try {
      await this.pushNotificationsService.create({
        category: PushNotificationCategory.TEAM_NEWS,
        title,
        description,
        link: `/home?news=${comment.newsItemUid}`,
        recipientUid,
        isPublic: false,
        metadata: {
          eventType,
          newsItemUid: comment.newsItemUid,
          commentUid: comment.uid,
          authorUid: comment.authorUid,
          authorName,
          authorPicture: comment.author.image?.url ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to send ${eventType} notification to ${recipientUid}: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }

  private extractMentionUids(content: string): string[] {
    const regex = /<a\b(?=[^>]*class="ql-mention")[^>]*data-uid="([^"]*)"[^>]*>/g;
    const uids: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (match[1] && !uids.includes(match[1])) {
        uids.push(match[1]);
      }
    }
    return uids;
  }

  private toDto(comment: CommentRow, viewerMemberUid?: string): FeedComment {
    return {
      uid: comment.uid,
      newsItemUid: comment.newsItemUid,
      parentUid: comment.parentUid,
      text: comment.text,
      author: {
        uid: comment.author.uid,
        name: comment.author.name ?? null,
        avatarUrl: comment.author.image?.url ?? null,
      },
      createdAt: comment.createdAt.toISOString(),
      isOwn: comment.authorUid === viewerMemberUid,
      replies: [],
    };
  }
}
