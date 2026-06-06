import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermissions } from '../rbac/rbac.decorator';
import { RBAC_PERMISSION_CODES } from '../rbac/rbac.constants';
import { ADMIN_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { ListMembersQueryDto } from './dto/list-members.query.dto';
import { AddListMemberDto } from './dto/membership.dto';
import { InvestorListsQueryService } from './investor-lists-query.service';
import { InvestorListsService, ListMembershipActor } from './investor-lists.service';

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

function actorOf(req: AuthedRequest): ListMembershipActor {
  return {
    uid: req.memberUid ?? req.user?.memberUid ?? req.user?.sub ?? null,
    email: req.userEmail ?? req.user?.email ?? null,
  };
}

function parseListId(raw: string): number {
  const id = parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw new BadRequestException(`Invalid listId: ${raw}`);
  }
  return id;
}

/**
 * Investor Lists — curated target sets of investors for the warm-intros workspace.
 * Reuses the Investor DB permissions (no new perms): view to read, edit to mutate membership.
 */
@ApiTags('Investor Lists')
@Controller('v1/investor-lists')
@UseGuards(UserTokenCheckGuard, RbacGuard)
export class InvestorListsController {
  constructor(
    private readonly queryService: InvestorListsQueryService,
    private readonly listsService: InvestorListsService
  ) {}

  @NoCache()
  @Get()
  @RequirePermissions(VIEW_PERMS)
  async listLists() {
    return this.queryService.listLists();
  }

  @NoCache()
  @Get(':listId/members')
  @RequirePermissions(VIEW_PERMS)
  async listMembers(@Param('listId') listId: string, @Query() query: ListMembersQueryDto) {
    return this.queryService.listMembers(parseListId(listId), query);
  }

  @Post(':listId/members')
  @RequirePermissions(EDIT_PERMS)
  async addMember(@Param('listId') listId: string, @Body() dto: AddListMemberDto, @Req() req: AuthedRequest) {
    return this.listsService.addMember(parseListId(listId), dto, actorOf(req));
  }

  @Delete(':listId/members/:investorId')
  @RequirePermissions(EDIT_PERMS)
  async removeMember(@Param('listId') listId: string, @Param('investorId') investorId: string) {
    return this.listsService.removeMember(parseListId(listId), investorId);
  }
}
