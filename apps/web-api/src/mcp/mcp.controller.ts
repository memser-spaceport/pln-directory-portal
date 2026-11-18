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
import { trackMcpToolCalled, trackMcpToolInvocation } from './mcp-analytics';
import { McpOAuthService } from './mcp-oauth.service';
import { countContactMembers } from './mcp-contact-count';
import { McpLimitService } from './mcp-limit.service';
import { contactPageRefusalText, limitRefusalText, limitWarningText } from './mcp-limit.messages';
import { McpLimitDecision } from './mcp-limits.config';
import { McpToolDef, toolInputSchema } from './mcp-tools';
import { McpAdminCaps, McpScopesService, resolveScope } from './mcp-scopes.service';
import { McpAccessRequestsService } from './mcp-access-requests.service';
import { calledToolNames, MCP_NEEDS_WRITE_NOTE, McpRefusalReason, planTools, refusalText } from './mcp-tool-plan';
import { toolCallType, toolScope } from './mcp-scopes.registry';
import { mcpSettingsUrl } from './mcp.constants';
import { McpToolCatalog } from './mcp-tool-catalog';

@ApiTags('MCP')
@Controller('mcp')
@SkipEmptyStringToNull()
export class McpController {
  constructor(
    private readonly oauth: McpOAuthService,
    private readonly accessControl: AccessControlV2Service,
    private readonly analytics: AnalyticsService,
    private readonly scopes: McpScopesService,
    private readonly accessRequests: McpAccessRequestsService,
    private readonly limits: McpLimitService,
    private readonly catalog: McpToolCatalog
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
    const plan = planTools(this.catalog.forPermissions(permissions), actor.scopeLevels, caps);
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
      trackMcpToolCalled(this.analytics, actor, { toolName: tool.name, result: 'refused', reason });
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
        content: [{ type: 'text' as const, text: refusalText(reason, entry.scope, entry.level, settingsUrl) }],
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
      const refuseLimited = (decision: McpLimitDecision) => {
        const reason = decision.unavailable ? 'limit_unavailable' : 'rate_limited';
        trackMcpToolCalled(this.analytics, actor, {
          toolName: tool.name,
          result: 'refused',
          reason,
          callType: decision.callType,
          limitResult: 'limited',
        });
        const scopeEntry = toolScope(tool.name);
        if (scopeEntry) {
          void this.analytics.trackEvent({
            name: ANALYTICS_EVENTS.MCP.TOOL_REFUSED,
            distinctId: actor.memberUid,
            properties: {
              toolName: tool.name,
              scope: scopeEntry.scope,
              reason,
              callType: decision.callType,
              memberUid: actor.memberUid,
              clientName: actor.clientName,
              authorizationUid: actor.authorizationUid,
            },
          });
        }
        return {
          isError: true as const,
          content: [{ type: 'text' as const, text: limitRefusalText(decision) }],
        };
      };

      register(tool, tool.description, async (args) => {
        const toolArgs = args ?? {};
        const callType = toolCallType(tool.name);
        if (callType === 'contact_read') {
          const peek = await this.limits.peek(actor.memberUid, callType);
          if (!peek.allowed) return refuseLimited(peek);
          try {
            const result = await tool.execute(ctx, toolArgs);
            const contacts = countContactMembers(result);
            if (contacts > peek.remaining) {
              trackMcpToolCalled(this.analytics, actor, {
                toolName: tool.name,
                result: 'refused',
                reason: 'rate_limited',
                callType: 'contact_read',
                limitResult: 'limited',
              });
              return {
                isError: true as const,
                content: [{ type: 'text' as const, text: contactPageRefusalText(peek, contacts) }],
              };
            }
            const decision =
              contacts > 0 ? await this.limits.tryConsume(actor.memberUid, callType, Date.now(), contacts) : peek;
            if (!decision.allowed) return refuseLimited(decision);
            trackMcpToolInvocation(this.analytics, actor, {
              toolName: tool.name,
              args: toolArgs,
              result,
              success: true,
              isError: false,
            });
            trackMcpToolCalled(this.analytics, actor, {
              toolName: tool.name,
              result: 'ok',
              args: toolArgs,
              output: result,
              callType: 'contact_read',
              limitResult: decision.warned ? 'warned' : 'allowed',
            });
            const content = [{ type: 'text' as const, text: JSON.stringify(result) }];
            if (decision.warned) content.push({ type: 'text' as const, text: limitWarningText(decision) });
            return { content };
          } catch (error) {
            const isSoftError = error instanceof NotFoundException || error instanceof BadRequestException;
            trackMcpToolInvocation(this.analytics, actor, {
              toolName: tool.name,
              args: toolArgs,
              success: false,
              isError: isSoftError,
              error,
            });
            trackMcpToolCalled(this.analytics, actor, {
              toolName: tool.name,
              result: 'error',
              args: toolArgs,
              error,
              callType: 'contact_read',
              limitResult: 'allowed',
            });
            if (isSoftError) {
              return { isError: true as const, content: [{ type: 'text' as const, text: String(error.message) }] };
            }
            throw error;
          }
        }
        let decision: McpLimitDecision | null = null;
        if (callType) {
          decision = await this.limits.tryConsume(actor.memberUid, callType);
          if (!decision.allowed) {
            const reason = decision.unavailable ? 'limit_unavailable' : 'rate_limited';
            trackMcpToolCalled(this.analytics, actor, {
              toolName: tool.name,
              result: 'refused',
              reason,
              callType: decision.callType,
              limitResult: 'limited',
            });
            const entry = toolScope(tool.name);
            if (entry) {
              void this.analytics.trackEvent({
                name: ANALYTICS_EVENTS.MCP.TOOL_REFUSED,
                distinctId: actor.memberUid,
                properties: {
                  toolName: tool.name,
                  scope: entry.scope,
                  reason,
                  callType: decision.callType,
                  memberUid: actor.memberUid,
                  clientName: actor.clientName,
                  authorizationUid: actor.authorizationUid,
                },
              });
            }
            return {
              isError: true,
              content: [{ type: 'text' as const, text: limitRefusalText(decision) }],
            };
          }
        }
        const limitResult = decision?.warned ? 'warned' : decision ? 'allowed' : undefined;
        try {
          const result = await tool.execute(ctx, toolArgs);
          trackMcpToolInvocation(this.analytics, actor, {
            toolName: tool.name,
            args: toolArgs,
            result,
            success: true,
            isError: false,
          });
          trackMcpToolCalled(this.analytics, actor, {
            toolName: tool.name,
            result: 'ok',
            args: toolArgs,
            output: result,
            callType: decision?.callType,
            limitResult,
          });
          const content = [{ type: 'text' as const, text: JSON.stringify(result) }];
          if (decision?.warned) {
            content.push({ type: 'text' as const, text: limitWarningText(decision) });
          }
          return { content };
        } catch (error) {
          const isSoftError = error instanceof NotFoundException || error instanceof BadRequestException;
          trackMcpToolInvocation(this.analytics, actor, {
            toolName: tool.name,
            args: toolArgs,
            success: false,
            isError: isSoftError,
            error,
          });
          trackMcpToolCalled(this.analytics, actor, {
            toolName: tool.name,
            result: 'error',
            args: toolArgs,
            error,
            callType: decision?.callType,
            limitResult,
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
