import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermissions } from '../rbac/rbac.decorator';
import { RBAC_PERMISSION_CODES } from '../rbac/rbac.constants';
import { ADMIN_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import {
  GetWarmPathsByInvestorQueryDto,
  ListConnectionEdgesQueryDto,
  ListWarmPathsV2QueryDto,
} from './dto/ingest-warm-intros-v2.dto';
import { WarmIntrosV2Service } from './warm-intros-v2.service';

const VIEW_PERMS = {
  anyOf: [RBAC_PERMISSION_CODES.INVESTOR_DB_VIEW, ADMIN_PERMISSIONS.DIRECTORY_FULL],
};

/**
 * Warm Intros v2 — ConnectionEdge + WarmPathV2 read API.
 * Same auth as MasterProfile / Pathfinder (Investor DB view / directory full).
 */
@ApiTags('Warm Intros v2')
@Controller('v1/warm-intros-v2')
@UseGuards(UserTokenCheckGuard, RbacGuard)
export class WarmIntrosV2Controller {
  constructor(private readonly warmIntrosV2Service: WarmIntrosV2Service) {}

  @NoCache()
  @Get('paths')
  @RequirePermissions(VIEW_PERMS)
  async listPaths(@Query() query: ListWarmPathsV2QueryDto) {
    return this.warmIntrosV2Service.listPaths(query);
  }

  @NoCache()
  @Get('paths/:investorProfileUid')
  @RequirePermissions(VIEW_PERMS)
  async getPathsByInvestor(
    @Param('investorProfileUid') investorProfileUid: string,
    @Query() query: GetWarmPathsByInvestorQueryDto
  ) {
    return this.warmIntrosV2Service.getPathsByInvestor(investorProfileUid, query);
  }

  @NoCache()
  @Get('edges')
  @RequirePermissions(VIEW_PERMS)
  async listEdges(@Query() query: ListConnectionEdgesQueryDto) {
    return this.warmIntrosV2Service.listEdges(query);
  }
}
