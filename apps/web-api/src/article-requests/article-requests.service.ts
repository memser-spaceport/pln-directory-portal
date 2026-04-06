import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import {
  CreateArticleRequestDto,
  ListArticleRequestsQueryDto,
  UpdateArticleRequestDto,
} from './article-requests.dto';

@Injectable()
export class ArticleRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizePagination(page = 1, limit = 20) {
    const safePage = Number.isFinite(Number(page)) ? Math.max(1, Number(page)) : 1;
    const safeLimit = Number.isFinite(Number(limit)) ? Math.min(1000, Math.max(1, Number(limit))) : 20;

    return {
      page: safePage,
      limit: safeLimit,
      skip: (safePage - 1) * safeLimit,
    };
  }

  private async resolveMemberByEmail(userEmail: string | undefined) {
    if (!userEmail) {
      throw new UnauthorizedException('User email not found');
    }

    const member = await this.prisma.member.findFirst({
      where: { email: userEmail },
      select: { uid: true },
    });

    if (!member) {
      throw new UnauthorizedException('Member not found');
    }

    return member;
  }

  async create(
    userEmail: string | undefined,
    articleUidFromParam: string | undefined,
    body: CreateArticleRequestDto,
  ) {
    const member = await this.resolveMemberByEmail(userEmail);

    const resolvedArticleUid = (articleUidFromParam ?? body?.articleUid)?.trim() || undefined;
    const title = body?.title?.trim();
    const description = body?.description?.trim();

    if (!title) {
      throw new BadRequestException('Title is required');
    }

    if (resolvedArticleUid) {
      const article = await this.prisma.article.findUnique({
        where: { uid: resolvedArticleUid },
        select: { uid: true },
      });

      if (!article) {
        throw new NotFoundException('Article not found');
      }

      const existing = await this.prisma.articleRequest.findUnique({
        where: {
          articleUid_requestedByUserUid: {
            articleUid: resolvedArticleUid,
            requestedByUserUid: member.uid,
          },
        },
        select: { uid: true },
      });

      if (existing) {
        return {
          uid: existing.uid,
          articleUid: resolvedArticleUid,
          requestedByUserUid: member.uid,
          alreadyExists: true,
        };
      }
    }

    const created = await this.prisma.articleRequest.create({
      data: {
        ...(resolvedArticleUid ? { articleUid: resolvedArticleUid } : {}),
        title,
        ...(description ? { description } : {}),
        requestedByUserUid: member.uid,
      },
      select: {
        uid: true,
        articleUid: true,
        title: true,
        description: true,
        requestedByUserUid: true,
        requestedDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ...created,
      alreadyExists: false,
    };
  }

  private buildWhere(query: ListArticleRequestsQueryDto): Prisma.ArticleRequestWhereInput {
    return {
      ...(query?.articleUid ? { articleUid: query.articleUid } : {}),
      ...(query?.requestedByUserUid ? { requestedByUserUid: query.requestedByUserUid } : {}),
      ...(query?.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { requestedByUserUid: { contains: query.search, mode: 'insensitive' } },
              {
                requestedByUser: {
                  OR: [
                    { name: { contains: query.search, mode: 'insensitive' } },
                    { email: { contains: query.search, mode: 'insensitive' } },
                  ],
                },
              },
              {
                article: {
                  OR: [
                    { title: { contains: query.search, mode: 'insensitive' } },
                    { summary: { contains: query.search, mode: 'insensitive' } },
                    { category: { contains: query.search, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {}),
    };
  }

  async adminList(query: ListArticleRequestsQueryDto) {
    const { page, limit, skip } = this.normalizePagination(query.page, query.limit);
    const where = this.buildWhere(query);

    const [total, items] = await Promise.all([
      this.prisma.articleRequest.count({ where }),
      this.prisma.articleRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { requestedDate: 'desc' },
        select: {
          uid: true,
          articleUid: true,
          title: true,
          description: true,
          requestedByUserUid: true,
          requestedDate: true,
          createdAt: true,
          updatedAt: true,
          requestedByUser: {
            select: {
              uid: true,
              name: true,
              email: true,
              image: { select: { uid: true, url: true } },
            },
          },
          article: {
            select: {
              uid: true,
              title: true,
              slugURL: true,
              category: true,
              status: true,
            },
          },
        },
      }),
    ]);

    return { page, limit, total, items };
  }

  async adminGetByUid(uid: string) {
    const item = await this.prisma.articleRequest.findUnique({
      where: { uid },
      select: {
        uid: true,
        articleUid: true,
        title: true,
        description: true,
        requestedByUserUid: true,
        requestedDate: true,
        createdAt: true,
        updatedAt: true,
        requestedByUser: {
          select: {
            uid: true,
            name: true,
            email: true,
            image: { select: { uid: true, url: true } },
          },
        },
        article: {
          select: {
            uid: true,
            title: true,
            slugURL: true,
            category: true,
            status: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Article request not found');
    }

    return item;
  }

  async adminUpdate(uid: string, body: UpdateArticleRequestDto) {
    const data: Prisma.ArticleRequestUpdateInput = {};

    if (typeof body?.title === 'string') {
      const title = body.title.trim();
      if (!title) {
        throw new BadRequestException('Title cannot be empty');
      }
      data.title = title;
    }

    if (typeof body?.description === 'string') {
      const description = body.description.trim();
      if (!description) {
        throw new BadRequestException('Description cannot be empty');
      }
      data.description = description;
    }

    if (!Object.keys(data).length) {
      throw new BadRequestException('No fields to update');
    }

    try {
      return await this.prisma.articleRequest.update({
        where: { uid },
        data,
        select: {
          uid: true,
          articleUid: true,
          title: true,
          description: true,
          requestedByUserUid: true,
          requestedDate: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new NotFoundException('Article request not found');
      }
      throw error;
    }
  }

  async getByUidForUser(userEmail: string | undefined, requestUid: string) {
    const member = await this.resolveMemberByEmail(userEmail);

    const request = await this.prisma.articleRequest.findFirst({
      where: {
        uid: requestUid,
        requestedByUserUid: member.uid,
      },
      select: {
        uid: true,
        articleUid: true,
        title: true,
        description: true,
        requestedByUserUid: true,
        requestedDate: true,
        createdAt: true,
        updatedAt: true,
        article: {
          select: {
            uid: true,
            title: true,
            slugURL: true,
            category: true,
            status: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Article request not found');
    }

    return request;
  }
}
