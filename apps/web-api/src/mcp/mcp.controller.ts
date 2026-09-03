import {
  All,
  BadRequestException,
  Controller,
  NotFoundException,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { NoCache } from '../decorators/no-cache.decorator';
import { SkipEmptyStringToNull } from '../decorators/skip-empty-string-to-null.decorator';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { MasterProfileService } from '../master-profile/master-profile.service';
import { WarmIntrosV2Service } from '../warm-intros-v2/warm-intros-v2.service';
import { MembersService } from '../members/members.service';
import { TeamsService } from '../teams/teams.service';
import { ProjectsService } from '../projects/projects.service';
import { PLEventsService } from '../pl-events/pl-events.service';
import { SearchService } from '../search/search.service';
import { trackMcpToolInvocation } from './mcp-analytics';
import { directoryTools } from './mcp-directory-tools';
import { McpOAuthService } from './mcp-oauth.service';
import { toolsForPermissions, WHOAMI_TOOL, warmIntroTools } from './mcp-tools';

@ApiTags('MCP')
@Controller('mcp')
@SkipEmptyStringToNull()
export class McpController {
  constructor(
    private readonly oauth: McpOAuthService,
    private readonly accessControl: AccessControlV2Service,
    private readonly masterProfiles: MasterProfileService,
    private readonly warmIntros: WarmIntrosV2Service,
    private readonly members: MembersService,
    private readonly teams: TeamsService,
    private readonly projects: ProjectsService,
    private readonly plEvents: PLEventsService,
    private readonly search: SearchService,
    private readonly analytics: AnalyticsService
  ) {}

  @NoCache()
  @All()
  async handle(@Req() req: Request, @Res() res: Response) {
    const token = this.bearerToken(req);
    if (!token) {
      this.unauthorized(res);
      return;
    }

    let actor;
    try {
      actor = await this.oauth.authenticateAccessToken(token);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.unauthorized(res);
        return;
      }
      throw error;
    }

    const access = await this.accessControl.getMemberAccess(actor.memberUid);
    const permissions = new Set(access.effectivePermissions ?? []);
    const tools = toolsForPermissions(permissions, [
      WHOAMI_TOOL,
      ...warmIntroTools(this.masterProfiles, this.warmIntros),
      ...directoryTools(this.members, this.teams, this.projects, this.plEvents, this.search),
    ]);

    const server = new McpServer({ name: 'LabOS', version: '1.0.0' });
    const ctx = {
      memberUid: actor.memberUid,
      name: actor.name,
      email: actor.email,
      permissions,
      authorizationUid: actor.authorizationUid,
      clientName: actor.clientName,
    };
    for (const tool of tools) {
      const config: { description: string; inputSchema?: Record<string, unknown> } = {
        description: tool.description,
      };
      if (tool.inputSchema) {
        config.inputSchema = tool.inputSchema;
      }
      // MCP SDK registerTool generics blow up TS2589 when passed a union config.
      (
        server.registerTool as (
          name: string,
          cfg: typeof config,
          cb: (args?: Record<string, unknown>) => unknown
        ) => void
      )(tool.name, config, async (args) => {
        const toolArgs = args ?? {};
        try {
          const result = await tool.execute(ctx, toolArgs);
          trackMcpToolInvocation(this.analytics, actor, {
            toolName: tool.name,
            args: toolArgs,
            result,
            success: true,
            isError: false,
          });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          };
        } catch (error) {
          const isSoftError = error instanceof NotFoundException || error instanceof BadRequestException;
          trackMcpToolInvocation(this.analytics, actor, {
            toolName: tool.name,
            args: toolArgs,
            success: false,
            isError: isSoftError,
            error,
          });
          if (isSoftError) {
            return {
              isError: true,
              content: [{ type: 'text' as const, text: String(error.message) }],
            };
          }
          throw error;
        }
      });
    }

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } finally {
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  }

  private bearerToken(req: Request): string | undefined {
    const [type, token] = req.headers.authorization?.split(' ') ?? [];
    if (type === 'Bearer' && token) {
      return token;
    }
  }

  private unauthorized(res: Response) {
    res.setHeader('WWW-Authenticate', this.oauth.wwwAuthenticateHeader());
    res.status(401).json({ error: 'invalid_token', error_description: 'MCP OAuth token required' });
  }
}
