import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermissions } from '../rbac/rbac.decorator';
import { RBAC_PERMISSION_CODES } from '../rbac/rbac.constants';
import { ADMIN_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { CrosswalkReviewQueryDto, ListPathfinderPathsQueryDto } from './dto/pathfinder.query.dto';
import { CreateCorrectionDto, ResolveCrosswalkDto } from './dto/correction.dto';
import { PathfinderQueryService } from './pathfinder-query.service';
import { CorrectionActor, PathfinderService } from './pathfinder.service';

const VIEW_PERMS = {
  anyOf: [RBAC_PERMISSION_CODES.INVESTOR_DB_VIEW, ADMIN_PERMISSIONS.DIRECTORY_FULL],
};
const EDIT_PERMS = {
  anyOf: [RBAC_PERMISSION_CODES.INVESTOR_DB_EDIT, ADMIN_PERMISSIONS.DIRECTORY_FULL],
};

interface AuthedRequest {
  userEmail?: string;
  memberUid?: string;
  user?: { email?: string; sub?: string; memberUid?: string };
}

function actorOf(req: AuthedRequest): CorrectionActor {
  return {
    uid: req.memberUid ?? req.user?.memberUid ?? req.user?.sub ?? null,
    email: req.userEmail ?? req.user?.email ?? null,
  };
}

/**
 * PL Path Finder read + corrections API for the warm-intros workspace.
 * Reuses the Investor DB permissions (no new perms).
 */
@ApiTags('Path Finder')
@Controller('v1/pathfinder')
@UseGuards(UserTokenCheckGuard, RbacGuard)
export class PathfinderController {
  constructor(
    private readonly queryService: PathfinderQueryService,
    private readonly pathfinderService: PathfinderService
  ) {}

  @NoCache()
  @Get('paths')
  @RequirePermissions(VIEW_PERMS)
  async listPaths(@Query() query: ListPathfinderPathsQueryDto) {
    return this.queryService.listPaths(query);
  }

  @NoCache()
  @Get('paths/:investorId')
  @RequirePermissions(VIEW_PERMS)
  async getPathsForTarget(@Param('investorId') investorId: string) {
    return this.queryService.getPathsForTarget(investorId);
  }

  @NoCache()
  @Get('crosswalk/review')
  @RequirePermissions(VIEW_PERMS)
  async crosswalkReview(@Query() query: CrosswalkReviewQueryDto) {
    return this.queryService.listCrosswalkReview(query);
  }

  @Post('corrections')
  @RequirePermissions(EDIT_PERMS)
  async createCorrection(@Body() dto: CreateCorrectionDto, @Req() req: AuthedRequest) {
    return this.pathfinderService.createCorrection(dto, actorOf(req));
  }

  @Post('crosswalk/:id/resolve')
  @RequirePermissions(EDIT_PERMS)
  async resolveCrosswalk(@Param('id') id: string, @Body() dto: ResolveCrosswalkDto, @Req() req: AuthedRequest) {
    return this.pathfinderService.resolveCrosswalk(parseInt(id, 10), dto, actorOf(req));
  }
}
