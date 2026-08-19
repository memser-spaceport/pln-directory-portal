import { Body, Controller, Delete, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermissions } from '../rbac/rbac.decorator';
import { RBAC_PERMISSION_CODES } from '../rbac/rbac.constants';
import { ADMIN_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { RbacService } from '../rbac/rbac.service';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import {
  GetWarmPathsByInvestorQueryDto,
  ListConnectionEdgesQueryDto,
  ListWarmIntrosV2FacetsQueryDto,
  ListWarmPathsV2QueryDto,
} from './dto/ingest-warm-intros-v2.dto';
import {
  ClearWarmPathReferDto,
  FeedbackActor,
  ListWarmPathFeedbackQueryDto,
  UpsertWarmPathFeedbackDto,
} from './dto/warm-path-feedback.dto';
import { UpsertWarmPathNoteDto } from './dto/warm-path-note.dto';
import { WarmIntrosV2Service } from './warm-intros-v2.service';

const VIEW_PERMS = {
  anyOf: [RBAC_PERMISSION_CODES.INVESTOR_DB_VIEW, ADMIN_PERMISSIONS.DIRECTORY_FULL],
};
const EDIT_PERMS = {
  anyOf: [RBAC_PERMISSION_CODES.INVESTOR_DB_EDIT, ADMIN_PERMISSIONS.DIRECTORY_FULL],
};

interface AuthedRequest {
  userEmail?: string;
  memberUid?: string;
  user?: {
    email?: string;
    sub?: string;
    memberUid?: string;
    permissions?: string[];
    effectivePermissionCodes?: string[];
  };
}

function actorOf(req: AuthedRequest): FeedbackActor {
  return {
    uid: req.memberUid ?? req.user?.memberUid ?? req.user?.sub ?? null,
    email: req.userEmail ?? req.user?.email ?? null,
  };
}

/**
 * Warm Intros v2 — ConnectionEdge + WarmPathV2 read API + path feedback.
 * Same auth as MasterProfile / Pathfinder (Investor DB view / directory full).
 */
@ApiTags('Warm Intros v2')
@Controller('v1/warm-intros-v2')
@UseGuards(UserTokenCheckGuard, RbacGuard)
export class WarmIntrosV2Controller {
  constructor(
    private readonly warmIntrosV2Service: WarmIntrosV2Service,
    private readonly rbacService: RbacService,
    private readonly accessControlV2Service: AccessControlV2Service
  ) {}

  @NoCache()
  @Get('paths')
  @RequirePermissions(VIEW_PERMS)
  async listPaths(@Query() query: ListWarmPathsV2QueryDto) {
    return this.warmIntrosV2Service.listPaths(query);
  }

  /** Must be registered before `paths/:investorProfileUid`. */
  @NoCache()
  @Get('facets')
  @RequirePermissions(VIEW_PERMS)
  async listFacets(@Query() query: ListWarmIntrosV2FacetsQueryDto) {
    return this.warmIntrosV2Service.listFacets(query);
  }

  @NoCache()
  @Get('feedback')
  @RequirePermissions(EDIT_PERMS)
  async listFeedback(@Query() query: ListWarmPathFeedbackQueryDto) {
    return this.warmIntrosV2Service.listPathFeedback(query);
  }

  @NoCache()
  @Get('paths/:investorProfileUid')
  @RequirePermissions(VIEW_PERMS)
  async getPathsByInvestor(
    @Param('investorProfileUid') investorProfileUid: string,
    @Query() query: GetWarmPathsByInvestorQueryDto,
    @Req() req: AuthedRequest
  ) {
    const actor = await this.resolveActor(req);
    const includeFeedbackSummary = await this.canEditInvestorDb(actor.uid);
    return this.warmIntrosV2Service.getPathsByInvestor(investorProfileUid, query, {
      actor,
      includeFeedbackSummary,
    });
  }

  @NoCache()
  @Put('paths/:warmPathUid/feedback')
  @RequirePermissions(VIEW_PERMS)
  async upsertFeedback(
    @Param('warmPathUid') warmPathUid: string,
    @Body() dto: UpsertWarmPathFeedbackDto,
    @Req() req: AuthedRequest
  ) {
    return this.warmIntrosV2Service.upsertPathFeedback(warmPathUid, dto, await this.resolveActor(req));
  }

  @NoCache()
  @Put('paths/:warmPathUid/notes')
  @RequirePermissions(VIEW_PERMS)
  async upsertNote(
    @Param('warmPathUid') warmPathUid: string,
    @Body() dto: UpsertWarmPathNoteDto,
    @Req() req: AuthedRequest
  ) {
    return this.warmIntrosV2Service.upsertPathNote(warmPathUid, dto, await this.resolveActor(req));
  }

  @NoCache()
  @Delete('paths/:warmPathUid/feedback/refer')
  @RequirePermissions(VIEW_PERMS)
  async clearRefer(
    @Param('warmPathUid') warmPathUid: string,
    @Body() dto: ClearWarmPathReferDto,
    @Req() req: AuthedRequest
  ) {
    return this.warmIntrosV2Service.clearPathRefer(warmPathUid, dto, await this.resolveActor(req));
  }

  @NoCache()
  @Get('edges')
  @RequirePermissions(VIEW_PERMS)
  async listEdges(@Query() query: ListConnectionEdgesQueryDto) {
    return this.warmIntrosV2Service.listEdges(query);
  }

  private async resolveActor(req: AuthedRequest): Promise<FeedbackActor> {
    const base = actorOf(req);
    if (base.uid) return base;
    if (!base.email) return base;
    const member = await this.rbacService.findMemberByEmail(base.email);
    return { uid: member?.uid ?? null, email: base.email };
  }

  private async canEditInvestorDb(memberUid: string | null): Promise<boolean> {
    if (!memberUid) return false;
    for (const code of [RBAC_PERMISSION_CODES.INVESTOR_DB_EDIT, ADMIN_PERMISSIONS.DIRECTORY_FULL]) {
      try {
        const check = await this.accessControlV2Service.hasPermission(memberUid, code);
        if (check.allowed) return true;
      } catch {
        // fall through to v1
      }
      if (await this.rbacService.hasPermission(memberUid, code)) return true;
    }
    return false;
  }
}
