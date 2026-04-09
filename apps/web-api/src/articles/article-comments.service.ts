import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { CreateArticleCommentDto, UpdateArticleCommentDto } from './article-comments.dto';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

type ArticleCommentResponse = {
  uid: string;
  articleUid: string;
  parentUid: string | null;
  content: string;
  likesCount: number;
  createdAt: Date;
  updatedAt: Date;
  likedByMe: boolean;
  author: {
    uid: string;
    name: string | null;
    officeHours: string | null;
    profileImage: string | null;
  };
  replies: ArticleCommentResponse[];
};

@Injectable()
export class ArticleCommentsService {
  private readonly logger = new Logger(ArticleCommentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotificationsService: PushNotificationsService
  ) {}

  private async resolveMemberByEmail(userEmail: string) {
    if (!userEmail) {
      throw new UnauthorizedException('User email not found');
    }

    const member = await this.prisma.member.findFirst({
      where: { email: userEmail },
      select: { uid: true, email: true, name: true, officeHours: true, image: true },
    });

    if (!member) {
      throw new UnauthorizedException('Member not found');
    }

    return member;
  }

  private async ensurePublishedArticle(articleUid: string) {
    const article = await this.prisma.article.findFirst({
      where: {
        uid: articleUid,
        isDeleted: false,
        status: 'PUBLISHED',
      },
      select: { uid: true },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    return article;
  }

  private mapComment(comment: any, likedByMe: boolean): ArticleCommentResponse {
    return {
      uid: comment.uid,
      articleUid: comment.articleUid,
      parentUid: comment.parentUid,
      content: comment.content,
      likesCount: comment.likesCount,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      likedByMe,
      author: {
        uid: comment.author.uid,
        name: comment.author.name,
        officeHours: comment.author.officeHours,
        profileImage: comment.author.image?.url ?? null,
      },
      replies: [],
    };
  }

  private async getCommentForOwnerCheck(commentUid: string) {
    const comment = await this.prisma.articleComment.findUnique({
      where: { uid: commentUid },
      select: {
        uid: true,
        articleUid: true,
        authorUid: true,
        parentUid: true,
      },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    return comment;
  }

  async createComment(userEmail: string, articleUid: string, body: CreateArticleCommentDto) {
    const member = await this.resolveMemberByEmail(userEmail);
    await this.ensurePublishedArticle(articleUid);

    const content = (body.content || '').trim();
    if (!content) {
      throw new BadRequestException('Comment content is required');
    }

    let parentUid: string | null = null;

    if (body.parentUid) {
      const parent = await this.prisma.articleComment.findFirst({
        where: { uid: body.parentUid, articleUid },
        select: { uid: true },
      });

      if (!parent) {
        throw new BadRequestException('Parent comment not found for this article');
      }

      parentUid = parent.uid;
    }

    const created = await this.prisma.articleComment.create({
      data: {
        articleUid,
        parentUid,
        content,
        authorUid: member.uid,
      },
      include: {
        author: {
          select: {
            uid: true,
            name: true,
            officeHours: true,
            image: { select: { url: true } },
          },
        },
      },
    });

    // Fire-and-forget: send notifications
    this.sendCommentNotifications(
      { uid: created.uid, parentUid: created.parentUid, content: created.content, articleUid },
      { uid: member.uid, name: member.name, image: member.image }
    ).catch((err) => {
      this.logger.error(`Failed to send guide comment notifications: ${err?.message}`);
    });

    return this.mapComment(created, false);
  }

  async listComments(userEmail: string | undefined, articleUid: string) {
    await this.ensurePublishedArticle(articleUid);

    const member = userEmail ? await this.resolveMemberByEmail(userEmail).catch(() => null) : null;

    const comments = await this.prisma.articleComment.findMany({
      where: { articleUid },
      orderBy: [{ createdAt: 'asc' }],
      include: {
        author: {
          select: {
            uid: true,
            name: true,
            officeHours: true,
            image: { select: { url: true } },
          },
        },
        likes: member
          ? {
              where: { memberUid: member.uid },
              select: { uid: true },
            }
          : false,
      },
    });

    const mapped: ArticleCommentResponse[] = comments.map((comment) =>
      this.mapComment(comment, Array.isArray(comment.likes) ? comment.likes.length > 0 : false)
    );

    const byUid = new Map<string, ArticleCommentResponse>(mapped.map((comment) => [comment.uid, comment]));

    const roots: ArticleCommentResponse[] = [];

    for (const comment of mapped) {
      if (comment.parentUid) {
        const parent = byUid.get(comment.parentUid);
        if (parent) {
          parent.replies.push(comment);
          continue;
        }
      }
      roots.push(comment);
    }

    return {
      data: roots,
      total: mapped.length,
    };
  }

  async updateComment(userEmail: string, commentUid: string, body: UpdateArticleCommentDto) {
    const member = await this.resolveMemberByEmail(userEmail);

    const content = (body.content || '').trim();
    if (!content) {
      throw new BadRequestException('Comment content is required');
    }

    const comment = await this.getCommentForOwnerCheck(commentUid);

    if (comment.authorUid !== member.uid) {
      throw new ForbiddenException('You can edit only your own comment');
    }

    await this.ensurePublishedArticle(comment.articleUid);

    const updated = await this.prisma.articleComment.update({
      where: { uid: commentUid },
      data: { content },
      include: {
        author: {
          select: {
            uid: true,
            name: true,
            officeHours: true,
            image: { select: { url: true } },
          },
        },
        likes: {
          where: { memberUid: member.uid },
          select: { uid: true },
        },
      },
    });

    return this.mapComment(updated, updated.likes.length > 0);
  }

  async deleteComment(userEmail: string, commentUid: string) {
    const member = await this.resolveMemberByEmail(userEmail);

    const comment = await this.getCommentForOwnerCheck(commentUid);

    if (comment.authorUid !== member.uid) {
      throw new ForbiddenException('You can delete only your own comment');
    }

    await this.prisma.articleComment.delete({
      where: { uid: commentUid },
    });

    return {
      uid: commentUid,
      deleted: true,
    };
  }

  async likeComment(userEmail: string, commentUid: string) {
    const member = await this.resolveMemberByEmail(userEmail);

    const comment = await this.prisma.articleComment.findUnique({
      where: { uid: commentUid },
      select: { uid: true },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const existing = await this.prisma.articleCommentLike.findUnique({
      where: {
        commentUid_memberUid: {
          commentUid,
          memberUid: member.uid,
        },
      },
      select: { uid: true },
    });

    if (!existing) {
      await this.prisma.$transaction([
        this.prisma.articleCommentLike.create({
          data: {
            commentUid,
            memberUid: member.uid,
          },
        }),
        this.prisma.articleComment.update({
          where: { uid: commentUid },
          data: { likesCount: { increment: 1 } },
        }),
      ]);
    }

    const updated = await this.prisma.articleComment.findUnique({
      where: { uid: commentUid },
      select: { uid: true, likesCount: true },
    });

    return {
      uid: updated!.uid,
      likesCount: updated!.likesCount,
      likedByMe: true,
    };
  }

  async unlikeComment(userEmail: string, commentUid: string) {
    const member = await this.resolveMemberByEmail(userEmail);

    const existing = await this.prisma.articleCommentLike.findUnique({
      where: {
        commentUid_memberUid: {
          commentUid,
          memberUid: member.uid,
        },
      },
      select: { uid: true },
    });

    const comment = await this.prisma.articleComment.findUnique({
      where: { uid: commentUid },
      select: { uid: true, likesCount: true },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (existing) {
      await this.prisma.$transaction([
        this.prisma.articleCommentLike.delete({
          where: {
            commentUid_memberUid: {
              commentUid,
              memberUid: member.uid,
            },
          },
        }),
        this.prisma.articleComment.update({
          where: { uid: commentUid },
          data: {
            likesCount: comment.likesCount > 0 ? { decrement: 1 } : undefined,
          },
        }),
      ]);
    }

    const updated = await this.prisma.articleComment.findUnique({
      where: { uid: commentUid },
      select: { uid: true, likesCount: true },
    });

    return {
      uid: updated!.uid,
      likesCount: Math.max(updated!.likesCount, 0),
      likedByMe: false,
    };
  }

  private async sendCommentNotifications(
    comment: { uid: string; parentUid: string | null; content: string; articleUid: string },
    commentAuthor: { uid: string; name: string | null; image?: { url: string } | null }
  ): Promise<void> {
    const article = await this.prisma.article.findUnique({
      where: { uid: comment.articleUid },
      select: {
        uid: true,
        title: true,
        slugURL: true,
        authorMemberUid: true,
        authorTeamUid: true,
      },
    });

    if (!article) return;

    const link = `/founder-guides/${article.slugURL}`;
    const recipientUids = new Set<string>();

    // Scenario 1: Top-level comment → notify article author (+ team leads if team-authored)
    if (!comment.parentUid) {
      if (article.authorMemberUid && article.authorMemberUid !== commentAuthor.uid) {
        recipientUids.add(article.authorMemberUid);
        await this.pushNotificationsService.sendGuideCommentNotification({
          recipientUid: article.authorMemberUid,
          category: 'GUIDE_POST',
          commentAuthor,
          articleTitle: article.title,
          commentContent: comment.content,
          link,
          eventType: 'guide_comment',
        });
      }

      if (article.authorTeamUid) {
        const teamLeads = await this.resolveTeamLeads(article.authorTeamUid, commentAuthor.uid);
        for (const lead of teamLeads) {
          if (!recipientUids.has(lead.uid)) {
            recipientUids.add(lead.uid);
            await this.pushNotificationsService.sendGuideCommentNotification({
              recipientUid: lead.uid,
              category: 'GUIDE_POST',
              commentAuthor,
              articleTitle: article.title,
              commentContent: comment.content,
              link,
              eventType: 'guide_comment',
            });
          }
        }
      }
    }

    // Scenario 2: Reply → notify parent comment author
    if (comment.parentUid) {
      const parentComment = await this.prisma.articleComment.findUnique({
        where: { uid: comment.parentUid },
        select: { authorUid: true },
      });

      if (parentComment && parentComment.authorUid !== commentAuthor.uid) {
        if (!recipientUids.has(parentComment.authorUid)) {
          recipientUids.add(parentComment.authorUid);
          await this.pushNotificationsService.sendGuideCommentNotification({
            recipientUid: parentComment.authorUid,
            category: 'GUIDE_REPLY',
            commentAuthor,
            articleTitle: article.title,
            commentContent: comment.content,
            link,
            eventType: 'guide_reply',
          });
        }
      }
    }

    // Scenario 3: Mentions → notify mentioned members
    const mentionedUids = this.extractMentionUids(comment.content);
    for (const mentionedUid of mentionedUids) {
      if (mentionedUid !== commentAuthor.uid && !recipientUids.has(mentionedUid)) {
        recipientUids.add(mentionedUid);
        await this.pushNotificationsService.sendGuideCommentNotification({
          recipientUid: mentionedUid,
          category: comment.parentUid ? 'GUIDE_REPLY' : 'GUIDE_POST',
          commentAuthor,
          articleTitle: article.title,
          commentContent: comment.content,
          link,
          eventType: 'guide_mention',
        });
      }
    }
  }

  private async resolveTeamLeads(teamUid: string, excludeUid: string): Promise<Array<{ uid: string }>> {
    const teamLeadRoles = await this.prisma.teamMemberRole.findMany({
      where: {
        teamUid,
        teamLead: true,
        memberUid: { not: excludeUid },
      },
      select: { memberUid: true },
    });

    return teamLeadRoles.map((r) => ({ uid: r.memberUid }));
  }

  private extractMentionUids(content: string): string[] {
    const regex = /data-uid="([^"]+)"/g;
    const uids: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (match[1] && !uids.includes(match[1])) {
        uids.push(match[1]);
      }
    }
    return uids;
  }
}
