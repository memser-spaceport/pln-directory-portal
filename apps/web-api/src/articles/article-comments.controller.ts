import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { NoCache } from '../decorators/no-cache.decorator';
import { RequirePermissions } from '../rbac/rbac.decorator';
import { RBAC_PERMISSION_CODES } from '../rbac/rbac.constants';
import { RbacGuard } from '../rbac/rbac.guard';
import { ArticleCommentsService } from './article-comments.service';
import { CreateArticleCommentDto, UpdateArticleCommentDto } from './article-comments.dto';

@Controller('v1/articles')
@UseGuards(UserTokenCheckGuard, RbacGuard)
export class ArticleCommentsController {
  constructor(private readonly articleCommentsService: ArticleCommentsService) {}

  @Post(':uid/comments')
  @RequirePermissions(RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW)
  async createComment(
    @Req() req: Request,
    @Param('uid') articleUid: string,
    @Body() body: CreateArticleCommentDto,
  ) {
    return this.articleCommentsService.createComment(req['userEmail'], articleUid, body);
  }

  @NoCache()
  @Get(':uid/comments')
  @RequirePermissions(RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW)
  async listComments(@Req() req: Request, @Param('uid') articleUid: string) {
    return this.articleCommentsService.listComments(req['userEmail'], articleUid);
  }

  @Patch('comments/:commentUid')
  @RequirePermissions(RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW)
  async updateComment(
    @Req() req: Request,
    @Param('commentUid') commentUid: string,
    @Body() body: UpdateArticleCommentDto,
  ) {
    return this.articleCommentsService.updateComment(req['userEmail'], commentUid, body);
  }

  @Delete('comments/:commentUid')
  @RequirePermissions(RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW)
  async deleteComment(@Req() req: Request, @Param('commentUid') commentUid: string) {
    return this.articleCommentsService.deleteComment(req['userEmail'], commentUid);
  }

  @Post('comments/:commentUid/like')
  @RequirePermissions(RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW)
  async likeComment(@Req() req: Request, @Param('commentUid') commentUid: string) {
    return this.articleCommentsService.likeComment(req['userEmail'], commentUid);
  }

  @Delete('comments/:commentUid/like')
  @RequirePermissions(RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW)
  async unlikeComment(@Req() req: Request, @Param('commentUid') commentUid: string) {
    return this.articleCommentsService.unlikeComment(req['userEmail'], commentUid);
  }
}
