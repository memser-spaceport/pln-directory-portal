jest.mock('../analytics/service/analytics.service', () => ({ AnalyticsService: jest.fn() }));

import { countContactMembers } from './mcp-contact-count';
import { MCP_LIMITS } from './mcp-limits.config';
import { McpLimitService } from './mcp-limit.service';
import { limitRefusalText } from './mcp-limit.messages';
import { MCP_CONTACT_READ_TOOLS, MCP_TOOL_SCOPES, MCP_UNSCOPED_TOOLS, toolCallType } from './mcp-scopes.registry';

type OverrideRow = {
  uid: string;
  memberUid: string;
  callType: string;
  limit: number;
  endsAt: Date | null;
  createdByUid: string | null;
  updatedByUid: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function cache() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: jest.fn(async (key: string) => store.get(key)),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
  };
}

function build(opts: { infra?: boolean; cache?: unknown } = {}) {
  const overrides: OverrideRow[] = [];
  const changes: Array<Record<string, unknown>> = [];
  const hits: Array<Record<string, unknown>> = [];
  const prisma = {
    policyAssignment: { findFirst: jest.fn(async () => (opts.infra ? { uid: 'pol-1' } : null)) },
    member: {
      findUnique: jest.fn(async ({ where }: { where: { uid: string } }) =>
        where.uid === 'm1' ? { uid: 'm1', name: 'Ada', email: 'ada@example.com' } : null
      ),
      findMany: jest.fn(async () => [{ uid: 'm1', name: 'Ada', email: 'ada@example.com' }]),
    },
    mcpLimitOverride: {
      findUnique: jest.fn(
        async ({ where }: { where: { memberUid_callType: { memberUid: string; callType: string } } }) => {
          const key = where.memberUid_callType;
          return overrides.find((row) => row.memberUid === key.memberUid && row.callType === key.callType) ?? null;
        }
      ),
      findMany: jest.fn(async ({ where }: { where?: { memberUid?: string } } = {}) =>
        where?.memberUid ? overrides.filter((row) => row.memberUid === where.memberUid) : overrides
      ),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const key = where.memberUid_callType;
        const index = overrides.findIndex((row) => row.memberUid === key.memberUid && row.callType === key.callType);
        if (index === -1) {
          const row: OverrideRow = {
            uid: `o-${overrides.length + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...create,
          };
          overrides.push(row);
          return row;
        }
        overrides[index] = { ...overrides[index], ...update, updatedAt: new Date() };
        return overrides[index];
      }),
      delete: jest.fn(async ({ where }: any) => {
        const key = where.memberUid_callType;
        const index = overrides.findIndex((row) => row.memberUid === key.memberUid && row.callType === key.callType);
        const [row] = overrides.splice(index, 1);
        return row;
      }),
    },
    mcpLimitChange: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        changes.push({ ...data, createdAt: new Date() });
        return data;
      }),
      findMany: jest.fn(async () => changes),
    },
    mcpLimitHit: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        hits.push({ ...data, hitAt: new Date() });
        return data;
      }),
      findMany: jest.fn(async ({ where }: { where?: { memberUid?: string } } = {}) =>
        where?.memberUid ? hits.filter((row) => row.memberUid === where.memberUid) : hits
      ),
    },
  };
  const analytics = { trackEvent: jest.fn().mockResolvedValue(undefined) };
  const service = new McpLimitService((opts.cache ?? cache()) as any, prisma as any, analytics as any);
  return { service, prisma, analytics, overrides, changes, hits };
}

const NOW = Date.parse('2026-11-05T10:15:00.000Z');

describe('MCP call types', () => {
  it('gives every tool one call type, and shares a type across tools', () => {
    for (const name of [...Object.keys(MCP_TOOL_SCOPES), ...MCP_UNSCOPED_TOOLS]) {
      expect(toolCallType(name)).toBeDefined();
    }
    expect(toolCallType('post_team_news')).toBe('write');
    expect(toolCallType('update_my_profile')).toBe('write');
    expect(toolCallType('search_members')).toBe('read');
    expect(toolCallType('list_news')).toBe('read');
    expect(toolCallType('whoami')).toBe('read');
    for (const name of MCP_CONTACT_READ_TOOLS) {
      expect(toolCallType(name)).toBe('contact_read');
      expect(MCP_TOOL_SCOPES[name]?.level).toBe('read');
    }
  });
});

describe('McpLimitService', () => {
  const originalWeb = process.env.WEB_UI_BASE_URL;
  beforeAll(() => {
    process.env.WEB_UI_BASE_URL = 'https://labos.example';
  });
  afterAll(() => {
    process.env.WEB_UI_BASE_URL = originalWeb;
  });

  it('limits each call type across tools, members and windows', async () => {
    const { service } = build();
    const writeLimit = MCP_LIMITS.standard.write.limit;
    for (let i = 0; i < writeLimit; i++) {
      expect((await service.tryConsume('m1', 'write', NOW)).allowed).toBe(true);
    }
    const refused = await service.tryConsume('m1', 'write', NOW);
    expect(refused.allowed).toBe(false);
    expect(refused.used).toBe(writeLimit);
    expect(limitRefusalText(refused)).toContain(`${writeLimit} write calls per hour`);
    expect(limitRefusalText(refused)).toContain(refused.resetsAt);
    expect(limitRefusalText(refused)).toContain('Tell the member');
    expect(limitRefusalText(refused)).toContain('https://labos.example/settings/mcp');
    expect(limitRefusalText(refused)).toContain('callType: write');

    expect((await service.tryConsume('m1', 'read', NOW)).allowed).toBe(true);
    expect((await service.tryConsume('m1', 'contact_read', NOW)).allowed).toBe(true);
    expect((await service.tryConsume('m2', 'write', NOW)).allowed).toBe(true);
    expect((await service.tryConsume('m1', 'write', NOW + 60 * 60 * 1000)).allowed).toBe(true);
  });

  it('counts contact details per member and does not keep a batch that does not fit', async () => {
    const { service } = build();
    const start = Date.parse('2026-11-05T10:00:00.000Z');
    await service.setOverride('m1', { callType: 'contact_read', limit: 10 }, 'admin-1', start);

    expect((await service.tryConsume('m1', 'contact_read', start, 6)).used).toBe(6);
    const peek = await service.peek('m1', 'contact_read', start);
    expect(peek.remaining).toBe(4);
    expect((await service.tryConsume('m1', 'contact_read', start, 5)).allowed).toBe(false);
    expect((await service.peek('m1', 'contact_read', start)).remaining).toBe(4);
    expect((await service.tryConsume('m1', 'contact_read', start, 4)).allowed).toBe(true);
  });

  it('counts each member with email, Telegram, or LinkedIn once', () => {
    const count = countContactMembers({
      teamMemberRoles: [
        { member: { uid: 'a', email: 'a@example.com', name: 'Ada' } },
        { member: { uid: 'a', email: 'a@example.com' } },
        { member: { uid: 'b', telegramHandler: '@b' } },
        { member: { uid: 'c', linkedinHandler: 'c' } },
        { member: { uid: 'd', name: 'Dee' } },
      ],
    });
    expect(count).toBe(3);
  });

  it('gives a PL infra member 5 times the standard limit', async () => {
    const standard = build();
    const infra = build({ infra: true });
    const standardLimit = MCP_LIMITS.standard.contact_read.limit;
    for (let i = 0; i < standardLimit; i++) {
      expect((await standard.service.tryConsume('m1', 'contact_read', NOW)).allowed).toBe(true);
    }
    expect((await standard.service.tryConsume('m1', 'contact_read', NOW)).allowed).toBe(false);

    const first = await infra.service.tryConsume('m1', 'contact_read', NOW);
    expect(first.tier).toBe('pl_infra');
    expect(first.limit).toBe(standardLimit * MCP_LIMITS.infraMultiplier);
    for (let i = 1; i < standardLimit; i++) {
      expect((await infra.service.tryConsume('m1', 'contact_read', NOW)).allowed).toBe(true);
    }
    expect((await infra.service.tryConsume('m1', 'contact_read', NOW)).allowed).toBe(true);
  });

  it('uses an override until its end date, then the tier limit', async () => {
    const { service, changes, analytics } = build();
    const start = Date.parse('2026-11-05T10:00:00.000Z');
    const endsAt = new Date(start + 60_000);
    await service.setOverride('m1', { callType: 'write', limit: 2, endsAt: endsAt.toISOString() }, 'admin-1', start);

    expect(changes[0]).toMatchObject({
      action: 'set',
      actorUid: 'admin-1',
      memberUid: 'm1',
      callType: 'write',
      limit: 2,
    });
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'mcp-limit-override-changed',
        properties: expect.objectContaining({ actorUid: 'admin-1' }),
      })
    );

    expect((await service.tryConsume('m1', 'write', start)).allowed).toBe(true);
    expect((await service.tryConsume('m1', 'write', start)).allowed).toBe(true);
    expect((await service.tryConsume('m1', 'write', start)).allowed).toBe(false);

    const after = await service.tryConsume('m1', 'write', start + 120_000);
    expect(after.allowed).toBe(true);
    expect(after.override).toBe(false);
    expect(after.limit).toBe(MCP_LIMITS.standard.write.limit);
  });

  it('warns once in a window at 80 percent, then refuses with the limit message', async () => {
    const { service } = build();
    const start = Date.parse('2026-11-05T10:00:00.000Z');
    await service.setOverride('m1', { callType: 'forum_post', limit: 5, endsAt: null }, 'admin-1', start);

    const warnings: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      warnings.push((await service.tryConsume('m1', 'forum_post', start)).warned);
    }
    expect(warnings).toEqual([false, false, false, true, false]);

    const refused = await service.tryConsume('m1', 'forum_post', start);
    expect(refused.allowed).toBe(false);
    expect(limitRefusalText(refused)).toContain('5 forum post calls per day');
    expect(limitRefusalText(refused)).toContain('Point them to their limits in Settings');
  });

  it('counts Redis 3 replies, which return true and pass the count to a callback', async () => {
    const counts = new Map<string, number>();
    const warned = new Set<string>();
    const client = {
      incr(key: string, callback: (error: null, value: number) => void) {
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        callback(null, next);
        return true;
      },
      incrby(key: string, amount: number, callback: (error: null, value: number) => void) {
        const next = (counts.get(key) ?? 0) + amount;
        counts.set(key, next);
        callback(null, next);
        return true;
      },
      decrby(key: string, amount: number, callback: (error: null, value: number) => void) {
        const next = (counts.get(key) ?? 0) - amount;
        counts.set(key, next);
        callback(null, next);
        return true;
      },
      expire(_key: string, _ttl: number, callback: (error: null, value: number) => void) {
        callback(null, 1);
        return true;
      },
      get(key: string, callback: (error: null, value: string | null) => void) {
        const value = counts.get(key);
        callback(null, value === undefined ? null : String(value));
        return true;
      },
      set(key: string, _value: string, ...args: unknown[]) {
        const callback = args[args.length - 1] as (error: null, value: string | null) => void;
        if (warned.has(key)) callback(null, null);
        else {
          warned.add(key);
          callback(null, 'OK');
        }
        return true;
      },
    };
    const { service } = build({
      cache: { store: { getClient: () => client }, get: jest.fn(), set: jest.fn() },
    });
    await service.setOverride('m1', { callType: 'contact_read', limit: 10 }, 'admin-1', NOW);

    const burst = await Promise.all(Array.from({ length: 18 }, () => service.tryConsume('m1', 'contact_read', NOW)));
    expect(burst.filter((result) => result.allowed)).toHaveLength(10);
    expect(burst.filter((result) => !result.allowed)).toHaveLength(8);
    expect((await service.tryConsume('m1', 'contact_read', NOW)).allowed).toBe(false);
  });

  it('refuses contact reads, writes and forum posts when the store is down, and allows reads', async () => {
    const down = {
      get: jest.fn().mockRejectedValue(new Error('redis down')),
      set: jest.fn(),
    };
    const prisma = {
      policyAssignment: { findFirst: jest.fn(async () => null) },
      mcpLimitOverride: { findUnique: jest.fn(async () => null) },
      mcpLimitHit: { create: jest.fn() },
    };
    const service = new McpLimitService(down as any, prisma as any, { trackEvent: jest.fn() } as any);

    expect((await service.tryConsume('m1', 'read', NOW)).allowed).toBe(true);
    for (const callType of ['contact_read', 'write', 'forum_post'] as const) {
      const decision = await service.tryConsume('m1', callType, NOW);
      expect(decision.allowed).toBe(false);
      expect(decision.unavailable).toBe(true);
      expect(limitRefusalText(decision)).toContain(`couldn't check the`);
    }
  });

  it('removes an override and logs the admin', async () => {
    const { service, changes } = build();
    await service.setOverride('m1', { callType: 'read', limit: 10 }, 'admin-1', NOW);
    await service.removeOverride('m1', 'read', 'admin-1');
    expect(changes.map((row) => row.action)).toEqual(['set', 'remove']);
    expect(changes[1]).toMatchObject({ actorUid: 'admin-1', callType: 'read' });
    expect((await service.tryConsume('m1', 'read', NOW)).limit).toBe(MCP_LIMITS.standard.read.limit);
  });
});
