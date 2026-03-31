import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RequirePermissions } from './rbac.decorator';
import { RbacGuard } from './rbac.guard';
import { RBAC_PERMISSION_CODES } from './rbac.constants';
import {NoCache} from "../decorators/no-cache.decorator";

@Controller('v2/rbac-test-articles')
@UseGuards(UserTokenCheckGuard, RbacGuard)
export class ArticlesRbacExampleController {

  @NoCache()
  @Get()
  @RequirePermissions(RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW)
  async listArticles() {
    return { ok: true };
  }

  @Post()
  @RequirePermissions(RBAC_PERMISSION_CODES.FOUNDER_GUIDES_CREATE)
  async createArticle() {
    return { ok: true };
  }
}
