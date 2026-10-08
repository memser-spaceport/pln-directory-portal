import { Body, Controller, Post, Req, UnauthorizedException, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { Request } from 'express';
import { NoCache } from '../decorators/no-cache.decorator';
import { MintMcpAppSessionDto } from './dto/mint-mcp-app-session.dto';
import { McpAppSessionService } from './mcp-app-session.service';

function mcpAccessToken(req: Request): string | undefined {
  const [type, token] = req.headers.authorization?.split(' ') ?? [];
  if (type === 'Bearer' && token) {
    return token;
  }
}

/**
 * Agent route. Authenticates the MCP access token itself, so it does not use the member JWT guard.
 * A member LabOS token is not a credential here.
 */
@ApiTags('MCP')
@Controller('v1/mcp')
export class McpAppSessionsController {
  constructor(private readonly sessions: McpAppSessionService) {}

  @NoCache()
  @Post('app-sessions')
  @UsePipes(ZodValidationPipe)
  async mint(@Body() body: MintMcpAppSessionDto, @Req() req: Request) {
    const token = mcpAccessToken(req);
    if (!token) {
      throw new UnauthorizedException('MCP OAuth token required');
    }
    return this.sessions.mint(token, body.appId);
  }
}
