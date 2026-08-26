import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import {
  MCP_ACCESS_TOKEN_TTL_SEC,
  MCP_AUTH_CODE_TTL_MS,
  MCP_CONNECT_PERMISSION,
  MCP_REFRESH_TOKEN_TTL_MS,
  MCP_SCOPE,
  MCP_TOKEN_PREFIX,
  mcpConsentUrl,
  mcpIssuerUrl,
  mcpResourceUrl,
} from './mcp.constants';
import { generateSecret, hashSecret, verifyPkceS256 } from './mcp.crypto';
import { isAllowedRedirectUri, isRegisteredRedirectUri } from './mcp-redirect';

export type McpTokenActor = {
  authorizationUid: string;
  memberUid: string;
  email: string | null;
  name: string;
  clientName: string;
};

type RegisterBody = {
  client_name?: string;
  redirect_uris?: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
};

type AuthorizeQuery = {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  resource?: string;
  scope?: string;
};

type ApproveInput = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state?: string;
  resource?: string;
};

type TokenInput = {
  grant_type?: string;
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
  refresh_token?: string;
  client_id?: string;
  resource?: string;
};

@Injectable()
export class McpOAuthService {
  constructor(private readonly prisma: PrismaService, private readonly accessControl: AccessControlV2Service) {}

  protectedResourceMetadata() {
    const resource = mcpResourceUrl();
    return {
      resource,
      authorization_servers: [mcpIssuerUrl()],
      bearer_methods_supported: ['header'],
      scopes_supported: [MCP_SCOPE],
    };
  }

  authorizationServerMetadata() {
    const issuer = mcpIssuerUrl();
    return {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/register`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [MCP_SCOPE],
    };
  }

  wwwAuthenticateHeader(): string {
    const metadata = `${mcpIssuerUrl()}/.well-known/oauth-protected-resource`;
    return `Bearer realm="labos", resource_metadata="${metadata}"`;
  }

  async registerClient(body: RegisterBody) {
    const redirectUris = (body.redirect_uris ?? []).filter(Boolean);
    if (!redirectUris.length || !redirectUris.every(isAllowedRedirectUri)) {
      throw new BadRequestException('redirect_uris must be loopback, https, or a private-use URI scheme');
    }

    const clientId = generateSecret(MCP_TOKEN_PREFIX.client);
    const clientName = (body.client_name || 'MCP client').trim().slice(0, 120);

    await this.prisma.mcpOAuthClient.create({
      data: { clientId, clientName, redirectUris },
    });

    return {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  async buildConsentRedirect(query: AuthorizeQuery): Promise<string> {
    const clientId = query.client_id?.trim();
    const redirectUri = query.redirect_uri?.trim();
    const challenge = query.code_challenge?.trim();
    if (!clientId || !redirectUri || !challenge) {
      throw new BadRequestException('client_id, redirect_uri, and code_challenge are required');
    }
    if (query.response_type && query.response_type !== 'code') {
      throw new BadRequestException('response_type must be code');
    }
    if (query.code_challenge_method && query.code_challenge_method !== 'S256') {
      throw new BadRequestException('code_challenge_method must be S256');
    }

    const client = await this.prisma.mcpOAuthClient.findUnique({ where: { clientId } });
    if (!client) {
      throw new BadRequestException('Unknown client_id');
    }
    if (!isRegisteredRedirectUri(redirectUri, client.redirectUris)) {
      throw new BadRequestException('redirect_uri is not registered for this client');
    }
    this.assertResource(query.resource);

    const params = new URLSearchParams();
    params.set('client_id', clientId);
    params.set('redirect_uri', redirectUri);
    params.set('code_challenge', challenge);
    params.set('code_challenge_method', 'S256');
    params.set('client_name', client.clientName);
    if (query.state) params.set('state', query.state);
    if (query.resource) params.set('resource', query.resource);
    if (query.scope) params.set('scope', query.scope);
    return `${mcpConsentUrl()}?${params.toString()}`;
  }

  async approve(memberUid: string, input: ApproveInput): Promise<{ redirectUrl: string }> {
    const { allowed } = await this.accessControl.hasPermission(memberUid, MCP_CONNECT_PERMISSION);
    if (!allowed) {
      throw new ForbiddenException(`Missing permission: ${MCP_CONNECT_PERMISSION}`);
    }

    if (input.codeChallengeMethod !== 'S256') {
      throw new BadRequestException('code_challenge_method must be S256');
    }

    const client = await this.prisma.mcpOAuthClient.findUnique({ where: { clientId: input.clientId } });
    if (!client) {
      throw new BadRequestException('Unknown client_id');
    }
    if (!isRegisteredRedirectUri(input.redirectUri, client.redirectUris)) {
      throw new BadRequestException('redirect_uri is not registered for this client');
    }
    this.assertResource(input.resource);

    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      select: { uid: true, name: true, email: true },
    });
    if (!member) {
      throw new ForbiddenException('Member not found');
    }

    const authorization = await this.prisma.mcpAuthorization.upsert({
      where: { memberUid_clientId: { memberUid, clientId: input.clientId } },
      create: {
        memberUid,
        clientId: input.clientId,
        clientName: client.clientName,
        connectedAt: new Date(),
      },
      update: {
        clientName: client.clientName,
        connectedAt: new Date(),
        revokedAt: null,
      },
    });

    const code = generateSecret(MCP_TOKEN_PREFIX.code);
    await this.prisma.mcpAuthCode.create({
      data: {
        codeHash: hashSecret(code),
        codeChallenge: input.codeChallenge,
        clientId: input.clientId,
        redirectUri: input.redirectUri,
        resource: input.resource || mcpResourceUrl(),
        memberUid,
        authorizationUid: authorization.uid,
        expiresAt: new Date(Date.now() + MCP_AUTH_CODE_TTL_MS),
      },
    });

    const redirect = new URL(input.redirectUri);
    redirect.searchParams.set('code', code);
    if (input.state) {
      redirect.searchParams.set('state', input.state);
    }
    return { redirectUrl: redirect.toString() };
  }

  async exchangeToken(input: TokenInput) {
    if (input.grant_type === 'authorization_code') {
      return this.exchangeAuthorizationCode(input);
    }
    if (input.grant_type === 'refresh_token') {
      return this.exchangeRefreshToken(input);
    }
    throw new BadRequestException('unsupported grant_type');
  }

  async revokeToken(token?: string) {
    if (!token) {
      return;
    }
    const tokenHash = hashSecret(token);
    const authorization = await this.prisma.mcpAuthorization.findFirst({
      where: {
        OR: [{ accessTokenHash: tokenHash }, { refreshTokenHash: tokenHash }],
        revokedAt: null,
      },
    });
    if (!authorization) {
      return;
    }
    await this.revokeAuthorization(authorization.uid);
  }

  async listAuthorizations(memberUid: string) {
    const rows = await this.prisma.mcpAuthorization.findMany({
      where: { memberUid, revokedAt: null },
      orderBy: { connectedAt: 'desc' },
      select: {
        uid: true,
        clientName: true,
        connectedAt: true,
        lastUsedAt: true,
      },
    });
    return { items: rows };
  }

  async revokeAuthorizationForMember(memberUid: string, uid: string) {
    const row = await this.prisma.mcpAuthorization.findFirst({
      where: { uid, memberUid, revokedAt: null },
    });
    if (!row) {
      throw new BadRequestException('Authorization not found');
    }
    await this.revokeAuthorization(uid);
    return { ok: true };
  }

  async authenticateAccessToken(token: string): Promise<McpTokenActor> {
    const authorization = await this.prisma.mcpAuthorization.findUnique({
      where: { accessTokenHash: hashSecret(token) },
      include: { member: { select: { uid: true, name: true, email: true } } },
    });
    if (!authorization || authorization.revokedAt || !authorization.accessExpiresAt) {
      throw new UnauthorizedException('Invalid MCP token');
    }
    if (authorization.accessExpiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('MCP token expired');
    }

    const { allowed } = await this.accessControl.hasPermission(authorization.memberUid, MCP_CONNECT_PERMISSION);
    if (!allowed) {
      throw new ForbiddenException(`Missing permission: ${MCP_CONNECT_PERMISSION}`);
    }

    await this.prisma.mcpAuthorization.update({
      where: { uid: authorization.uid },
      data: { lastUsedAt: new Date() },
    });

    return {
      authorizationUid: authorization.uid,
      memberUid: authorization.member.uid,
      email: authorization.member.email,
      name: authorization.member.name,
      clientName: authorization.clientName,
    };
  }

  private async exchangeAuthorizationCode(input: TokenInput) {
    if (!input.code || !input.redirect_uri || !input.code_verifier) {
      throw new BadRequestException('code, redirect_uri, and code_verifier are required');
    }
    this.assertResource(input.resource);

    const codeRow = await this.prisma.mcpAuthCode.findUnique({
      where: { codeHash: hashSecret(input.code) },
    });
    if (!codeRow || codeRow.consumedAt) {
      throw new BadRequestException('Invalid authorization code');
    }
    if (codeRow.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Authorization code expired');
    }
    if (codeRow.redirectUri !== input.redirect_uri) {
      throw new BadRequestException('redirect_uri mismatch');
    }
    if (input.client_id && input.client_id !== codeRow.clientId) {
      throw new BadRequestException('client_id mismatch');
    }
    if (!verifyPkceS256(input.code_verifier, codeRow.codeChallenge)) {
      throw new BadRequestException('Invalid code_verifier');
    }

    await this.prisma.mcpAuthCode.update({
      where: { uid: codeRow.uid },
      data: { consumedAt: new Date() },
    });

    return this.issueTokens(codeRow.authorizationUid);
  }

  private async exchangeRefreshToken(input: TokenInput) {
    if (!input.refresh_token) {
      throw new BadRequestException('refresh_token is required');
    }
    const authorization = await this.prisma.mcpAuthorization.findUnique({
      where: { refreshTokenHash: hashSecret(input.refresh_token) },
    });
    if (!authorization || authorization.revokedAt) {
      throw new UnauthorizedException('Invalid refresh_token');
    }
    const { allowed } = await this.accessControl.hasPermission(authorization.memberUid, MCP_CONNECT_PERMISSION);
    if (!allowed) {
      throw new ForbiddenException(`Missing permission: ${MCP_CONNECT_PERMISSION}`);
    }
    return this.issueTokens(authorization.uid);
  }

  private async issueTokens(authorizationUid: string) {
    const accessToken = generateSecret(MCP_TOKEN_PREFIX.access);
    const refreshToken = generateSecret(MCP_TOKEN_PREFIX.refresh);
    const accessExpiresAt = new Date(Date.now() + MCP_ACCESS_TOKEN_TTL_SEC * 1000);

    await this.prisma.mcpAuthorization.update({
      where: { uid: authorizationUid },
      data: {
        accessTokenHash: hashSecret(accessToken),
        refreshTokenHash: hashSecret(refreshToken),
        accessExpiresAt,
        revokedAt: null,
      },
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: MCP_ACCESS_TOKEN_TTL_SEC,
      refresh_token: refreshToken,
      scope: MCP_SCOPE,
    };
  }

  private async revokeAuthorization(uid: string) {
    await this.prisma.mcpAuthorization.update({
      where: { uid },
      data: {
        revokedAt: new Date(),
        accessTokenHash: null,
        refreshTokenHash: null,
        accessExpiresAt: null,
      },
    });
  }

  private assertResource(resource?: string) {
    if (!resource) {
      return;
    }
    if (resource !== mcpResourceUrl()) {
      throw new BadRequestException('resource does not match this MCP server');
    }
  }
}
