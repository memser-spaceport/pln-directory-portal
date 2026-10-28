jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import { UnauthorizedException } from '@nestjs/common';
import { McpOAuthService } from './mcp-oauth.service';
import { McpScopesService } from './mcp-scopes.service';
import { MCP_ACCESS_TOKEN_TTL_SEC, MCP_REFRESH_TOKEN_IDLE_TTL_MS, MCP_REFRESH_TOKEN_TTL_MS } from './mcp.constants';
import { pkceS256Challenge } from './mcp.crypto';

const MEMBER = { uid: 'member-1', name: 'Ada', email: 'ada@example.com' };
const REDIRECT = 'http://127.0.0.1:4321/callback';
const VERIFIER = 'verifier-verifier-verifier-verifier-verifier-1234';

type Row = Record<string, any>;

const matches = (row: Row, where: Row) =>
  Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !(v instanceof Date) && 'lt' in v) return row[k] < v.lt;
    return row[k] === v;
  });

/** In-memory stand-in for the Prisma delegates the OAuth flow touches. */
function fakePrisma() {
  const authorizations: Row[] = [];
  const codes: Row[] = [];
  const used: Row[] = [];
  const prisma: any = {
    mcpOAuthClient: {
      findUnique: jest.fn(async ({ where }) => ({
        clientId: where.clientId,
        clientName: `Client ${where.clientId}`,
        redirectUris: [REDIRECT],
      })),
    },
    member: { findUnique: jest.fn(async () => MEMBER) },
    mcpScopeSetting: { findMany: jest.fn(async () => []) },
    mcpAuthorization: {
      upsert: jest.fn(async ({ where, create, update }) => {
        const key = where.memberUid_clientId;
        const row = authorizations.find((r) => r.memberUid === key.memberUid && r.clientId === key.clientId);
        if (row) return Object.assign(row, update);
        const created = { uid: `auth-${authorizations.length + 1}`, revokedAt: null, ...create };
        authorizations.push(created);
        return created;
      }),
      findUnique: jest.fn(async ({ where, include }) => {
        const row = authorizations.find((r) => matches(r, where));
        if (!row) return null;
        return include?.member ? { ...row, member: MEMBER } : { ...row };
      }),
      findFirst: jest.fn(async ({ where }) => authorizations.find((r) => matches(r, where)) ?? null),
      update: jest.fn(async ({ where, data }) => {
        const row = authorizations.find((r) => matches(r, where)) as Row;
        return Object.assign(row, data);
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const hit = authorizations.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
    },
    mcpAuthCode: {
      create: jest.fn(async ({ data }) => {
        codes.push({ uid: `code-${codes.length + 1}`, consumedAt: null, ...data });
      }),
      findUnique: jest.fn(async ({ where }) => codes.find((r) => matches(r, where)) ?? null),
      update: jest.fn(async ({ where, data }) => Object.assign(codes.find((r) => matches(r, where)) as Row, data)),
    },
    mcpUsedRefreshToken: {
      create: jest.fn(async ({ data }) => {
        if (used.some((r) => r.tokenHash === data.tokenHash)) throw new Error('unique violation');
        used.push({ usedAt: new Date(), ...data });
      }),
      findUnique: jest.fn(async ({ where, include }) => {
        const row = used.find((r) => r.tokenHash === where.tokenHash);
        if (!row) return null;
        return include?.authorization
          ? { ...row, authorization: { ...authorizations.find((a) => a.uid === row.authorizationUid) } }
          : row;
      }),
      deleteMany: jest.fn(async ({ where }) => {
        const keep = used.filter((r) => !matches(r, where));
        const count = used.length - keep.length;
        used.splice(0, used.length, ...keep);
        return { count };
      }),
    },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
  return { prisma, authorizations, used };
}

function build() {
  const store = fakePrisma();
  const accessControl = { hasPermission: jest.fn().mockResolvedValue({ allowed: true }) };
  const appSessions = { revokeAgentSessionsForAuthorization: jest.fn().mockResolvedValue(2) };
  const analytics = { trackEvent: jest.fn().mockResolvedValue(undefined) };
  const scopes = new McpScopesService(store.prisma, analytics as any);
  const service = new McpOAuthService(store.prisma, accessControl as any, appSessions as any, analytics as any, scopes);
  return { ...store, service, appSessions, analytics };
}

/** Approve + code exchange: the agent's first token pair. */
async function connect(service: McpOAuthService, clientId = 'client-a') {
  const { redirectUrl } = await service.approve(MEMBER.uid, {
    clientId,
    redirectUri: REDIRECT,
    codeChallenge: pkceS256Challenge(VERIFIER),
    codeChallengeMethod: 'S256',
  });
  const code = new URL(redirectUrl).searchParams.get('code') as string;
  return service.exchangeToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT,
    code_verifier: VERIFIER,
  }) as Promise<{ access_token: string; refresh_token: string }>;
}

const refresh = (service: McpOAuthService, token: string) =>
  service.exchangeToken({ grant_type: 'refresh_token', refresh_token: token }) as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;

describe('McpOAuthService refresh-token rotation and reuse', () => {
  beforeEach(() => {
    process.env.WEB_API_BASE_URL = 'https://directory.example.com';
  });

  it('rotates the pair and stops the old access token', async () => {
    const { service } = build();
    const first = await connect(service);
    const second = await refresh(service, first.refresh_token);

    expect(second.refresh_token).not.toBe(first.refresh_token);
    await expect(service.authenticateAccessToken(second.access_token)).resolves.toMatchObject({
      memberUid: MEMBER.uid,
    });
    await expect(service.authenticateAccessToken(first.access_token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes the whole grant when a rotated refresh token comes back', async () => {
    const { service, appSessions, analytics, authorizations } = build();
    const first = await connect(service);
    const second = await refresh(service, first.refresh_token);

    await expect(refresh(service, first.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authorizations[0].revokedAt).toBeInstanceOf(Date);
    await expect(service.authenticateAccessToken(second.access_token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(refresh(service, second.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(appSessions.revokeAgentSessionsForAuthorization).toHaveBeenCalledWith('auth-1', expect.anything());
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'mcp-refresh-token-reuse',
        distinctId: MEMBER.uid,
        properties: expect.objectContaining({ authorizationUid: 'auth-1', clientName: 'Client client-a' }),
      })
    );
  });

  it('lets only one of two concurrent refreshes with the same token succeed, and treats the other as reuse', async () => {
    const { service, authorizations } = build();
    const first = await connect(service);

    const results = await Promise.allSettled([
      refresh(service, first.refresh_token),
      refresh(service, first.refresh_token),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(authorizations[0].revokedAt).toBeInstanceOf(Date);
  });

  it('leaves the member’s other agent grants live when one grant is revoked for reuse', async () => {
    const { service } = build();
    const a = await connect(service, 'client-a');
    const b = await connect(service, 'client-b');
    await refresh(service, a.refresh_token);

    await expect(refresh(service, a.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.authenticateAccessToken(b.access_token)).resolves.toMatchObject({ memberUid: MEMBER.uid });
    await expect(refresh(service, b.refresh_token)).resolves.toHaveProperty('access_token');
  });

  it('answers a plain 401 for a refresh token from before a re-consent and keeps the new grant', async () => {
    const { service, appSessions, analytics } = build();
    const first = await connect(service);
    await refresh(service, first.refresh_token);
    const reconnected = await connect(service);

    await expect(refresh(service, first.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.authenticateAccessToken(reconnected.access_token)).resolves.toMatchObject({
      memberUid: MEMBER.uid,
    });
    expect(appSessions.revokeAgentSessionsForAuthorization).not.toHaveBeenCalled();
    expect(analytics.trackEvent).not.toHaveBeenCalled();
  });

  it('answers a plain 401 for an unknown refresh token', async () => {
    const { service, appSessions } = build();
    await connect(service);
    await expect(refresh(service, 'mcp_rt_unknown')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(appSessions.revokeAgentSessionsForAuthorization).not.toHaveBeenCalled();
  });

  it('refreshes a grant that is inside the absolute and idle limits', async () => {
    const { service, authorizations } = build();
    const first = await connect(service);
    authorizations[0].connectedAt = new Date(Date.now() - MCP_REFRESH_TOKEN_TTL_MS + 60_000);
    authorizations[0].lastUsedAt = new Date(Date.now() - MCP_REFRESH_TOKEN_IDLE_TTL_MS + 60_000);

    const second = await refresh(service, first.refresh_token);

    expect(second.expires_in).toBe(MCP_ACCESS_TOKEN_TTL_SEC);
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect(authorizations[0].revokedAt).toBeNull();
    expect(authorizations[0].lastUsedAt.getTime()).toBeGreaterThan(Date.now() - 5_000);
    await expect(refresh(service, second.refresh_token)).resolves.toHaveProperty('access_token');
  });

  it('rejects a refresh token older than 30 days from consent and revokes the grant', async () => {
    const { service, authorizations, appSessions, analytics } = build();
    const first = await connect(service);
    authorizations[0].connectedAt = new Date(Date.now() - MCP_REFRESH_TOKEN_TTL_MS - 1_000);
    authorizations[0].lastUsedAt = new Date();

    await expect(refresh(service, first.refresh_token)).rejects.toThrow('Invalid refresh_token');

    expect(authorizations[0].revokedAt).toBeInstanceOf(Date);
    expect(authorizations[0].refreshTokenHash).toBeNull();
    expect(authorizations[0].accessTokenHash).toBeNull();
    expect(appSessions.revokeAgentSessionsForAuthorization).toHaveBeenCalledWith('auth-1', expect.anything());
    expect(analytics.trackEvent).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'mcp-refresh-token-reuse' }));
    await expect(service.authenticateAccessToken(first.access_token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(refresh(service, first.refresh_token)).rejects.toThrow('Invalid refresh_token');
  });

  it('rejects a refresh token idle for longer than 7 days and revokes the grant', async () => {
    const { service, authorizations } = build();
    const first = await connect(service);
    authorizations[0].connectedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    authorizations[0].lastUsedAt = new Date(Date.now() - MCP_REFRESH_TOKEN_IDLE_TTL_MS - 1_000);

    await expect(refresh(service, first.refresh_token)).rejects.toThrow('Invalid refresh_token');

    expect(authorizations[0].revokedAt).toBeInstanceOf(Date);
    expect(authorizations[0].refreshTokenHash).toBeNull();
    await expect(refresh(service, first.refresh_token)).rejects.toThrow('Invalid refresh_token');
  });

  it('counts a grant with no last use as idle from consent', async () => {
    const { service, authorizations } = build();
    const first = await connect(service);
    authorizations[0].connectedAt = new Date(Date.now() - MCP_REFRESH_TOKEN_IDLE_TTL_MS - 1_000);
    authorizations[0].lastUsedAt = null;

    await expect(refresh(service, first.refresh_token)).rejects.toThrow('Invalid refresh_token');
    expect(authorizations[0].revokedAt).toBeInstanceOf(Date);
  });

  it('accepts a new consent after an expired refresh and keeps that grant', async () => {
    const { service, authorizations, appSessions } = build();
    const first = await connect(service);
    authorizations[0].connectedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    authorizations[0].lastUsedAt = new Date(Date.now() - MCP_REFRESH_TOKEN_IDLE_TTL_MS - 1_000);
    await expect(refresh(service, first.refresh_token)).rejects.toThrow('Invalid refresh_token');

    const next = await connect(service);

    await expect(refresh(service, next.refresh_token)).resolves.toHaveProperty('access_token');
    await expect(refresh(service, first.refresh_token)).rejects.toThrow('Invalid refresh_token');
    expect(authorizations[0].revokedAt).toBeNull();
    expect(appSessions.revokeAgentSessionsForAuthorization).toHaveBeenCalledTimes(1);
  });

  it('prunes only remembered hashes older than the refresh-token lifetime', async () => {
    const { service, used } = build();
    used.push(
      { tokenHash: 'old', authorizationUid: 'auth-1', usedAt: new Date(Date.now() - MCP_REFRESH_TOKEN_TTL_MS - 1000) },
      { tokenHash: 'new', authorizationUid: 'auth-1', usedAt: new Date() }
    );
    await service.cleanupUsedRefreshTokens();
    expect(used.map((r) => r.tokenHash)).toEqual(['new']);
  });
});
