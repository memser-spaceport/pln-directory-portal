import { Body, Controller, Get, Header, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { NoCache } from '../decorators/no-cache.decorator';
import { MCP_CLIENT_REGISTER_LIMIT, MCP_CLIENT_REGISTER_TTL_SECONDS } from './mcp.constants';
import { McpOAuthService } from './mcp-oauth.service';

@ApiTags('MCP OAuth')
@Controller()
export class McpOAuthController {
  constructor(private readonly oauth: McpOAuthService) {}

  @NoCache()
  @Get('.well-known/oauth-protected-resource')
  @Header('Cache-Control', 'no-store')
  protectedResourceMetadata() {
    return this.oauth.protectedResourceMetadata();
  }

  @NoCache()
  @Get('.well-known/oauth-protected-resource/mcp')
  @Header('Cache-Control', 'no-store')
  protectedResourceMetadataAlias() {
    return this.oauth.protectedResourceMetadata();
  }

  @NoCache()
  @Get('.well-known/oauth-authorization-server')
  @Header('Cache-Control', 'no-store')
  authorizationServerMetadata() {
    return this.oauth.authorizationServerMetadata();
  }

  @NoCache()
  @Post('register')
  @Throttle(MCP_CLIENT_REGISTER_LIMIT, MCP_CLIENT_REGISTER_TTL_SECONDS)
  async register(@Body() body: Record<string, unknown>) {
    return this.oauth.registerClient({
      client_name: typeof body.client_name === 'string' ? body.client_name : undefined,
      redirect_uris: Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : undefined,
    });
  }

  @NoCache()
  @Get('oauth/clients/:clientId')
  @Header('Cache-Control', 'no-store')
  clientInfo(@Param('clientId') clientId: string, @Query('redirect_uri') redirectUri?: string | string[]) {
    const uri = Array.isArray(redirectUri) ? redirectUri[0] : redirectUri;
    return this.oauth.getClientInfo(clientId, uri);
  }

  @NoCache()
  @Get('oauth/authorize')
  async authorize(@Query() query: Record<string, string>, @Res() res: Response) {
    const location = await this.oauth.buildConsentRedirect(query);
    return res.redirect(302, location);
  }

  @NoCache()
  @Post('oauth/token')
  async token(@Req() req: Request) {
    const body = (req.body ?? {}) as Record<string, string>;
    return this.oauth.exchangeToken(body);
  }

  @NoCache()
  @Post('oauth/revoke')
  async revoke(@Req() req: Request) {
    const body = (req.body ?? {}) as Record<string, string>;
    await this.oauth.revokeToken(body.token);
    return { revoked: true };
  }
}
