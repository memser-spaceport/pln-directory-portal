import {ForbiddenException, Injectable, NotFoundException, UnauthorizedException} from '@nestjs/common';
import {ArticleStatus, Prisma} from '@prisma/client';
import {PrismaService} from '../shared/prisma.service';
import {CreateArticleDto, ListArticlesQueryDto, UpdateArticleDto} from './articles.dto';
import type {ArticleCategory} from './articles.constants';
import {ARTICLE_CATEGORY_DESCRIPTIONS, WORDS_PER_MINUTE} from './articles.constants';

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Helpers ────────────────────────────────────────────────────────────

  private async resolveMemberByEmail(userEmail: string) {
    if (!userEmail) {
      throw new UnauthorizedException('User email not found');
    }

    const member = await this.prisma.member.findFirst({
      where: { email: userEmail },
      select: {
        uid: true,
        email: true,
        name: true,
        teamMemberRoles: {
          where: { mainTeam: true },
          select: { teamUid: true },
          take: 1,
        },
      },
    });

    if (!member) {
      throw new UnauthorizedException('Member not found');
    }

    return {
      memberUid: member.uid,
      teamUid: member.teamMemberRoles?.[0]?.teamUid ?? null,
    };
  }


  private async ensureArticleOwnership(articleUid: string, memberUid: string, teamUid: string | null) {
    const article = await this.prisma.article.findFirst({
      where: {
        uid: articleUid,
        isDeleted: false,
        OR: [{ authorMemberUid: memberUid }, ...(teamUid ? [{ authorTeamUid: teamUid }] : [])],
      },
    });

    if (!article) {
      throw new ForbiddenException('You do not have permission to edit this article');
    }

    return article;
  }

  private buildArticleWhere(query: ListArticlesQueryDto, status?: ArticleStatus): Prisma.ArticleWhereInput {
    return {
      isDeleted: false,
      ...(status ? { status } : {}),
      ...(query?.category ? { category: query.category } : {}),
      ...(query?.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { summary: { contains: query.search, mode: 'insensitive' } },
              { content: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private async generateSlug(title: string): Promise<string> {
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    let slug = base;
    let suffix = 1;

    while (await this.prisma.article.findUnique({ where: { slugURL: slug } })) {
      suffix++;
      slug = `${base}-${suffix}`;
    }

    return slug;
  }

  private calculateReadingTime(content: string): number {
    const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
  }

  private readonly articleInclude = {
    coverImage: { select: { uid: true, url: true } },
    authorMember: {
      select: {
        uid: true,
        name: true,
        email: true,
        officeHours: true,
        image: { select: { url: true } },
      },
    },
    authorTeam: {
      select: {
        uid: true,
        name: true,
        officeHours: true,
        logo: { select: { url: true } },
      },
    },
  };

  // ── Public ─────────────────────────────────────────────────────────────

  async listPublished(query: ListArticlesQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where = this.buildArticleWhere(query, ArticleStatus.PUBLISHED);

    let orderBy: Prisma.ArticleOrderByWithRelationInput;
    switch (query.sort) {
      case 'alphabetical':
        orderBy = { title: 'asc' };
        break;
      case 'mostViewed':
        orderBy = { publishedAt: 'desc' };
        break;
      case 'mostRecent':
      default:
        orderBy = { publishedAt: 'desc' };
        break;
    }

    const [articles, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: this.articleInclude,
      }),
      this.prisma.article.count({ where }),
    ]);

    if (!articles.length) {
      return { data: [], total, page, limit };
    }

    const articleUids = articles.map((a) => a.uid);

    const statsAgg = await this.prisma.articleStatistic.groupBy({
      by: ['articleUid'],
      where: { articleUid: { in: articleUids } },
      _sum: { viewCount: true },
      _count: { _all: true },
    });

    const likeCounts = await this.prisma.articleStatistic.groupBy({
      by: ['articleUid'],
      where: { articleUid: { in: articleUids }, likeCount: { gt: 0 } },
      _count: { _all: true },
    });

    const viewMap = new Map(statsAgg.map((s) => [s.articleUid, s._sum.viewCount ?? 0]));
    const likeMap = new Map(likeCounts.map((s) => [s.articleUid, s._count._all]));

    let data = articles.map((article) => ({
      ...article,
      totalViews: viewMap.get(article.uid) ?? 0,
      totalLikes: likeMap.get(article.uid) ?? 0,
    }));

    if (query.sort === 'mostViewed') {
      data = data.sort((a, b) => b.totalViews - a.totalViews);
    }

    return { data, total, page, limit };
  }

  async getByUidOrSlug(param: string, userEmail?: string) {
    const article = await this.prisma.article.findFirst({
      where: {
        isDeleted: false,
        OR: [{ uid: param }, { slugURL: param }],
      },
      include: this.articleInclude,
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    // Non-authors can only see published articles
    let isAuthor = false;
    if (userEmail) {
      try {
        const { memberUid, teamUid } = await this.resolveMemberByEmail(userEmail);
        isAuthor = article.authorMemberUid === memberUid || (!!teamUid && article.authorTeamUid === teamUid);
      } catch {
        // Not logged in or member not found -- treat as non-author
      }
    }

    if (article.status !== ArticleStatus.PUBLISHED && !isAuthor) {
      throw new NotFoundException('Article not found');
    }

    // Aggregate stats
    const [viewAgg, likeCount, userStat] = await Promise.all([
      this.prisma.articleStatistic.aggregate({
        where: { articleUid: article.uid },
        _sum: { viewCount: true },
      }),
      this.prisma.articleStatistic.count({
        where: { articleUid: article.uid, likeCount: { gt: 0 } },
      }),
      userEmail
        ? this.resolveMemberByEmail(userEmail)
            .then(({ memberUid }) =>
              this.prisma.articleStatistic.findUnique({
                where: { articleUid_memberUid: { articleUid: article.uid, memberUid } },
                select: { likeCount: true, viewCount: true },
              })
            )
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    // Related articles (same category, excluding current)
    const relatedArticles = await this.prisma.article.findMany({
      where: {
        category: article.category,
        status: ArticleStatus.PUBLISHED,
        isDeleted: false,
        uid: { not: article.uid },
      },
      take: 5,
      orderBy: { publishedAt: 'desc' },
      include: this.articleInclude,
    });

    // Prev/next in same category
    const [prevArticle, nextArticle] = await Promise.all([
      this.prisma.article.findFirst({
        where: {
          category: article.category,
          status: ArticleStatus.PUBLISHED,
          isDeleted: false,
          publishedAt: article.publishedAt ? { lt: article.publishedAt } : undefined,
          uid: { not: article.uid },
        },
        orderBy: { publishedAt: 'desc' },
        select: { uid: true, slugURL: true, title: true },
      }),
      this.prisma.article.findFirst({
        where: {
          category: article.category,
          status: ArticleStatus.PUBLISHED,
          isDeleted: false,
          publishedAt: article.publishedAt ? { gt: article.publishedAt } : undefined,
          uid: { not: article.uid },
        },
        orderBy: { publishedAt: 'asc' },
        select: { uid: true, slugURL: true, title: true },
      }),
    ]);

    return {
      ...article,
      totalViews: viewAgg._sum.viewCount ?? 0,
      totalLikes: likeCount,
      currentUserLiked: (userStat?.likeCount ?? 0) > 0,
      relatedArticles,
      prevArticle,
      nextArticle,
    };
  }

  async likeArticle(userEmail: string, articleUid: string) {
    const { memberUid } = await this.resolveMemberByEmail(userEmail);

    const article = await this.prisma.article.findFirst({
      where: { uid: articleUid, isDeleted: false, status: ArticleStatus.PUBLISHED },
      select: { uid: true },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    return this.prisma.articleStatistic.upsert({
      where: { articleUid_memberUid: { articleUid, memberUid } },
      update: { likeCount: 1 },
      create: { articleUid, memberUid, likeCount: 1 },
    });
  }

  async unlikeArticle(userEmail: string, articleUid: string) {
    const { memberUid } = await this.resolveMemberByEmail(userEmail);

    const stat = await this.prisma.articleStatistic.findUnique({
      where: { articleUid_memberUid: { articleUid, memberUid } },
    });

    if (!stat) {
      return { success: true };
    }

    return this.prisma.articleStatistic.update({
      where: { articleUid_memberUid: { articleUid, memberUid } },
      data: { likeCount: 0 },
    });
  }

  async trackView(userEmail: string, articleUid: string) {
    const { memberUid } = await this.resolveMemberByEmail(userEmail);

    const article = await this.prisma.article.findFirst({
      where: { uid: articleUid, isDeleted: false },
      select: { uid: true },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    return this.prisma.articleStatistic.upsert({
      where: { articleUid_memberUid: { articleUid, memberUid } },
      update: { viewCount: { increment: 1 } },
      create: { articleUid, memberUid, viewCount: 1 },
    });
  }

  async getOverviewStats() {
    const [articleCount, topicsWithCounts, totalViewsAgg] = await Promise.all([
      this.prisma.article.count({
        where: { status: ArticleStatus.PUBLISHED, isDeleted: false },
      }),
      this.prisma.article.groupBy({
        by: ['category'],
        where: { status: ArticleStatus.PUBLISHED, isDeleted: false },
        _count: { _all: true },
      }),
      this.prisma.articleStatistic.aggregate({
        _sum: { viewCount: true },
      }),
    ]);

    const topics = topicsWithCounts.map((t) => ({
      category: t.category,
      description: ARTICLE_CATEGORY_DESCRIPTIONS[t.category as ArticleCategory] ?? '',
      articleCount: t._count._all,
    }));

    return {
      articleCount,
      topicCount: topics.length,
      totalViews: totalViewsAgg._sum.viewCount ?? 0,
      topics,
    };
  }

  // ── Whitelisted (author) ───────────────────────────────────────────────

  async canAccessArticles(userEmail: string) {
    const { memberUid } = await this.resolveMemberByEmail(userEmail);

    const whitelist = await this.prisma.articleWhitelist.findUnique({
      where: { memberUid },
    });

    return !!whitelist;
  }

  async createArticle(userEmail: string, body: CreateArticleDto) {
    const { memberUid, teamUid } = await this.resolveMemberByEmail(userEmail);

    const slugURL = body.slugURL || (await this.generateSlug(body.title));
    const readingTime = this.calculateReadingTime(body.content);
    const status = body.status ?? ArticleStatus.DRAFT;

    return this.prisma.article.create({
      data: {
        title: body.title,
        slugURL,
        summary: body.summary,
        category: body.category,
        tags: body.tags ?? [],
        content: body.content,
        readingTime,
        coverImageUid: body.coverImageUid ?? null,
        authorMemberUid: body.authorMemberUid ?? memberUid,
        authorTeamUid: body.authorTeamUid ?? teamUid,
        status,
        publishedAt: status === ArticleStatus.PUBLISHED ? new Date() : null,
      },
      include: this.articleInclude,
    });
  }

  async updateOwnArticle(userEmail: string, uid: string, body: UpdateArticleDto) {
    const { memberUid, teamUid } = await this.resolveMemberByEmail(userEmail);
    await this.ensureArticleOwnership(uid, memberUid, teamUid);

    const existing = await this.prisma.article.findUnique({ where: { uid } });
    if (!existing) {
      throw new NotFoundException('Article not found');
    }

    const data: any = {};

    if (body.title !== undefined) data.title = body.title;
    if (body.slugURL !== undefined) data.slugURL = body.slugURL;
    if (body.summary !== undefined) data.summary = body.summary;
    if (body.category !== undefined) data.category = body.category;
    if (body.tags !== undefined) data.tags = body.tags;
    if (body.content !== undefined) {
      data.content = body.content;
      data.readingTime = this.calculateReadingTime(body.content);
    }
    if (body.coverImageUid !== undefined) data.coverImageUid = body.coverImageUid;
    if (body.status !== undefined) {
      data.status = body.status;
      if (body.status === ArticleStatus.PUBLISHED && existing.status !== ArticleStatus.PUBLISHED) {
        data.publishedAt = new Date();
      }
    }

    return this.prisma.article.update({
      where: { uid },
      data,
      include: this.articleInclude,
    });
  }

  async listMyArticles(userEmail: string, query: ListArticlesQueryDto) {
    const { memberUid, teamUid } = await this.resolveMemberByEmail(userEmail);

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ArticleWhereInput = {
      isDeleted: false,
      OR: [{ authorMemberUid: memberUid }, ...(teamUid ? [{ authorTeamUid: teamUid }] : [])],
      ...(query?.search
        ? {
            AND: {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' as const } },
                { summary: { contains: query.search, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
      ...(query?.category ? { category: query.category } : {}),
    };

    const [articles, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: this.articleInclude,
      }),
      this.prisma.article.count({ where }),
    ]);

    return { data: articles, total, page, limit };
  }

  // ── Admin ──────────────────────────────────────────────────────────────

  async adminList(query: ListArticlesQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ArticleWhereInput = {
      isDeleted: false,
      ...(query?.category ? { category: query.category } : {}),
      ...(query?.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { summary: { contains: query.search, mode: 'insensitive' } },
              { content: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [articles, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: this.articleInclude,
      }),
      this.prisma.article.count({ where }),
    ]);

    if (!articles.length) {
      return { data: [], total, page, limit };
    }

    const articleUids = articles.map((a) => a.uid);

    const likeCounts = await this.prisma.articleStatistic.groupBy({
      by: ['articleUid'],
      where: { articleUid: { in: articleUids }, likeCount: { gt: 0 } },
      _count: { _all: true },
    });

    const viewAgg = await this.prisma.articleStatistic.groupBy({
      by: ['articleUid'],
      where: { articleUid: { in: articleUids } },
      _sum: { viewCount: true },
    });

    const likeMap = new Map(likeCounts.map((s) => [s.articleUid, s._count._all]));
    const viewMap = new Map(viewAgg.map((s) => [s.articleUid, s._sum.viewCount ?? 0]));

    const data = articles.map((article) => ({
      ...article,
      totalLikes: likeMap.get(article.uid) ?? 0,
      totalViews: viewMap.get(article.uid) ?? 0,
    }));

    return { data, total, page, limit };
  }

  async adminCreate(body: CreateArticleDto) {
    const slugURL = body.slugURL || (await this.generateSlug(body.title));
    const readingTime = this.calculateReadingTime(body.content);
    const status = body.status ?? ArticleStatus.DRAFT;

    return this.prisma.article.create({
      data: {
        title: body.title,
        slugURL,
        summary: body.summary,
        category: body.category,
        tags: body.tags ?? [],
        content: body.content,
        readingTime,
        coverImageUid: body.coverImageUid ?? null,
        authorMemberUid: body.authorMemberUid ?? null,
        authorTeamUid: body.authorTeamUid ?? null,
        status,
        publishedAt: status === ArticleStatus.PUBLISHED ? new Date() : null,
      },
      include: this.articleInclude,
    });
  }

  async adminUpdate(uid: string, body: UpdateArticleDto) {
    const existing = await this.prisma.article.findUnique({ where: { uid } });

    if (!existing) {
      throw new NotFoundException('Article not found');
    }

    const data: any = {};

    if (body.title !== undefined) data.title = body.title;
    if (body.slugURL !== undefined) data.slugURL = body.slugURL;
    if (body.summary !== undefined) data.summary = body.summary;
    if (body.category !== undefined) data.category = body.category;
    if (body.tags !== undefined) data.tags = body.tags;
    if (body.content !== undefined) {
      data.content = body.content;
      data.readingTime = this.calculateReadingTime(body.content);
    }
    if (body.coverImageUid !== undefined) data.coverImageUid = body.coverImageUid;
    if (body.authorMemberUid !== undefined) data.authorMemberUid = body.authorMemberUid;
    if (body.authorTeamUid !== undefined) data.authorTeamUid = body.authorTeamUid;
    if (body.status !== undefined) {
      data.status = body.status;
      if (body.status === ArticleStatus.PUBLISHED && existing.status !== ArticleStatus.PUBLISHED) {
        data.publishedAt = new Date();
      }
    }

    return this.prisma.article.update({
      where: { uid },
      data,
      include: this.articleInclude,
    });
  }

  async adminDelete(uid: string) {
    const existing = await this.prisma.article.findUnique({ where: { uid } });

    if (!existing) {
      throw new NotFoundException('Article not found');
    }

    return this.prisma.article.update({
      where: { uid },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }

  async adminGetByUid(uid: string) {
    const article = await this.prisma.article.findFirst({
      where: { uid, isDeleted: false },
      include: this.articleInclude,
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const [viewAgg, likeCount] = await Promise.all([
      this.prisma.articleStatistic.aggregate({
        where: { articleUid: uid },
        _sum: { viewCount: true },
      }),
      this.prisma.articleStatistic.count({
        where: { articleUid: uid, likeCount: { gt: 0 } },
      }),
    ]);

    return {
      ...article,
      totalViews: viewAgg._sum.viewCount ?? 0,
      totalLikes: likeCount,
    };
  }

  // ── Whitelist management (admin) ───────────────────────────────────────

  async getWhitelist() {
    return this.prisma.articleWhitelist.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        member: {
          select: {
            uid: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async addToWhitelist(memberUid: string) {
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      select: {
        uid: true,
        name: true,
        email: true,
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    return this.prisma.articleWhitelist.upsert({
      where: { memberUid },
      update: {},
      create: { memberUid },
      include: {
        member: {
          select: {
            uid: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async removeFromWhitelist(memberUid: string) {
    await this.prisma.articleWhitelist.deleteMany({
      where: { memberUid },
    });

    return { success: true };
  }
}
