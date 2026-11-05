import { Body, Controller, Delete, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserAccessTokenValidateGuard } from '../guards/user-access-token-validate.guard';
import { RequirePermissions } from '../rbac/rbac.decorator';
import { RBAC_PERMISSION_CODES } from '../rbac/rbac.constants';
import { RbacGuard } from '../rbac/rbac.guard';
import { RbacService } from '../rbac/rbac.service';
import { McpLimitService } from './mcp-limit.service';

type LimitRequest = {
  memberUid?: string;
  userEmail?: string;
  user?: { memberUid?: string; uid?: string; email?: string };
};

/** Directory-admin view of MCP limits. Uses the LabOS session, same as Settings (LAB-3150). */
@ApiTags('MCP')
@Controller('v1/admin/mcp/limits')
@UseGuards(UserAccessTokenValidateGuard, RbacGuard)
@RequirePermissions({ anyOf: [RBAC_PERMISSION_CODES.DIRECTORY_ADMIN] })
export class McpAdminLimitsController {
  constructor(private readonly limits: McpLimitService, private readonly rbac: RbacService) {}

  private async actorUid(req: LimitRequest): Promise<string | null> {
    const direct = req.memberUid ?? req.user?.memberUid ?? req.user?.uid;
    if (direct) return direct;
    const email = req.userEmail ?? req.user?.email;
    if (!email) return null;
    const member = await this.rbac.findMemberByEmail(email);
    return member?.uid ?? null;
  }

  @NoCache()
  @Get()
  view(@Query('q') q?: string) {
    return this.limits.adminView(q);
  }

  /** Body: `{ callType, limit, endsAt? }`. `endsAt` is an ISO time, or null for no end date. */
  @NoCache()
  @Put(':memberUid')
  async set(
    @Param('memberUid') memberUid: string,
    @Body() body: unknown,
    @Req() req: LimitRequest
  ) {
    return this.limits.setOverride(memberUid, body, await this.actorUid(req));
  }

  @NoCache()
  @Delete(':memberUid/:callType')
  async remove(
    @Param('memberUid') memberUid: string,
    @Param('callType') callType: string,
    @Req() req: LimitRequest
  ) {
    return this.limits.removeOverride(memberUid, callType, await this.actorUid(req));
  }
}
