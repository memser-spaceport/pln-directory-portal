jest.mock('../analytics/service/analytics.service', () => ({ AnalyticsService: jest.fn() }));

import { NotFoundException } from '@nestjs/common';
import { McpAccessRequestsService } from './mcp-access-requests.service';
import { McpScopesService } from './mcp-scopes.service';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** In-memory `mcpAccessRequest` + `mcpAuthorization` for the access-request lifecycle. */
function fakeAccessRequestPrisma(owners: Record<string, string> = { 'auth-1': 'member-1', 'auth-2': 'member-2' }) {
  const requests: any[] = [];
  let seq = 0;
  const matches = (row: any, where: any) =>
    Object.entries(where).every(([key, cond]: [string, any]) => {
      if (cond && typeof cond === 'object' && 'gt' in cond) return row[key] > cond.gt;
      return row[key] === cond;
    });
  const mcpAccessRequest = {
    findFirst: jest.fn(async ({ where }) => {
      const found = requests.filter((r) => matches(r, where)).sort((a, b) => b.createdAt - a.createdAt)[0];
      return found ? { ...found } : null;
    }),
    findUnique: jest.fn(async ({ where, include }) => {
      const row = requests.find((r) => r.uid === where.uid);
      if (!row) return null;
      return include ? { ...row, authorization: { memberUid: owners[row.authorizationUid] } } : { ...row };
    }),
    create: jest.fn(async ({ data }) => {
      const row = { uid: `req-${++seq}`, createdAt: new Date(), resolvedAt: null, ...data };
      requests.push(row);
      return { ...row };
    }),
    update: jest.fn(async ({ where, data }) =>
      Object.assign(
        requests.find((r) => r.uid === where.uid),
        data
      )
    ),
    updateMany: jest.fn(async ({ where, data }) => {
      const hit = requests.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }),
  };
  return { mcpAccessRequest, requests };
}

function build() {
  const prisma = fakeAccessRequestPrisma();
  return { service: new McpAccessRequestsService(prisma as any), ...prisma };
}

const connection = (level: 'none' | 'read' | 'write', uid = 'auth-1') => ({
  uid,
  clientName: 'Codex',
  connectedAt: new Date().toISOString(),
  lastUsedAt: null,
  status: 'active' as const,
  scopes: [
    {
      key: 'forum' as const,
      label: 'Forum',
      level,
      maxLevel: 'write' as const,
      registryMax: 'write' as const,
      lock: null,
    },
  ],
});

describe('McpAccessRequestsService', () => {
  it('reuses one open request for the same connection and scope within 24 hours', async () => {
    const { service, requests } = build();
    const uids: string[] = [];
    for (let i = 0; i < 10; i++) uids.push(await service.createOrReuse('auth-1', 'forum', 'read', 'get_forum_thread'));
    expect(new Set(uids).size).toBe(1);
    expect(requests).toHaveLength(1);

    // A later write refusal raises the open request instead of adding one.
    expect(await service.createOrReuse('auth-1', 'forum', 'write', 'start_forum_thread')).toBe(uids[0]);
    expect(requests[0]).toMatchObject({ level: 'write', toolName: 'start_forum_thread' });

    // Another scope or connection gets its own.
    await service.createOrReuse('auth-1', 'search', 'read', 'search_members');
    await service.createOrReuse('auth-2', 'forum', 'read', 'get_forum_thread');
    expect(requests).toHaveLength(3);
  });

  it('starts a new request once the open one is older than 24 hours', async () => {
    const { service, requests } = build();
    await service.createOrReuse('auth-1', 'forum', 'read', 'get_forum_thread');
    requests[0].createdAt = new Date(Date.now() - 25 * HOUR);
    await service.createOrReuse('auth-1', 'forum', 'read', 'get_forum_thread');
    expect(requests).toHaveLength(2);
  });

  it('returns a request only to the member who owns its connection', async () => {
    const { service } = build();
    const uid = await service.createOrReuse('auth-1', 'forum', 'write', 'submit_x');
    await expect(service.getForMember('member-1', uid)).resolves.toMatchObject({
      uid,
      authorizationUid: 'auth-1',
      scope: 'forum',
      level: 'write',
      toolName: 'submit_x',
      status: 'open',
    });
    await expect(service.getForMember('member-2', uid)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getForMember('member-1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports a request older than 7 days as expired, and never resolves it', async () => {
    const { service, requests } = build();
    const uid = await service.createOrReuse('auth-1', 'forum', 'read', 'get_forum_thread');
    requests[0].createdAt = new Date(Date.now() - 8 * DAY);
    await expect(service.getForMember('member-1', uid)).resolves.toMatchObject({ status: 'expired' });
    await expect(service.resolveIfMet(uid, connection('read'))).resolves.toBe(false);
  });

  it('resolves only when a save on its own connection reaches the requested level', async () => {
    const { service } = build();
    const uid = await service.createOrReuse('auth-1', 'forum', 'write', 'submit_x');
    await expect(service.resolveIfMet(uid, connection('read'))).resolves.toBe(false);
    await expect(service.resolveIfMet(uid, connection('write', 'auth-2'))).resolves.toBe(false);
    await expect(service.resolveIfMet(uid, connection('write'))).resolves.toBe(true);
    await expect(service.getForMember('member-1', uid)).resolves.toMatchObject({ status: 'resolved' });
    await expect(service.resolveIfMet(uid, connection('write'))).resolves.toBe(false);
  });

  it('resolves through a scopes save that names the request', async () => {
    const access = fakeAccessRequestPrisma();
    const rows = new Map<string, any>([
      [
        'auth-1',
        {
          uid: 'auth-1',
          memberUid: 'member-1',
          revokedAt: null,
          clientName: 'Codex',
          connectedAt: new Date(),
          lastUsedAt: null,
          scopeLevels: {},
        },
      ],
    ]);
    const prisma = {
      ...access,
      mcpScopeSetting: { findMany: jest.fn(async () => []) },
      mcpAuthorization: {
        findFirst: jest.fn(async ({ where }) => rows.get(where.uid) ?? null),
        update: jest.fn(async ({ where, data }) => Object.assign(rows.get(where.uid), data)),
      },
    };
    const analytics = { trackEvent: jest.fn().mockResolvedValue(undefined) };
    const requests = new McpAccessRequestsService(prisma as any);
    const scopes = new McpScopesService(prisma as any, analytics as any, requests);
    const uid = await requests.createOrReuse('auth-1', 'ai_apps', 'write', 'update_ai_app_feedback_status');

    await scopes.updateConnectionLevels('member-1', 'auth-1', { levels: { ai_apps: 'write' }, requestUid: uid });
    await expect(requests.getForMember('member-1', uid)).resolves.toMatchObject({ status: 'resolved' });
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'mcp-scope-levels-updated',
        properties: expect.objectContaining({ viaRequest: true, requestResolved: true }),
      })
    );
  });
});
