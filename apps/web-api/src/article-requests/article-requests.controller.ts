import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { CreateArticleRequestDto } from './article-requests.dto';
import { ArticleRequestsService } from './article-requests.service';

@Controller('v1/articles')
export class ArticleRequestsController {
  constructor(private readonly articleRequestsService: ArticleRequestsService) {}

  @UseGuards(UserTokenCheckGuard)
  @Post('requests')
  async createWithoutParam(
    @Req() req: Request,
    @Body() body: CreateArticleRequestDto,
  ) {
    return this.articleRequestsService.create((req as any)['userEmail'], undefined, body);
  }

  @UseGuards(UserTokenCheckGuard)
  @Post(':articleUid/requests')
  async createWithParam(
    @Req() req: Request,
    @Param('articleUid') articleUid: string,
    @Body() body: CreateArticleRequestDto,
  ) {
    return this.articleRequestsService.create((req as any)['userEmail'], articleUid, body);
  }

  @UseGuards(UserTokenCheckGuard)
  @Get('requests/:requestUid')
  async getByUid(
    @Req() req: Request,
    @Param('requestUid') requestUid: string,
  ) {
    return this.articleRequestsService.getByUidForUser((req as any)['userEmail'], requestUid);
  }
}
