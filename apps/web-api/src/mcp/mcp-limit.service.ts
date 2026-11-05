import { BadRequestException, CACHE_MANAGER, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { McpCallType, MCP_CALL_TYPES, UpsertMcpLimitOverrideSchema } from 'libs/contracts/src/schema/mcp-limits';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { PL_INFRA_POLICY_CODE } from '../pl-infra-members/pl-infra-members.constants';
import { PrismaService } from '../shared/prisma.service';
import { ANALYTICS_EVENTS } from '../utils/constants';
import {
  limitBucket,
  MCP_CALL_TYPE_LABEL,
  MCP_LIMITS,
  McpLimitDecision,
  McpLimitTier,
  mcpLimitWindow,
  tierLimit,
} from './mcp-limits.config';

type RedisReply<T> = (error: Error | null, value: T) => void;

/**
 * The cache store uses Redis 3. Its commands return `true` when queued and pass the reply to a callback.
 * A promise-style client (tests, Redis 4) returns the reply instead. `redisReply` accepts both.
 */
type LimitRedis = {
  incr: (key: string, callback?: RedisReply<number>) => unknown;
  incrby?: (key: string, amount: number, callback?: RedisReply<number>) => unknown;
  incrBy?: (key: string, amount: number, callback?: RedisReply<number>) => unknown;
  decr: (key: string, callback?: RedisReply<number>) => unknown;
  decrby?: (key: string, amount: number, callback?: RedisReply<number>) => unknown;
  decrBy?: (key: string, amount: number, callback?: RedisReply<number>) => unknown;
  expire: (key: string, seconds: number, callback?: RedisReply<number>) => unknown;
  get: (key: string, callback?: RedisReply<string | null>) => unknown;
  set: (key: string, value: string, ...args: unknown[]) => unknown;
};

function redisReply<T>(invoke: (callback: RedisReply<T>) => unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | null, value?: T) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value as T);
    };
    let result: unknown;
    try {
      result = invoke((error, value) => finish(error, value));
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    if (result && typeof (result as Promise<T>).then === 'function') {
      (result as Promise<T>).then(
        (value) => finish(null, value),
        (error: unknown) => finish(error instanceof Error ? error : new Error(String(error)))
      );
    }
  });
}

type MemberRow = { uid: string; name: string | null; email: string | null };

export type McpLimitRow = {
  callType: McpCallType;
  label: string;
  used: number | null;
  limit: number;
  resetsAt: string;
  window: 'hour' | 'day';
  tier: McpLimitTier;
  override: { limit: number; endsAt: string | null } | null;
  hitRecently: boolean;
  lastHitAt: string | null;
};

export type McpMemberLimits = { tier: McpLimitTier; limits: McpLimitRow[] };

export type McpAdminLimits = {
  callTypes: Array<{
    callType: McpCallType;
    label: string;
    standardLimit: number;
    infraLimit: number;
    window: 'hour' | 'day';
  }>;
  recentHits: Array<{
    memberUid: string;
    memberName: string | null;
    email: string | null;
    callType: McpCallType;
    hitAt: string;
    resetsAt: string;
  }>;
  overrides: Array<{
    memberUid: string;
    memberName: string | null;
    email: string | null;
    callType: McpCallType;
    limit: number;
    endsAt: string | null;
    updatedAt: string;
    updatedByUid: string | null;
  }>;
  changes: Array<{
    memberUid: string;
    callType: string;
    action: string;
    limit: number | null;
    endsAt: string | null;
    actorUid: string | null;
    createdAt: string;
  }>;
  members: Array<{ uid: string; name: string | null; email: string | null; tier: McpLimitTier; limits: McpLimitRow[] }>;
};

function counterKey(callType: McpCallType, memberUid: string, bucket: number): string {
  return `mcp:limit:${callType}:${memberUid}:${bucket}`;
}

function warnKey(callType: McpCallType, memberUid: string, bucket: number): string {
  return `mcp:limit:warned:${callType}:${memberUid}:${bucket}`;
}

function isCallType(value: string): value is McpCallType {
  return (MCP_CALL_TYPES as readonly string[]).includes(value);
}

/**
 * One fixed-window counter per member and call type, in the shared cache, so every pod sees the same count.
 * Contact reads, writes and forum posts are refused when the cache is down. Reads are allowed.
 */
@Injectable()
export class McpLimitService {
  private readonly logger = new Logger(McpLimitService.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService
  ) {}

  async tryConsume(memberUid: string, callType: McpCallType, now = Date.now(), amount = 1): Promise<McpLimitDecision> {
    const { base, ttl, key } = await this.budget(memberUid, callType, now);
    const count = Math.max(1, Math.trunc(amount));
    try {
      const used = await this.incrementBy(key, ttl, count);
      if (used > base.limit) {
        await this.decrementBy(key, ttl, count);
        await this.recordHit(memberUid, callType, base.resetsAt);
        return { ...base, allowed: false, warned: false, unavailable: false, used: base.limit };
      }
      const warned = await this.warnOnce(callType, memberUid, this.bucketOf(callType, now), ttl, used, base.limit);
      return { ...base, allowed: true, warned, unavailable: false, used };
    } catch (error) {
      return this.storeDown(callType, base, error);
    }
  }

  /** How many contact details remain in this window. Does not count a call. */
  async peek(
    memberUid: string,
    callType: McpCallType,
    now = Date.now()
  ): Promise<McpLimitDecision & { remaining: number }> {
    const { base, key } = await this.budget(memberUid, callType, now);
    try {
      const used = Math.min(await this.readCount(key), base.limit);
      const remaining = Math.max(0, base.limit - used);
      return { ...base, allowed: remaining > 0, warned: false, unavailable: false, used, remaining };
    } catch (error) {
      const decision = this.storeDown(callType, base, error);
      return { ...decision, remaining: 0 };
    }
  }

  async usageFor(memberUid: string, now = Date.now()): Promise<McpMemberLimits> {
    const tier = await this.tierFor(memberUid);
    const overrides = await this.prisma.mcpLimitOverride.findMany({ where: { memberUid } });
    const since = new Date(now - MCP_LIMITS.recentHitSeconds * 1000);
    const hits = await this.prisma.mcpLimitHit.findMany({
      where: { memberUid, hitAt: { gte: since } },
      orderBy: { hitAt: 'desc' },
    });
    const limits: McpLimitRow[] = [];
    for (const callType of MCP_CALL_TYPES) {
      limits.push(await this.rowFor(memberUid, callType, tier, overrides, hits, now));
    }
    return { tier, limits };
  }

  async adminView(query: string | undefined, now = Date.now()): Promise<McpAdminLimits> {
    const since = new Date(now - MCP_LIMITS.recentHitSeconds * 1000);
    const [overrideRows, hitRows, changeRows] = await Promise.all([
      this.prisma.mcpLimitOverride.findMany({ orderBy: { updatedAt: 'desc' } }),
      this.prisma.mcpLimitHit.findMany({ where: { hitAt: { gte: since } }, orderBy: { hitAt: 'desc' }, take: 50 }),
      this.prisma.mcpLimitChange.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }),
    ]);
    const active = overrideRows.filter((row) => !row.endsAt || row.endsAt.getTime() > now);
    const people = await this.membersByUid([
      ...active.map((row) => row.memberUid),
      ...hitRows.map((row) => row.memberUid),
      ...changeRows.map((row) => row.actorUid),
    ]);
    const q = query?.trim();
    const members = q ? await this.searchMembers(q) : [];
    return {
      callTypes: MCP_CALL_TYPES.map((callType) => ({
        callType,
        label: MCP_CALL_TYPE_LABEL[callType],
        standardLimit: tierLimit('standard', callType),
        infraLimit: tierLimit('pl_infra', callType),
        window: mcpLimitWindow(callType),
      })),
      recentHits: hitRows
        .filter((row) => isCallType(row.callType))
        .map((row) => ({
          memberUid: row.memberUid,
          memberName: people.get(row.memberUid)?.name ?? null,
          email: people.get(row.memberUid)?.email ?? null,
          callType: row.callType as McpCallType,
          hitAt: row.hitAt.toISOString(),
          resetsAt: row.resetsAt.toISOString(),
        })),
      overrides: active
        .filter((row) => isCallType(row.callType))
        .map((row) => ({
          memberUid: row.memberUid,
          memberName: people.get(row.memberUid)?.name ?? null,
          email: people.get(row.memberUid)?.email ?? null,
          callType: row.callType as McpCallType,
          limit: row.limit,
          endsAt: row.endsAt?.toISOString() ?? null,
          updatedAt: row.updatedAt.toISOString(),
          updatedByUid: row.updatedByUid,
        })),
      changes: changeRows.map((row) => ({
        memberUid: row.memberUid,
        callType: row.callType,
        action: row.action,
        limit: row.limit,
        endsAt: row.endsAt?.toISOString() ?? null,
        actorUid: row.actorUid,
        createdAt: row.createdAt.toISOString(),
      })),
      members: await Promise.all(
        members.map(async (member) => {
          const usage = await this.usageFor(member.uid, now);
          return { uid: member.uid, name: member.name, email: member.email, tier: usage.tier, limits: usage.limits };
        })
      ),
    };
  }

  async setOverride(memberUid: string, body: unknown, actorUid: string | null, now = Date.now()) {
    const parsed = UpsertMcpLimitOverrideSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    const member = await this.prisma.member.findUnique({ where: { uid: memberUid }, select: { uid: true } });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
    if (endsAt && endsAt.getTime() <= now) {
      throw new BadRequestException('The end date must be in the future');
    }
    const existing = await this.prisma.mcpLimitOverride.findUnique({
      where: { memberUid_callType: { memberUid, callType: parsed.data.callType } },
    });
    const row = await this.prisma.mcpLimitOverride.upsert({
      where: { memberUid_callType: { memberUid, callType: parsed.data.callType } },
      create: {
        memberUid,
        callType: parsed.data.callType,
        limit: parsed.data.limit,
        endsAt,
        createdByUid: actorUid,
        updatedByUid: actorUid,
      },
      update: { limit: parsed.data.limit, endsAt, updatedByUid: actorUid },
    });
    await this.recordChange({
      memberUid,
      callType: parsed.data.callType,
      action: existing ? 'update' : 'set',
      limit: parsed.data.limit,
      endsAt,
      actorUid,
    });
    return row;
  }

  async removeOverride(memberUid: string, callType: string, actorUid: string | null) {
    if (!isCallType(callType)) {
      throw new BadRequestException('Unknown call type');
    }
    const existing = await this.prisma.mcpLimitOverride.findUnique({
      where: { memberUid_callType: { memberUid, callType } },
    });
    if (!existing) {
      throw new NotFoundException('Override not found');
    }
    await this.prisma.mcpLimitOverride.delete({ where: { memberUid_callType: { memberUid, callType } } });
    await this.recordChange({
      memberUid,
      callType,
      action: 'remove',
      limit: existing.limit,
      endsAt: existing.endsAt,
      actorUid,
    });
    return { removed: true };
  }

  private async rowFor(
    memberUid: string,
    callType: McpCallType,
    tier: McpLimitTier,
    overrides: Array<{ callType: string; limit: number; endsAt: Date | null }>,
    hits: Array<{ callType: string; hitAt: Date }>,
    now: number
  ): Promise<McpLimitRow> {
    const stored = overrides.find((row) => row.callType === callType) ?? null;
    const active = stored && (!stored.endsAt || stored.endsAt.getTime() > now) ? stored : null;
    const limit = active?.limit ?? tierLimit(tier, callType);
    const { bucket, resetsAt } = limitBucket(callType, now);
    let used: number | null = 0;
    try {
      used = await this.readCount(counterKey(callType, memberUid, bucket));
    } catch (error) {
      this.logger.warn(`MCP limit usage unavailable for ${callType}: ${String(error)}`);
      used = null;
    }
    const hit = hits.find((row) => row.callType === callType);
    return {
      callType,
      label: MCP_CALL_TYPE_LABEL[callType],
      used,
      limit,
      resetsAt,
      window: mcpLimitWindow(callType),
      tier,
      override: active ? { limit: active.limit, endsAt: active.endsAt?.toISOString() ?? null } : null,
      hitRecently: Boolean(hit) || (used !== null && used >= limit),
      lastHitAt: hit?.hitAt.toISOString() ?? null,
    };
  }

  private async tierFor(memberUid: string): Promise<McpLimitTier> {
    try {
      const row = await this.prisma.policyAssignment.findFirst({
        where: { memberUid, policy: { code: PL_INFRA_POLICY_CODE } },
        select: { uid: true },
      });
      return row ? 'pl_infra' : 'standard';
    } catch (error) {
      this.logger.warn(`MCP limit tier lookup failed, using standard: ${String(error)}`);
      return 'standard';
    }
  }

  private async activeOverride(memberUid: string, callType: McpCallType, now: number) {
    const row = await this.prisma.mcpLimitOverride.findUnique({
      where: { memberUid_callType: { memberUid, callType } },
    });
    if (!row || (row.endsAt && row.endsAt.getTime() <= now)) {
      return null;
    }
    return row;
  }

  private async recordHit(memberUid: string, callType: McpCallType, resetsAt: string) {
    try {
      await this.prisma.mcpLimitHit.create({
        data: { memberUid, callType, resetsAt: new Date(resetsAt) },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return;
      this.logger.warn(`MCP limit hit not stored: ${String(error)}`);
    }
  }

  private async recordChange(data: {
    memberUid: string;
    callType: string;
    action: 'set' | 'update' | 'remove';
    limit: number | null;
    endsAt: Date | null;
    actorUid: string | null;
  }) {
    await this.prisma.mcpLimitChange.create({ data });
    void this.analytics.trackEvent({
      name: ANALYTICS_EVENTS.MCP.LIMIT_OVERRIDE_CHANGED,
      distinctId: data.actorUid ?? data.memberUid,
      properties: {
        memberUid: data.memberUid,
        callType: data.callType,
        action: data.action,
        limit: data.limit,
        endsAt: data.endsAt?.toISOString() ?? null,
        actorUid: data.actorUid,
      },
    });
  }

  private async searchMembers(q: string): Promise<MemberRow[]> {
    if (q.includes('@')) {
      return this.prisma.member.findMany({
        where: { email: { equals: q, mode: 'insensitive' } },
        select: { uid: true, name: true, email: true },
        take: 8,
      });
    }
    return this.prisma.member.findMany({
      where: { OR: [{ uid: q }, { name: { contains: q, mode: 'insensitive' } }] },
      select: { uid: true, name: true, email: true },
      take: 8,
    });
  }

  private async membersByUid(uids: Array<string | null>): Promise<Map<string, MemberRow>> {
    const ids = [...new Set(uids.filter((uid): uid is string => Boolean(uid)))];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.member.findMany({
      where: { uid: { in: ids } },
      select: { uid: true, name: true, email: true },
    });
    return new Map(rows.map((row) => [row.uid, row]));
  }

  private redisClient(): LimitRedis | null {
    const store = (this.cache as { store?: { getClient?: () => LimitRedis } }).store;
    try {
      const client = store?.getClient?.();
      if (client && typeof client.incr === 'function') return client;
    } catch (error) {
      this.logger.warn(`MCP limit store client unavailable: ${String(error)}`);
    }
    return null;
  }

  private async budget(memberUid: string, callType: McpCallType, now: number) {
    const tier = await this.tierFor(memberUid);
    const override = await this.activeOverride(memberUid, callType, now);
    const limit = override?.limit ?? tierLimit(tier, callType);
    const { bucket, resetsAt } = limitBucket(callType, now);
    return {
      ttl: MCP_LIMITS.standard[callType].windowSeconds,
      key: counterKey(callType, memberUid, bucket),
      base: { callType, limit, resetsAt, tier, override: Boolean(override) },
    };
  }

  private bucketOf(callType: McpCallType, now: number): number {
    return limitBucket(callType, now).bucket;
  }

  private storeDown(
    callType: McpCallType,
    base: { callType: McpCallType; limit: number; resetsAt: string; tier: McpLimitTier; override: boolean },
    error: unknown
  ): McpLimitDecision {
    this.logger.warn(`MCP limit store unavailable for ${callType}: ${String(error)}`);
    const failClosed = callType !== 'read';
    return { ...base, allowed: !failClosed, warned: false, unavailable: true, used: 0 };
  }

  private async incrementBy(key: string, ttlSeconds: number, amount: number): Promise<number> {
    const client = this.redisClient();
    if (client) {
      const count = await this.add(client, key, amount);
      if (count === amount) {
        await redisReply<number>((callback) => client.expire(key, ttlSeconds, callback));
      }
      return count;
    }
    const used = Number((await this.cache.get<number>(key)) ?? 0);
    const next = used + amount;
    await this.cache.set(key, next, { ttl: ttlSeconds });
    return next;
  }

  private async decrementBy(key: string, ttlSeconds: number, amount: number): Promise<void> {
    const client = this.redisClient();
    if (client) {
      await this.subtract(client, key, amount);
      return;
    }
    const used = Number((await this.cache.get<number>(key)) ?? 0);
    await this.cache.set(key, Math.max(0, used - amount), { ttl: ttlSeconds });
  }

  private add(client: LimitRedis, key: string, amount: number): Promise<number> {
    const incrBy = client.incrby ?? client.incrBy;
    if (incrBy) {
      return redisReply<number>((callback) => incrBy(key, amount, callback));
    }
    return this.step(client, key, amount, 1);
  }

  private subtract(client: LimitRedis, key: string, amount: number): Promise<number> {
    const decrBy = client.decrby ?? client.decrBy;
    if (decrBy) {
      return redisReply<number>((callback) => decrBy(key, amount, callback));
    }
    return this.step(client, key, amount, -1);
  }

  private async step(client: LimitRedis, key: string, amount: number, direction: 1 | -1): Promise<number> {
    let count = 0;
    for (let i = 0; i < amount; i++) {
      count =
        direction === 1
          ? await redisReply<number>((callback) => client.incr(key, callback))
          : await redisReply<number>((callback) => client.decr(key, callback));
    }
    return count;
  }

  private async readCount(key: string): Promise<number> {
    const client = this.redisClient();
    if (client) {
      const value = await redisReply<string | null>((callback) => client.get(key, callback));
      return value ? Number(value) : 0;
    }
    return Number((await this.cache.get<number>(key)) ?? 0);
  }

  /** True only the first time this window crosses the warning ratio. */
  private async warnOnce(
    callType: McpCallType,
    memberUid: string,
    bucket: number,
    ttlSeconds: number,
    used: number,
    limit: number
  ): Promise<boolean> {
    if (limit <= 0 || used / limit < MCP_LIMITS.warningRatio) return false;
    const key = warnKey(callType, memberUid, bucket);
    const client = this.redisClient();
    if (client) {
      const set = await redisReply<string | null>((callback) => client.set(key, '1', 'EX', ttlSeconds, 'NX', callback));
      return set === 'OK';
    }
    if (await this.cache.get(key)) return false;
    await this.cache.set(key, 1, { ttl: ttlSeconds });
    return true;
  }
}
