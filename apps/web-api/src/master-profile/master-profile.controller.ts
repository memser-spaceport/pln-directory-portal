import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermissions } from '../rbac/rbac.decorator';
import { RBAC_PERMISSION_CODES } from '../rbac/rbac.constants';
import { ADMIN_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { ListMasterProfilesQueryDto } from './dto/ingest-master-profile.dto';
import { MasterProfileService } from './master-profile.service';

const VIEW_PERMS = {
  anyOf: [RBAC_PERMISSION_CODES.INVESTOR_DB_VIEW, ADMIN_PERMISSIONS.DIRECTORY_FULL],
};

/**
 * Warm Intros v2 — MasterProfile read API.
 * Same auth as Pathfinder (Investor DB view / directory full).
 */
@ApiTags('Master Profile')
@Controller('v1/master-profiles')
@UseGuards(UserTokenCheckGuard, RbacGuard)
export class MasterProfileController {
  constructor(private readonly masterProfileService: MasterProfileService) {}

  @NoCache()
  @Get()
  @RequirePermissions(VIEW_PERMS)
  async lookup(@Query() query: ListMasterProfilesQueryDto) {
    return this.masterProfileService.lookup(query);
  }

  @NoCache()
  @Get(':uid')
  @RequirePermissions(VIEW_PERMS)
  async getByUid(@Param('uid') uid: string) {
    return this.masterProfileService.getByUid(uid);
  }
}
