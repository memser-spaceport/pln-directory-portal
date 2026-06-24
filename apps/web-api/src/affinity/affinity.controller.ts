import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MEMBER_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RequirePermissions } from '../rbac/rbac.decorator';
import { RbacGuard } from '../rbac/rbac.guard';
import { AffinityQueryService } from './affinity-query.service';

const READ = { anyOf: [MEMBER_PERMISSIONS.AFFINITY_READ] };

@ApiTags('Affinity')
@Controller('v1/affinity')
@UseGuards(UserTokenCheckGuard, RbacGuard)
export class AffinityController {
  constructor(private readonly queryService: AffinityQueryService) {}

  /** Affinity CRM sidecar for a Directory member (person + companies). */
  @NoCache()
  @Get('members/:memberUid')
  @RequirePermissions(READ)
  async getByMemberUid(@Param('memberUid') memberUid: string) {
    return this.queryService.getByMemberUid(memberUid);
  }
}
