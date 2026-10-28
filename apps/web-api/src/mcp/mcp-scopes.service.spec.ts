jest.mock('../analytics/service/analytics.service', () => ({ AnalyticsService: jest.fn() }));

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { connectionStatus } from './mcp-grant-expiry';
import {
  initialScopeLevels,
  McpAdminCaps,
  McpScopesService,
  parseStoredLevels,
  resolveScope,
} from './mcp-scopes.service';

const DAY = 24 * 60 * 60 * 1000;
const NO_CAPS: McpAdminCaps = {
  search: 'write',
  forum: 'write',
  news: 'write',
  directory: 'write',
  events: 'write',
  investors: 'write',
  ai_apps: 'write',
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'auth-1',
    clientName: 'Claude.ai',
    connectedAt: new Date(Date.now() - DAY),
    lastUsedAt: new Date(Date.now() - 60_000),
    scopeLevels: {},
    ...overrides,
  };
}

function build(settings: Array<{ scope: string; maxLevel: string }> = []) {
  const rows = new Map<string, any>();
  const prisma = {
    mcpScopeSetting: {
      findMany: jest.fn(async () => settings),
      upsert: jest.fn(async ({ where, create, update }) => {
        const existing = settings.find((s) => s.scope === where.scope);
        if (existing) Object.assign(existing, update);
        else settings.push({ scope: create.scope, maxLevel: create.maxLevel });
        return {};
      }),
    },
    mcpAuthorization: {
      findMany: jest.fn(async () => [...rows.values()]),
      findFirst: jest.fn(async ({ where }) => {
        const r = rows.get(where.uid);
        return r && r.memberUid === where.memberUid && !r.revokedAt ? r : null;
      }),
      update: jest.fn(async ({ where, data }) => Object.assign(rows.get(where.uid), data)),
    },
    $transaction: jest.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
  };
  const analytics = { trackEvent: jest.fn().mockResolvedValue(undefined) };
  const service = new McpScopesService(prisma as any, analytics as any, {} as any);
  const add = (r: Record<string, unknown>) =>
    rows.set(r.uid as string, { memberUid: 'member-1', revokedAt: null, ...r });
  return { service, prisma, analytics, rows, add };
}

describe('scope resolution', () => {
  it('treats a missing level as read, capped by the registry', () => {
    expect(resolveScope({}, NO_CAPS, 'forum')).toEqual({
      level: 'read',
      maxLevel: 'read',
      adminMax: 'write',
      lock: null,
    });
    expect(resolveScope({ forum: 'write' }, NO_CAPS, 'forum').level).toBe('read');
    expect(resolveScope({ ai_apps: 'write' }, NO_CAPS, 'ai_apps')).toMatchObject({ level: 'write', maxLevel: 'write' });
  });

  it('caps a stored level at the admin maximum and marks the lock', () => {
    const caps = { ...NO_CAPS, ai_apps: 'read' as const };
    expect(resolveScope({ ai_apps: 'write' }, caps, 'ai_apps')).toEqual({
      level: 'read',
      maxLevel: 'read',
      adminMax: 'read',
      lock: 'admin',
    });
  });

  it('starts new consents at read, or none where admins set none', () => {
    const levels = initialScopeLevels({ ...NO_CAPS, forum: 'none', ai_apps: 'read' });
    expect(levels).toMatchObject({ search: 'read', forum: 'none', ai_apps: 'read', news: 'read' });
  });

  it('keeps only known scopes and levels from the stored JSON', () => {
    expect(parseStoredLevels({ forum: 'none', bogus: 'write', search: 'admin' })).toEqual({ forum: 'none' });
    expect(parseStoredLevels(null)).toEqual({});
    expect(parseStoredLevels(['read'])).toEqual({});
  });
});

describe('connectionStatus', () => {
  const now = Date.now();
  it.each([
    ['not used yet', { connectedAt: new Date(now - DAY), lastUsedAt: null }, 'not_used'],
    ['used today', { connectedAt: new Date(now - 3 * DAY), lastUsedAt: new Date(now - 60_000) }, 'active'],
    [
      'idle past 7 days',
      { connectedAt: new Date(now - 10 * DAY), lastUsedAt: new Date(now - 8 * DAY) },
      'signin_expired',
    ],
    ['never used for 8 days', { connectedAt: new Date(now - 8 * DAY), lastUsedAt: null }, 'signin_expired'],
    [
      '30 days since consent',
      { connectedAt: new Date(now - 31 * DAY), lastUsedAt: new Date(now - DAY) },
      'signin_expired',
    ],
  ])('%s', (_label, grant, status) => {
    expect(connectionStatus(grant, now)).toBe(status);
  });
});

describe('McpScopesService', () => {
  it('lists each connection with status and scopes in registry order, without scopes that have no tools', async () => {
    const { service, add } = build([{ scope: 'forum', maxLevel: 'none' }]);
    add(row({ uid: 'a', scopeLevels: { ai_apps: 'write' } }));
    add(row({ uid: 'b', lastUsedAt: new Date(Date.now() - 8 * DAY), connectedAt: new Date(Date.now() - 9 * DAY) }));
    const { items } = await service.listConnections('member-1');

    expect(items.map((i) => i.status)).toEqual(['active', 'signin_expired']);
    expect(items[0].scopes.map((s) => s.key)).toEqual([
      'search',
      'forum',
      'directory',
      'events',
      'investors',
      'ai_apps',
    ]);
    expect(items[0].scopes.find((s) => s.key === 'forum')).toEqual({
      key: 'forum',
      label: 'Forum',
      level: 'none',
      maxLevel: 'none',
      registryMax: 'read',
      lock: 'admin',
    });
    expect(items[0].scopes.find((s) => s.key === 'ai_apps')).toMatchObject({ level: 'write', maxLevel: 'write' });
    expect(items[1].scopes.find((s) => s.key === 'ai_apps')).toMatchObject({ level: 'read' });
  });

  it('saves only the given connection and only the changed scopes', async () => {
    const { service, add, rows, analytics } = build();
    add(row({ uid: 'a' }));
    add(row({ uid: 'b' }));
    const item = await service.updateConnectionLevels('member-1', 'a', {
      levels: { forum: 'none', search: 'read', ai_apps: 'write' },
    });

    expect(rows.get('a').scopeLevels).toEqual({ forum: 'none', ai_apps: 'write' });
    expect(rows.get('b').scopeLevels).toEqual({});
    expect(item.scopes.find((s) => s.key === 'forum')?.level).toBe('none');
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'mcp-scope-levels-updated',
        properties: expect.objectContaining({
          authorizationUid: 'a',
          changes: [
            { scope: 'forum', from: 'read', to: 'none' },
            { scope: 'ai_apps', from: 'read', to: 'write' },
          ],
        }),
      })
    );
  });

  it('refuses a level above the maximum and stores nothing', async () => {
    const { service, add, rows, prisma } = build([{ scope: 'ai_apps', maxLevel: 'read' }]);
    add(row({ uid: 'a' }));
    await expect(
      service.updateConnectionLevels('member-1', 'a', { levels: { forum: 'none', ai_apps: 'write' } })
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.updateConnectionLevels('member-1', 'a', { levels: { search: 'write' } })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.mcpAuthorization.update).not.toHaveBeenCalled();
    expect(rows.get('a').scopeLevels).toEqual({});
  });

  it.each([
    ['unknown scope', { levels: { office_hours: 'read' } }],
    ['bad level', { levels: { forum: 'admin' } }],
    ['no levels', {}],
  ])('rejects a bad body (%s) with 400', async (_label, body) => {
    const { service, add } = build();
    add(row({ uid: 'a' }));
    await expect(service.updateConnectionLevels('member-1', 'a', body)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['unknown', 'nope', {}],
    ['revoked', 'a', { revokedAt: new Date() }],
    ["another member's", 'a', { memberUid: 'member-2' }],
  ])('returns 404 for a %s connection', async (_label, uid, overrides) => {
    const { service, add } = build();
    add({ ...row({ uid: 'a' }), ...overrides });
    await expect(service.updateConnectionLevels('member-1', uid, { levels: { forum: 'none' } })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('keeps stored levels when admins lower a maximum, so they come back when it is raised', async () => {
    const settings: Array<{ scope: string; maxLevel: string }> = [];
    const { service, add, rows } = build(settings);
    add(row({ uid: 'a', scopeLevels: { ai_apps: 'write' } }));

    await service.setAdminScopes({ scopes: { ai_apps: 'read' } }, 'admin-1');
    let { items } = await service.listConnections('member-1');
    expect(items[0].scopes.find((s) => s.key === 'ai_apps')).toMatchObject({ level: 'read', lock: 'admin' });

    // The member saves the drawer unchanged: nothing is rewritten.
    await service.updateConnectionLevels('member-1', 'a', { levels: { ai_apps: 'read' } });
    expect(rows.get('a').scopeLevels).toEqual({ ai_apps: 'write' });

    await service.setAdminScopes({ scopes: { ai_apps: 'write' } }, 'admin-1');
    ({ items } = await service.listConnections('member-1'));
    expect(items[0].scopes.find((s) => s.key === 'ai_apps')).toMatchObject({ level: 'write', lock: null });
  });

  it('reports admin scopes with registry and admin maximums, and rejects unknown keys', async () => {
    const { service, analytics } = build();
    const res = await service.setAdminScopes({ scopes: { forum: 'none' } }, 'admin-1');
    expect(res.scopes.find((s) => s.key === 'forum')).toEqual({
      key: 'forum',
      label: 'Forum',
      registryMax: 'read',
      adminMax: 'none',
    });
    expect(res.scopes.find((s) => s.key === 'news')).toMatchObject({ registryMax: 'none', adminMax: 'write' });
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'mcp-admin-scope-updated',
        properties: { scope: 'forum', from: 'write', to: 'none', updatedByUid: 'admin-1' },
      })
    );
    await expect(service.setAdminScopes({ scopes: { office_hours: 'none' } }, 'admin-1')).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});
