import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ArticlesService } from './articles.service';
import { ArticleAuthorSearchQueryDto, CreateArticleDto, ListArticlesQueryDto, UpdateArticleDto } from './articles.dto';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RequirePermissions } from '../rbac/rbac.decorator';
import { RBAC_PERMISSION_CODES } from '../rbac/rbac.constants';
import { RbacGuard } from '../rbac/rbac.guard';
import { ADMIN_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';

@Controller('v1/articles')
@UseGuards(UserTokenCheckGuard, RbacGuard)
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @NoCache()
  @Get('overview')
  @RequirePermissions({ anyOf: [RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW, ADMIN_PERMISSIONS.DIRECTORY_FULL] })
  async overview() {
    return this.articlesService.getOverviewStats();
  }

  @NoCache()
  @Get('me')
  @RequirePermissions({ anyOf: [RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW, ADMIN_PERMISSIONS.DIRECTORY_FULL] })
  async myArticles(@Req() req: Request, @Query() query: ListArticlesQueryDto) {
    return this.articlesService.listMyArticles(req['userEmail'], query);
  }

  @NoCache()
  @Get('author-search')
  @RequirePermissions({ anyOf: [RBAC_PERMISSION_CODES.FOUNDER_GUIDES_CREATE, ADMIN_PERMISSIONS.DIRECTORY_FULL] })
  async searchArticleAuthors(@Query() query: ArticleAuthorSearchQueryDto) {
    return this.articlesService.searchArticleAuthors(query.search ?? '');
  }

  @NoCache()
  @Get()
  @RequirePermissions({ anyOf: [RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW, ADMIN_PERMISSIONS.DIRECTORY_FULL] })
  async list(@Req() req: Request, @Query() query: ListArticlesQueryDto) {
    return this.articlesService.listPublished(query, req['userEmail']);
  }

  @Post()
  @RequirePermissions({ anyOf: [RBAC_PERMISSION_CODES.FOUNDER_GUIDES_CREATE, ADMIN_PERMISSIONS.DIRECTORY_FULL] })
  async create(@Req() req: Request, @Body() body: CreateArticleDto) {
    return this.articlesService.createArticle(body, req['userEmail']);
  }

  @Put(':uid')
  @RequirePermissions({ anyOf: [RBAC_PERMISSION_CODES.FOUNDER_GUIDES_CREATE, ADMIN_PERMISSIONS.DIRECTORY_FULL] })
  async update(@Req() req: Request, @Param('uid') uid: string, @Body() body: UpdateArticleDto) {
    return this.articlesService.updateOwnArticle(req['userEmail'], uid, body);
  }

  @NoCache()
  @Get(':uidOrSlug')
  @RequirePermissions({ anyOf: [RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW, ADMIN_PERMISSIONS.DIRECTORY_FULL] })
  async getOne(@Req() req: Request, @Param('uidOrSlug') uidOrSlug: string) {
    return this.articlesService.getByUidOrSlug(uidOrSlug, req['userEmail']);
  }

  @Post(':uid/like')
  @RequirePermissions({ anyOf: [RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW, ADMIN_PERMISSIONS.DIRECTORY_FULL] })
  async like(@Req() req: Request, @Param('uid') uid: string) {
    return this.articlesService.likeArticle(req['userEmail'], uid);
  }

  @Delete(':uid/like')
  @RequirePermissions({ anyOf: [RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW, ADMIN_PERMISSIONS.DIRECTORY_FULL] })
  async unlike(@Req() req: Request, @Param('uid') uid: string) {
    return this.articlesService.unlikeArticle(req['userEmail'], uid);
  }

  @Post(':uid/view')
  @RequirePermissions({ anyOf: [RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW, ADMIN_PERMISSIONS.DIRECTORY_FULL] })
  async trackView(@Req() req: Request, @Param('uid') uid: string) {
    return this.articlesService.trackView(req['userEmail'], uid);
  }
}
