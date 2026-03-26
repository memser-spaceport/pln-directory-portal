import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ArticlesService } from './articles.service';
import { CreateArticleDto, ListArticlesQueryDto, UpdateArticleDto } from './articles.dto';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';

@Controller('v1/articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  @Get('overview')
  async overview() {
    return this.articlesService.getOverviewStats();
  }

  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  @Get('me')
  async myArticles(@Req() req: Request, @Query() query: ListArticlesQueryDto) {
    return this.articlesService.listMyArticles(req['userEmail'], query);
  }

  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  @Get('access')
  async access(@Req() req: Request) {
    return {
      canAccessArticles: await this.articlesService.canAccessArticles(req['userEmail']),
    };
  }

  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  @Get()
  async list(@Req() req: Request, @Query() query: ListArticlesQueryDto) {
    return this.articlesService.listPublished(query);
  }

  @UseGuards(UserTokenCheckGuard)
  @Post()
  async create(@Req() req: Request, @Body() body: CreateArticleDto) {
    return this.articlesService.createArticle(req['userEmail'], body);
  }

  @UseGuards(UserTokenCheckGuard)
  @Put(':uid')
  async update(@Req() req: Request, @Param('uid') uid: string, @Body() body: UpdateArticleDto) {
    return this.articlesService.updateOwnArticle(req['userEmail'], uid, body);
  }

  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  @Get(':uidOrSlug')
  async getOne(@Req() req: Request, @Param('uidOrSlug') uidOrSlug: string) {
    return this.articlesService.getByUidOrSlug(uidOrSlug, req['userEmail']);
  }

  @UseGuards(UserTokenCheckGuard)
  @Post(':uid/like')
  async like(@Req() req: Request, @Param('uid') uid: string) {
    return this.articlesService.likeArticle(req['userEmail'], uid);
  }

  @UseGuards(UserTokenCheckGuard)
  @Delete(':uid/like')
  async unlike(@Req() req: Request, @Param('uid') uid: string) {
    return this.articlesService.unlikeArticle(req['userEmail'], uid);
  }

  @UseGuards(UserTokenCheckGuard)
  @Post(':uid/view')
  async trackView(@Req() req: Request, @Param('uid') uid: string) {
    return this.articlesService.trackView(req['userEmail'], uid);
  }
}
