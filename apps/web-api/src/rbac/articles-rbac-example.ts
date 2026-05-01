import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RequirePermissions } from './rbac.decorator';
import { RbacGuard } from './rbac.guard';
import { RBAC_PERMISSION_CODES } from './rbac.constants';
import { NoCache } from '../decorators/no-cache.decorator';
import { ADMIN_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';

@Controller('v2/rbac-test-articles')
@UseGuards(UserTokenCheckGuard, RbacGuard)
export class ArticlesRbacExampleController {
  @NoCache()
  @Get()
  @RequirePermissions({ anyOf: [RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW, ADMIN_PERMISSIONS.DIRECTORY_FULL] })
  async listArticles() {
    return { ok: true };
  }

  @Post()
  @RequirePermissions({ anyOf: [RBAC_PERMISSION_CODES.FOUNDER_GUIDES_CREATE, ADMIN_PERMISSIONS.DIRECTORY_FULL] })
  async createArticle() {
    return { ok: true };
  }
}
