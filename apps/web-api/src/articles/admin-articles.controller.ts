import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { ArticlesService } from './articles.service';
import { CreateArticleDto, ListArticlesQueryDto, UpdateArticleAccessDto, UpdateArticleDto } from './articles.dto';
import { NoCache } from '../decorators/no-cache.decorator';

@Controller('v1/admin/articles')
@UseGuards(AdminAuthGuard)
export class AdminArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @NoCache()
  @Get()
  async list(@Query() query: ListArticlesQueryDto) {
    return this.articlesService.adminList(query);
  }

  @Post()
  async create(@Req() req: Request, @Body() body: CreateArticleDto) {
    return this.articlesService.adminCreate(body, req['userEmail']);
  }

  @Patch(':uid')
  async update(@Req() req: Request, @Param('uid') uid: string, @Body() body: UpdateArticleDto) {
    return this.articlesService.adminUpdate(uid, body, req['userEmail']);
  }

  @Delete(':uid')
  async remove(@Param('uid') uid: string) {
    return this.articlesService.adminDelete(uid);
  }

  @NoCache()
  @Get('whitelist')
  async whitelist() {
    return this.articlesService.getWhitelist();
  }

  @Post('whitelist')
  async addWhitelist(@Body() body: UpdateArticleAccessDto) {
    return this.articlesService.addToWhitelist(body.memberUid);
  }

  @Delete('whitelist/:memberUid')
  async removeWhitelist(@Param('memberUid') memberUid: string) {
    return this.articlesService.removeFromWhitelist(memberUid);
  }

  @NoCache()
  @Get(':uid')
  async getOne(@Param('uid') uid: string) {
    return this.articlesService.adminGetByUid(uid);
  }
}
