import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NoCache } from '../decorators/no-cache.decorator';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { McpScopesService } from './mcp-scopes.service';

/** Admin maximum level per MCP scope, for every connection (LAB-2995). No admin UI yet. */
@ApiTags('MCP')
@Controller('v1/admin/mcp/scopes')
@UseGuards(AdminAuthGuard)
export class McpAdminScopesController {
  constructor(private readonly scopes: McpScopesService) {}

  @NoCache()
  @Get()
  list() {
    return this.scopes.adminScopes();
  }

  /** Body: `{ scopes: { [scope]: 'none' | 'read' | 'write' } }`. Unlisted scopes keep their setting. */
  @NoCache()
  @Put()
  update(@Body() body: unknown, @Req() req: any) {
    return this.scopes.setAdminScopes(body, req.user?.memberUid ?? req.user?.uid ?? null);
  }
}
