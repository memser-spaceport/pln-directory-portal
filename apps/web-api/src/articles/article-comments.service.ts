import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { CreateArticleCommentDto } from './article-comments.dto';

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
  constructor(private readonly prisma: PrismaService) {}

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

    return this.mapComment(created, false);
  }

  async listComments(userEmail: string | undefined, articleUid: string) {
    await this.ensurePublishedArticle(articleUid);

    const member = userEmail
      ? await this.resolveMemberByEmail(userEmail).catch(() => null)
      : null;

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
      this.mapComment(comment, Array.isArray(comment.likes) ? comment.likes.length > 0 : false),
    );

    const byUid = new Map<string, ArticleCommentResponse>(
      mapped.map((comment) => [comment.uid, comment]),
    );

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
}
