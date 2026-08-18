import { All, Controller, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { NoCache } from '../decorators/no-cache.decorator';
import { SkipEmptyStringToNull } from '../decorators/skip-empty-string-to-null.decorator';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { McpOAuthService } from './mcp-oauth.service';
import { toolsForPermissions } from './mcp-tools';

@ApiTags('MCP')
@Controller('mcp')
@SkipEmptyStringToNull()
export class McpController {
  constructor(private readonly oauth: McpOAuthService, private readonly accessControl: AccessControlV2Service) {}

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
    const tools = toolsForPermissions(permissions);

    const server = new McpServer({ name: 'LabOS', version: '1.0.0' });
    for (const tool of tools) {
      server.registerTool(tool.name, { description: tool.description }, async () => ({
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              await tool.execute({
                memberUid: actor.memberUid,
                name: actor.name,
                email: actor.email,
                permissions,
              })
            ),
          },
        ],
      }));
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
