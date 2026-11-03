jest.mock('../analytics/service/analytics.service', () => ({ AnalyticsService: jest.fn() }));
jest.mock('../integration-keys/member-sign-in.service', () => ({ MemberSignInService: jest.fn() }));

import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { McpMemberProofService } from './mcp-member-proof.service';
import { McpScopesService } from './mcp-scopes.service';
import { MCP_MEMBER_PROOF_TTL_SECONDS } from './mcp.constants';

const ACTOR = {
  authorizationUid: 'auth-1',
  memberUid: 'member-1',
  email: 'ada@example.com',
  name: 'Ada',
  clientName: 'Claude Code',
  scopeLevels: {},
};
const MEMBER = {
  memberUid: 'member-1',
  name: 'Ada',
  email: 'ada@example.com',
  image: null,
  permissions: ['mcp.connect'],
};
const KEYS: Record<string, { revokedAt: Date | null; scopes: string[] }> = {
  'key-infralfg': { revokedAt: null, scopes: ['members:sign-in'] },
  'key-other': { revokedAt: null, scopes: ['members:sign-in'] },
  'key-revoked': { revokedAt: new Date(), scopes: ['members:sign-in'] },
  'key-jobs-only': { revokedAt: null, scopes: ['jobs:write'] },
};

/** Map-backed cache that honors the TTL against `Date.now()`, like the Redis store. */
function fakeCache() {
  const entries = new Map<string, { value: unknown; expiresAt: number }>();
  return {
    entries,
    set: jest.fn(async (key: string, value: unknown, options: { ttl: number }) => {
      entries.set(key, { value, expiresAt: Date.now() + options.ttl * 1000 });
    }),
    get: jest.fn(async (key: string) => {
      const entry = entries.get(key);
      return entry && entry.expiresAt > Date.now() ? entry.value : undefined;
    }),
    // Like Redis DEL: the number of keys removed
    del: jest.fn(async (key: string) => (entries.delete(key) ? 1 : 0)),
  };
}

function build() {
  const prisma = {
    integrationKey: { findUnique: jest.fn(async ({ where }) => KEYS[where.uid] ?? null) },
    mcpAuthorization: { findUnique: jest.fn(async () => ({ revokedAt: null as Date | null })) },
    mcpScopeSetting: { findMany: jest.fn(async () => []) },
  };
  const oauth = { authenticateAccessToken: jest.fn().mockResolvedValue(ACTOR) };
  const accessControl = { hasPermission: jest.fn().mockResolvedValue({ allowed: true }) };
  const signIn = { member: jest.fn().mockResolvedValue(MEMBER) };
  const analytics = { trackEvent: jest.fn().mockResolvedValue(undefined) };
  const cache = fakeCache();
  const service = new McpMemberProofService(
    prisma as any,
    oauth as any,
    accessControl as any,
    signIn as any,
    analytics as any,
    cache as any,
    new McpScopesService(prisma as any, analytics as any, {} as any)
  );
  return { service, prisma, oauth, accessControl, signIn, analytics, cache };
}

describe('McpMemberProofService', () => {
  afterEach(() => jest.useRealTimers());

  it('issues a 5-minute proof for a live integration key and stores only its hash', async () => {
    const { service, cache, analytics } = build();
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2026-10-21T10:00:00Z'));

    const { proof, expiresAt } = await service.issue('mcp_at_live', 'key-infralfg');

    expect(proof).toMatch(/^mcp_mp_/);
    expect(expiresAt.getTime()).toBe(new Date('2026-10-21T10:05:00Z').getTime());
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), expect.any(Object), {
      ttl: MCP_MEMBER_PROOF_TTL_SECONDS,
    });
    expect([...cache.entries.keys()].join()).not.toContain(proof);
    expect(analytics.trackEvent).toHaveBeenCalledWith({
      name: 'mcp-member-proof-issued',
      distinctId: 'member-1',
      properties: { memberUid: 'member-1', audience: 'key-infralfg', scope: 'ai_apps' },
    });
  });

  it.each([
    ['invalid or revoked', new UnauthorizedException('Invalid MCP token'), UnauthorizedException],
    ['missing mcp.connect', new ForbiddenException('Missing permission: mcp.connect'), ForbiddenException],
  ])('issues nothing for a %s MCP token', async (_label, error, expected) => {
    const { service, oauth, cache } = build();
    oauth.authenticateAccessToken.mockRejectedValue(error);
    await expect(service.issue('mcp_at_bad', 'key-infralfg')).rejects.toBeInstanceOf(expected);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it.each(['key-unknown', 'key-revoked', 'key-jobs-only'])('404s audience %s and issues nothing', async (audience) => {
    const { service, cache } = build();
    await expect(service.issue('mcp_at_live', audience)).rejects.toThrow(new NotFoundException('Unknown audience'));
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('lets the bound integration redeem the proof once, with the member and the agent', async () => {
    const { service, signIn, analytics } = build();
    const { proof } = await service.issue('mcp_at_live', 'key-infralfg');

    await expect(service.redeem(proof, 'key-infralfg')).resolves.toEqual({
      ...MEMBER,
      authorizationUid: 'auth-1',
      agent: { clientName: 'Claude Code', access: 'read', scope: 'ai_apps' },
    });
    expect(signIn.member).toHaveBeenCalledWith('member-1');
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'mcp-member-proof-redeemed', distinctId: 'member-1' })
    );

    await expect(service.redeem(proof, 'key-infralfg')).rejects.toThrow(
      new BadRequestException('Invalid or expired member proof')
    );
  });

  it('carries the write level when the AI Apps scope is at write', async () => {
    const { service, oauth } = build();
    oauth.authenticateAccessToken.mockResolvedValue({ ...ACTOR, scopeLevels: { ai_apps: 'write' } });
    const { proof } = await service.issue('mcp_at_live', 'key-infralfg');
    await expect(service.redeem(proof, 'key-infralfg')).resolves.toMatchObject({ agent: { access: 'write' } });
  });

  it('refuses another integration and keeps the proof for its own', async () => {
    const { service } = build();
    const { proof } = await service.issue('mcp_at_live', 'key-infralfg');

    await expect(service.redeem(proof, 'key-other')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.redeem(proof, 'key-infralfg')).resolves.toHaveProperty('memberUid', 'member-1');
  });

  it('refuses a proof after 5 minutes', async () => {
    const { service } = build();
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2026-10-21T10:00:00Z'));
    const { proof } = await service.issue('mcp_at_live', 'key-infralfg');

    jest.setSystemTime(new Date('2026-10-21T10:05:01Z'));
    await expect(service.redeem(proof, 'key-infralfg')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses and burns a proof whose agent was revoked after issue', async () => {
    const { service, prisma, signIn } = build();
    const { proof } = await service.issue('mcp_at_live', 'key-infralfg');
    prisma.mcpAuthorization.findUnique.mockResolvedValue({ revokedAt: new Date() });

    await expect(service.redeem(proof, 'key-infralfg')).rejects.toBeInstanceOf(BadRequestException);
    expect(signIn.member).not.toHaveBeenCalled();
    prisma.mcpAuthorization.findUnique.mockResolvedValue({ revokedAt: null });
    await expect(service.redeem(proof, 'key-infralfg')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a proof whose member lost mcp.connect after issue', async () => {
    const { service, accessControl } = build();
    const { proof } = await service.issue('mcp_at_live', 'key-infralfg');
    accessControl.hasPermission.mockResolvedValue({ allowed: false });
    await expect(service.redeem(proof, 'key-infralfg')).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('forum scope (LAB-3075)', () => {
    it('carries the Forum level, not the AI Apps level', async () => {
      const { service, oauth } = build();
      oauth.authenticateAccessToken.mockResolvedValue({ ...ACTOR, scopeLevels: { forum: 'write', ai_apps: 'read' } });
      const { proof } = await service.issue('mcp_at_live', 'key-infralfg', 'forum');
      await expect(service.redeem(proof, 'key-infralfg')).resolves.toMatchObject({
        authorizationUid: 'auth-1',
        agent: { access: 'write', scope: 'forum' },
      });
    });

    it('reads Forum as read when the connection never set it', async () => {
      const { service } = build();
      const { proof } = await service.issue('mcp_at_live', 'key-infralfg', 'forum');
      await expect(service.redeem(proof, 'key-infralfg')).resolves.toMatchObject({ agent: { access: 'read' } });
    });

    it('issues nothing when the connection has no Forum access', async () => {
      const { service, oauth, cache } = build();
      oauth.authenticateAccessToken.mockResolvedValue({ ...ACTOR, scopeLevels: { forum: 'none', ai_apps: 'write' } });
      await expect(service.issue('mcp_at_live', 'key-infralfg', 'forum')).rejects.toThrow(
        new ForbiddenException('This connection has no Forum access')
      );
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('caps Forum at the admin setting', async () => {
      const { service, oauth, prisma } = build();
      prisma.mcpScopeSetting.findMany.mockResolvedValue([{ scope: 'forum', maxLevel: 'read' }] as any);
      oauth.authenticateAccessToken.mockResolvedValue({ ...ACTOR, scopeLevels: { forum: 'write' } });
      const { proof } = await service.issue('mcp_at_live', 'key-infralfg', 'forum');
      await expect(service.redeem(proof, 'key-infralfg')).resolves.toMatchObject({ agent: { access: 'read' } });
    });

    it('fails closed when admin settings cannot be read', async () => {
      const { service, prisma, cache } = build();
      prisma.mcpScopeSetting.findMany.mockRejectedValue(new Error('db down'));
      await expect(service.issue('mcp_at_live', 'key-infralfg', 'forum')).rejects.toThrow('db down');
      expect(cache.set).not.toHaveBeenCalled();
    });
  });

  describe('proof for a connection inside an MCP request (LAB-3031)', () => {
    const CONNECTION = {
      memberUid: 'member-1',
      clientName: 'Claude Code',
      scopeLevels: { forum: 'write' },
      revokedAt: null,
    };

    it('issues from the stored connection, without an access token', async () => {
      const { service, prisma, oauth } = build();
      prisma.mcpAuthorization.findUnique.mockResolvedValue(CONNECTION as any);
      const { proof } = await service.issueForAuthorization('auth-1', 'key-infralfg', 'forum');

      expect(oauth.authenticateAccessToken).not.toHaveBeenCalled();
      expect(prisma.mcpAuthorization.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { uid: 'auth-1' } })
      );
      await expect(service.redeem(proof, 'key-infralfg')).resolves.toMatchObject({
        memberUid: 'member-1',
        authorizationUid: 'auth-1',
        agent: { clientName: 'Claude Code', access: 'write', scope: 'forum' },
      });
    });

    it('issues nothing for a connection disconnected since the request began', async () => {
      const { service, prisma, cache } = build();
      prisma.mcpAuthorization.findUnique.mockResolvedValue({ ...CONNECTION, revokedAt: new Date() } as any);
      await expect(service.issueForAuthorization('auth-1', 'key-infralfg', 'forum')).rejects.toBeInstanceOf(
        ForbiddenException
      );
      prisma.mcpAuthorization.findUnique.mockResolvedValue(null as any);
      await expect(service.issueForAuthorization('auth-gone', 'key-infralfg', 'forum')).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('applies the same Forum level and key checks as an agent request', async () => {
      const { service, prisma } = build();
      prisma.mcpAuthorization.findUnique.mockResolvedValue({ ...CONNECTION, scopeLevels: { forum: 'none' } } as any);
      await expect(service.issueForAuthorization('auth-1', 'key-infralfg', 'forum')).rejects.toThrow(
        new ForbiddenException('This connection has no Forum access')
      );
      prisma.mcpAuthorization.findUnique.mockResolvedValue(CONNECTION as any);
      await expect(service.issueForAuthorization('auth-1', 'key-jobs-only', 'forum')).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  it('redeems a proof once when two redeems race', async () => {
    const { service } = build();
    const { proof } = await service.issue('mcp_at_live', 'key-infralfg');

    const results = await Promise.allSettled([
      service.redeem(proof, 'key-infralfg'),
      service.redeem(proof, 'key-infralfg'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
  });

  it('redeems a proof issued before LAB-3075 as an AI Apps proof', async () => {
    const { service, cache } = build();
    const { proof } = await service.issue('mcp_at_live', 'key-infralfg');
    const [key, entry] = [...cache.entries.entries()][0];
    const legacy = { ...(entry.value as Record<string, unknown>) };
    delete legacy.scope;
    cache.entries.set(key, { ...entry, value: legacy });

    await expect(service.redeem(proof, 'key-infralfg')).resolves.toMatchObject({ agent: { scope: 'ai_apps' } });
  });

  it('refuses an unknown proof', async () => {
    const { service } = build();
    await expect(service.redeem('mcp_mp_unknown', 'key-infralfg')).rejects.toBeInstanceOf(BadRequestException);
  });
});
