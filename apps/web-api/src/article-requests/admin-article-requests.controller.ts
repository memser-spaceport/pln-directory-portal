import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { NoCache } from '../decorators/no-cache.decorator';
import { ArticleRequestsService } from './article-requests.service';
import { ListArticleRequestsQueryDto, UpdateArticleRequestDto } from './article-requests.dto';

@Controller('v1/admin/article-requests')
@UseGuards(AdminAuthGuard)
export class AdminArticleRequestsController {
  constructor(private readonly articleRequestsService: ArticleRequestsService) {}

  @NoCache()
  @Get()
  async list(@Query() query: ListArticleRequestsQueryDto) {
    return this.articleRequestsService.adminList(query);
  }

  @NoCache()
  @Get(':uid')
  async getOne(@Param('uid') uid: string) {
    return this.articleRequestsService.adminGetByUid(uid);
  }

  @Patch(':uid')
  async update(@Param('uid') uid: string, @Body() body: UpdateArticleRequestDto) {
    return this.articleRequestsService.adminUpdate(uid, body);
  }
}
