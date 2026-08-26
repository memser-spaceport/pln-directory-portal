import { ForbiddenException } from '@nestjs/common';
import { McpOAuthService } from './mcp-oauth.service';
import { hashSecret, pkceS256Challenge } from './mcp.crypto';

const MEMBER = { uid: 'member-1', name: 'Ada', email: 'ada@example.com' };
const CLIENT = {
  clientId: 'mcp_client_abc',
  clientName: 'Claude Code',
  redirectUris: ['http://127.0.0.1:4321/callback'],
};

function buildService(
  overrides: {
    prisma?: Record<string, any>;
    access?: { allowed: boolean };
  } = {}
) {
  const prisma = {
    mcpOAuthClient: {
      create: jest.fn().mockImplementation(async ({ data }) => data),
      findUnique: jest.fn().mockResolvedValue(CLIENT),
    },
    mcpAuthorization: {
      upsert: jest.fn().mockResolvedValue({ uid: 'auth-1', memberUid: MEMBER.uid, clientId: CLIENT.clientId }),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    mcpAuthCode: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    member: { findUnique: jest.fn().mockResolvedValue(MEMBER) },
    ...overrides.prisma,
  };
  const accessControl = {
    hasPermission: jest.fn().mockResolvedValue({ allowed: overrides.access?.allowed ?? true }),
  };
  const service = new McpOAuthService(prisma as any, accessControl as any);
  return { service, prisma, accessControl };
}

describe('McpOAuthService', () => {
  const originalApi = process.env.WEB_API_BASE_URL;
  const originalWeb = process.env.WEB_UI_BASE_URL;

  beforeEach(() => {
    process.env.WEB_API_BASE_URL = 'https://directory.example.com';
    process.env.WEB_UI_BASE_URL = 'https://labos.example.com';
  });

  afterEach(() => {
    process.env.WEB_API_BASE_URL = originalApi;
    process.env.WEB_UI_BASE_URL = originalWeb;
  });

  it('registers a public client with localhost redirect URIs', async () => {
    const { service, prisma } = buildService();
    const result = await service.registerClient({
      client_name: 'Claude Code',
      redirect_uris: ['http://127.0.0.1:9999/callback'],
    });
    expect(result.client_id).toMatch(/^mcp_client_/);
    expect(result.token_endpoint_auth_method).toBe('none');
    expect(prisma.mcpOAuthClient.create).toHaveBeenCalled();
  });

  it('registers Cursor-style loopback, https, and private-use redirect URIs', async () => {
    const { service, prisma } = buildService();
    const result = await service.registerClient({
      client_name: 'Cursor',
      redirect_uris: [
        'http://localhost:8787/callback',
        'https://www.cursor.com/agents/mcp/oauth/callback',
        'cursor://anysphere.cursor-mcp/oauth/callback',
      ],
    });
    expect(result.client_id).toMatch(/^mcp_client_/);
    expect(prisma.mcpOAuthClient.create).toHaveBeenCalled();
  });

  it('rejects cleartext non-loopback redirect URIs at registration', async () => {
    const { service } = buildService();
    await expect(
      service.registerClient({ client_name: 'Evil', redirect_uris: ['http://evil.example/callback'] })
    ).rejects.toThrow('redirect_uris');
  });

  it('refuses approve without mcp.connect', async () => {
    const { service } = buildService({ access: { allowed: false } });
    await expect(
      service.approve(MEMBER.uid, {
        clientId: CLIENT.clientId,
        redirectUri: CLIENT.redirectUris[0],
        codeChallenge: 'abc',
        codeChallengeMethod: 'S256',
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('issues an authorization code on approve and exchanges it with a valid PKCE verifier', async () => {
    const verifier = 'a'.repeat(43);
    const challenge = pkceS256Challenge(verifier);
    let storedCodeHash = '';
    const { service, prisma } = buildService();
    prisma.mcpAuthCode.create.mockImplementation(async ({ data }) => {
      storedCodeHash = data.codeHash;
      return data;
    });

    const approved = await service.approve(MEMBER.uid, {
      clientId: CLIENT.clientId,
      redirectUri: CLIENT.redirectUris[0],
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      state: 'xyz',
    });
    expect(approved.redirectUrl).toContain('code=');
    expect(approved.redirectUrl).toContain('state=xyz');
    const code = new URL(approved.redirectUrl).searchParams.get('code') as string;

    prisma.mcpAuthCode.findUnique.mockResolvedValue({
      uid: 'code-1',
      codeHash: storedCodeHash || hashSecret(code),
      codeChallenge: challenge,
      clientId: CLIENT.clientId,
      redirectUri: CLIENT.redirectUris[0],
      memberUid: MEMBER.uid,
      authorizationUid: 'auth-1',
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });

    const tokens = await service.exchangeToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: CLIENT.redirectUris[0],
      code_verifier: verifier,
    });
    expect(tokens.access_token).toMatch(/^mcp_at_/);
    expect(tokens.refresh_token).toMatch(/^mcp_rt_/);
    expect(tokens.token_type).toBe('Bearer');
  });

  it('rejects a bad PKCE verifier', async () => {
    const verifier = 'a'.repeat(43);
    const challenge = pkceS256Challenge(verifier);
    const { service, prisma } = buildService();
    prisma.mcpAuthCode.findUnique.mockResolvedValue({
      uid: 'code-1',
      codeHash: 'hash',
      codeChallenge: challenge,
      clientId: CLIENT.clientId,
      redirectUri: CLIENT.redirectUris[0],
      memberUid: MEMBER.uid,
      authorizationUid: 'auth-1',
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });

    await expect(
      service.exchangeToken({
        grant_type: 'authorization_code',
        code: 'mcp_ac_nope',
        redirect_uri: CLIENT.redirectUris[0],
        code_verifier: 'b'.repeat(43),
      })
    ).rejects.toThrow('code_verifier');
  });

  it('stops authenticating an access token after revoke', async () => {
    const { service, prisma } = buildService();
    const token = 'mcp_at_live';
    prisma.mcpAuthorization.findFirst.mockResolvedValue({ uid: 'auth-1', revokedAt: null });
    await service.revokeToken(token);
    expect(prisma.mcpAuthorization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ revokedAt: expect.any(Date), accessTokenHash: null }),
      })
    );

    prisma.mcpAuthorization.findUnique.mockResolvedValue(null);
    await expect(service.authenticateAccessToken(token)).rejects.toThrow('Invalid MCP token');
  });
});
