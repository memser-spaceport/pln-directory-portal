import {
  All,
  BadRequestException,
  Controller,
  Logger,
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
import { ANALYTICS_EVENTS } from '../utils/constants';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { MasterProfileService } from '../master-profile/master-profile.service';
import { WarmIntrosV2Service } from '../warm-intros-v2/warm-intros-v2.service';
import { MembersService } from '../members/members.service';
import { TeamsService } from '../teams/teams.service';
import { ProjectsService } from '../projects/projects.service';
import { PLEventGuestsService } from '../pl-events/pl-event-guests.service';
import { PLEventLocationsService } from '../pl-events/pl-event-locations.service';
import { PLEventsService } from '../pl-events/pl-events.service';
import { SearchService } from '../search/search.service';
import { AiAppsService } from '../ai-apps/ai-apps.service';
import { PlNetworkPortfolioService } from '../spv-spotlights/pl-network-portfolio.service';
import { aiAppFeedbackTools } from './mcp-ai-app-feedback-tools';
import { trackMcpToolInvocation } from './mcp-analytics';
import { directoryTools } from './mcp-directory-tools';
import { McpOAuthService } from './mcp-oauth.service';
import { portfolioTools } from './mcp-portfolio-tools';
import { newsTools } from './mcp-news-tools';
import { eventWriteTools, newsWriteTools, profileTools } from './mcp-write-tools';
import { McpWriteLimitService } from './mcp-write-limit.service';
import { TeamNewsService } from '../team-news/team-news.service';
import { MembersHooksService } from '../members/members.hooks.service';
import { PrismaService } from '../shared/prisma.service';
import { TeamNewsQueryService } from '../team-news/team-news-query.service';
import { TeamNewsSuggestionsService } from '../team-news/team-news-suggestions.service';
import { McpToolDef, toolInputSchema, toolsForPermissions, WHOAMI_TOOL, warmIntroTools } from './mcp-tools';
import { McpAdminCaps, McpScopesService, resolveScope } from './mcp-scopes.service';
import { McpAccessRequestsService } from './mcp-access-requests.service';
import { calledToolNames, MCP_NEEDS_WRITE_NOTE, McpRefusalReason, planTools, refusalText } from './mcp-tool-plan';
import { isWriteTool, toolScope } from './mcp-scopes.registry';
import { mcpSettingsUrl } from './mcp.constants';

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
    private readonly aiApps: AiAppsService,
    private readonly portfolio: PlNetworkPortfolioService,
    private readonly analytics: AnalyticsService,
    private readonly scopes: McpScopesService,
    private readonly accessRequests: McpAccessRequestsService,
    private readonly newsQuery: TeamNewsQueryService,
    private readonly newsSuggestions: TeamNewsSuggestionsService,
    private readonly teamNews: TeamNewsService,
    private readonly memberHooks: MembersHooksService,
    private readonly prisma: PrismaService,
    private readonly writeLimit: McpWriteLimitService,
    private readonly eventGuests: PLEventGuestsService,
    private readonly eventLocations: PLEventLocationsService
  ) {}

  private readonly logger = new Logger(McpController.name);

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
    let caps: McpAdminCaps | null = null;
    try {
      caps = await this.scopes.adminCaps();
    } catch (error) {
      // Fail closed (LAB-2995): without admin caps only `whoami` runs.
      this.logger.error(`MCP scope settings unavailable: ${String(error)}`);
    }
    const plan = planTools(
      toolsForPermissions(permissions, [
        WHOAMI_TOOL,
        ...warmIntroTools(this.masterProfiles, this.warmIntros),
        ...directoryTools(this.members, this.teams, this.projects, this.plEvents, this.search),
        ...aiAppFeedbackTools(this.aiApps),
        ...portfolioTools(this.portfolio),
        ...newsTools(this.newsQuery, this.newsSuggestions),
        ...newsWriteTools(this.teamNews, this.newsQuery, this.members),
        ...profileTools(this.members, this.memberHooks, this.prisma),
        ...eventWriteTools(this.eventGuests, this.eventLocations, this.members, this.prisma),
      ]),
      actor.scopeLevels,
      caps
    );
    const calledTools = calledToolNames(req.body);

    const server = new McpServer({ name: 'LabOS', version: '1.0.0' });
    const aiAppsWrite = caps !== null && resolveScope(actor.scopeLevels, caps, 'ai_apps').level === 'write';
    const ctx = {
      memberUid: actor.memberUid,
      name: actor.name,
      email: actor.email,
      permissions,
      authorizationUid: actor.authorizationUid,
      clientName: actor.clientName,
      agentAccess: aiAppsWrite ? ('write' as const) : ('read' as const),
    };
    const register = (
      tool: McpToolDef,
      description: string,
      cb: (args?: Record<string, unknown>) => unknown,
      withSchema = true
    ) => {
      const config: { description: string; inputSchema?: unknown } = { description };
      if (withSchema && tool.inputSchema) {
        config.inputSchema = toolInputSchema(tool);
      }
      // MCP SDK registerTool generics blow up TS2589 when passed a union config.
      (
        server.registerTool as (
          name: string,
          cfg: typeof config,
          cb: (args?: Record<string, unknown>) => unknown
        ) => void
      )(tool.name, config, cb);
    };
    const refuse = (tool: McpToolDef, reason: McpRefusalReason) => async () => {
      const entry = toolScope(tool.name);
      if (!entry) {
        return { isError: true, content: [{ type: 'text' as const, text: `Tool ${tool.name} not found` }] };
      }
      if (reason !== 'unavailable') {
        void this.analytics.trackEvent({
          name: ANALYTICS_EVENTS.MCP.TOOL_REFUSED,
          distinctId: actor.memberUid,
          properties: {
            toolName: tool.name,
            scope: entry.scope,
            reason,
            memberUid: actor.memberUid,
            clientName: actor.clientName,
            authorizationUid: actor.authorizationUid,
          },
        });
      }
      let settingsUrl = mcpSettingsUrl();
      if (reason === 'needs_write' || reason === 'scope_none') {
        try {
          const requestUid = await this.accessRequests.createOrReuse(
            actor.authorizationUid,
            entry.scope,
            entry.level,
            tool.name
          );
          settingsUrl = `${settingsUrl}?request=${encodeURIComponent(requestUid)}`;
        } catch (error) {
          // The refusal still goes out, with the plain Settings link.
          this.logger.error(`MCP access request not stored: ${String(error)}`);
        }
      }
      return {
        isError: true,
        content: [
          { type: 'text' as const, text: refusalText(reason, entry.scope, entry.level, settingsUrl, tool.name) },
        ],
      };
    };

    for (const entry of plan) {
      const { tool } = entry;
      if (entry.mode === 'listed_refused') {
        register(tool, `${MCP_NEEDS_WRITE_NOTE} ${tool.description}`, refuse(tool, entry.reason));
        continue;
      }
      if (entry.mode === 'hidden') {
        // Registered only to answer a call that names it, so `tools/list` never shows it. No input schema, so any
        // arguments reach the refusal instead of a validation error.
        if (calledTools.has(tool.name)) {
          register(tool, tool.description, refuse(tool, entry.reason), false);
        }
        continue;
      }
      register(tool, tool.description, async (args) => {
        const toolArgs = args ?? {};
        // Per-member hourly allowance for agent writes (LAB-3020).
        if (isWriteTool(tool.name) && !(await this.writeLimit.tryConsume(actor.memberUid, tool.name))) {
          return refuse(tool, 'rate_limited')();
        }
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
