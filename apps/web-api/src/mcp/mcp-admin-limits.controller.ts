import { Body, Controller, Delete, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NoCache } from '../decorators/no-cache.decorator';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { McpLimitService } from './mcp-limit.service';

function actorUid(req: { user?: { memberUid?: string; uid?: string } }): string | null {
  return req.user?.memberUid ?? req.user?.uid ?? null;
}

/** Directory-admin view of MCP limits, usage and per-member overrides (LAB-3150). */
@ApiTags('MCP')
@Controller('v1/admin/mcp/limits')
@UseGuards(AdminAuthGuard)
export class McpAdminLimitsController {
  constructor(private readonly limits: McpLimitService) {}

  @NoCache()
  @Get()
  view(@Query('q') q?: string) {
    return this.limits.adminView(q);
  }

  /** Body: `{ callType, limit, endsAt? }`. `endsAt` is an ISO time, or null for no end date. */
  @NoCache()
  @Put(':memberUid')
  set(
    @Param('memberUid') memberUid: string,
    @Body() body: unknown,
    @Req() req: { user?: { memberUid?: string; uid?: string } }
  ) {
    return this.limits.setOverride(memberUid, body, actorUid(req));
  }

  @NoCache()
  @Delete(':memberUid/:callType')
  remove(
    @Param('memberUid') memberUid: string,
    @Param('callType') callType: string,
    @Req() req: { user?: { memberUid?: string; uid?: string } }
  ) {
    return this.limits.removeOverride(memberUid, callType, actorUid(req));
  }
}
