import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ArticlesService } from './articles.service';
import { CreateArticleDto, ListArticlesQueryDto, UpdateArticleDto } from './articles.dto';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RequirePermissions } from '../rbac/rbac.decorator';
import { RBAC_PERMISSION_CODES } from '../rbac/rbac.constants';
import { RbacGuard } from '../rbac/rbac.guard';

@Controller('v1/articles')
@UseGuards(UserTokenCheckGuard, RbacGuard)
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @NoCache()
  @Get('overview')
  @RequirePermissions(RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW)
  async overview() {
    return this.articlesService.getOverviewStats();
  }

  @NoCache()
  @Get('me')
  @RequirePermissions(RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW)
  async myArticles(@Req() req: Request, @Query() query: ListArticlesQueryDto) {
    return this.articlesService.listMyArticles(req['userEmail'], query);
  }

  @NoCache()
  @Get()
  @RequirePermissions(RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW)
  async list(@Req() req: Request, @Query() query: ListArticlesQueryDto) {
    return this.articlesService.listPublished(query);
  }

  @Post()
  @RequirePermissions(RBAC_PERMISSION_CODES.FOUNDER_GUIDES_CREATE)
  async create(@Req() req: Request, @Body() body: CreateArticleDto) {
    return this.articlesService.createArticle(req['userEmail'], body);
  }

  @Put(':uid')
  @RequirePermissions(RBAC_PERMISSION_CODES.FOUNDER_GUIDES_CREATE)
  async update(@Req() req: Request, @Param('uid') uid: string, @Body() body: UpdateArticleDto) {
    return this.articlesService.updateOwnArticle(req['userEmail'], uid, body);
  }

  @NoCache()
  @Get(':uidOrSlug')
  @RequirePermissions(RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW)
  async getOne(@Req() req: Request, @Param('uidOrSlug') uidOrSlug: string) {
    return this.articlesService.getByUidOrSlug(uidOrSlug, req['userEmail']);
  }

  @Post(':uid/like')
  @RequirePermissions(RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW)
  async like(@Req() req: Request, @Param('uid') uid: string) {
    return this.articlesService.likeArticle(req['userEmail'], uid);
  }

  @Delete(':uid/like')
  @RequirePermissions(RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW)
  async unlike(@Req() req: Request, @Param('uid') uid: string) {
    return this.articlesService.unlikeArticle(req['userEmail'], uid);
  }

  @Post(':uid/view')
  @RequirePermissions(RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW)
  async trackView(@Req() req: Request, @Param('uid') uid: string) {
    return this.articlesService.trackView(req['userEmail'], uid);
  }
}
