import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MCP_LEVELS,
  MCP_SCOPE_KEYS,
  McpAdminScopesResponse,
  McpConnection,
  McpConnectionScope,
  McpLevel,
  McpScopeKey,
  UpdateMcpAdminScopesSchema,
  UpdateMcpScopesSchema,
} from 'libs/contracts/src/schema/mcp-scopes';
import { PrismaService } from '../shared/prisma.service';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { ANALYTICS_EVENTS } from '../utils/constants';
import { connectionStatus } from './mcp-grant-expiry';
import { levelAtLeast, MCP_SCOPES, minLevel, registryMaxLevel, scopesWithTools } from './mcp-scopes.registry';

export type McpStoredLevels = Partial<Record<McpScopeKey, McpLevel>>;

/** Admin maximum per scope. A scope without a stored setting is not capped (`write`). */
export type McpAdminCaps = Record<McpScopeKey, McpLevel>;

/** One scope as a connection sees it: what runs, what the member may set, and whether admins cap it. */
export type McpScopeState = { level: McpLevel; maxLevel: McpLevel; adminMax: McpLevel; lock: 'admin' | null };

type ConnectionRow = {
  uid: string;
  clientName: string;
  connectedAt: Date;
  lastUsedAt: Date | null;
  scopeLevels: unknown;
};

const CONNECTION_SELECT = { uid: true, clientName: true, connectedAt: true, lastUsedAt: true, scopeLevels: true };

function isLevel(value: unknown): value is McpLevel {
  return typeof value === 'string' && (MCP_LEVELS as readonly string[]).includes(value);
}

function isScopeKey(value: unknown): value is McpScopeKey {
  return typeof value === 'string' && (MCP_SCOPE_KEYS as readonly string[]).includes(value);
}

/** The stored JSON map, keeping only known scopes and levels. */
export function parseStoredLevels(json: unknown): McpStoredLevels {
  const out: McpStoredLevels = {};
  if (!json || typeof json !== 'object' || Array.isArray(json)) return out;
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    if (isScopeKey(key) && isLevel(value)) out[key] = value;
  }
  return out;
}

/** Effective levels for one connection (LAB-2995): stored level (missing = `read`) capped by admins and the registry. */
export function resolveScope(stored: McpStoredLevels, caps: McpAdminCaps, scope: McpScopeKey): McpScopeState {
  const registryMax = registryMaxLevel(scope);
  const adminMax = caps[scope];
  const maxLevel = minLevel(registryMax, adminMax);
  return {
    level: minLevel(stored[scope] ?? 'read', maxLevel),
    maxLevel,
    adminMax,
    lock: levelAtLeast(adminMax, registryMax) ? null : 'admin',
  };
}

/** What a new consent stores: `read` everywhere, `none` where admins set `none`. */
export function initialScopeLevels(caps: McpAdminCaps): McpStoredLevels {
  const out: McpStoredLevels = {};
  for (const key of MCP_SCOPE_KEYS) out[key] = caps[key] === 'none' ? 'none' : 'read';
  return out;
}

@Injectable()
export class McpScopesService {
  constructor(private readonly prisma: PrismaService, private readonly analytics: AnalyticsService) {}

  /** Throws when the settings can't be read; MCP callers fail closed on that. */
  async adminCaps(): Promise<McpAdminCaps> {
    const rows = await this.prisma.mcpScopeSetting.findMany();
    const caps = Object.fromEntries(MCP_SCOPE_KEYS.map((k) => [k, 'write'])) as McpAdminCaps;
    for (const row of rows) {
      if (isScopeKey(row.scope) && isLevel(row.maxLevel)) caps[row.scope] = row.maxLevel;
    }
    return caps;
  }

  /** AI-app sessions and member proofs act with the connection's AI Apps level. Unreadable settings mean read. */
  async aiAppsAccess(stored: McpStoredLevels): Promise<'read' | 'write'> {
    try {
      return resolveScope(stored, await this.adminCaps(), 'ai_apps').level === 'write' ? 'write' : 'read';
    } catch {
      return 'read';
    }
  }

  toConnection(row: ConnectionRow, caps: McpAdminCaps, now = Date.now()): McpConnection {
    const stored = parseStoredLevels(row.scopeLevels);
    const scopes: McpConnectionScope[] = scopesWithTools().map(({ key, label }) => {
      const state = resolveScope(stored, caps, key);
      return { key, label, level: state.level, maxLevel: state.maxLevel, lock: state.lock };
    });
    return {
      uid: row.uid,
      clientName: row.clientName,
      connectedAt: row.connectedAt.toISOString(),
      lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
      status: connectionStatus(row, now),
      scopes,
    };
  }

  async listConnections(memberUid: string): Promise<{ items: McpConnection[] }> {
    const [rows, caps] = await Promise.all([
      this.prisma.mcpAuthorization.findMany({
        where: { memberUid, revokedAt: null },
        orderBy: { connectedAt: 'desc' },
        select: CONNECTION_SELECT,
      }),
      this.adminCaps(),
    ]);
    return { items: rows.map((row) => this.toConnection(row, caps)) };
  }

  /** Saves all given levels of one of the member's connections at once (PATCH …/scopes). */
  async updateConnectionLevels(memberUid: string, uid: string, body: unknown): Promise<McpConnection> {
    const parsed = UpdateMcpScopesSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const levels = parsed.data.levels as McpStoredLevels;

    const row = await this.prisma.mcpAuthorization.findFirst({
      where: { uid, memberUid, revokedAt: null },
      select: CONNECTION_SELECT,
    });
    if (!row) {
      throw new NotFoundException('Connection not found');
    }

    const caps = await this.adminCaps();
    const stored = parseStoredLevels(row.scopeLevels);
    const changes: Array<{ scope: McpScopeKey; from: McpLevel; to: McpLevel }> = [];
    for (const [scope, level] of Object.entries(levels) as Array<[McpScopeKey, McpLevel]>) {
      const state = resolveScope(stored, caps, scope);
      if (!levelAtLeast(state.maxLevel, level)) {
        throw new ConflictException(`${scope} can't be set to ${level} for this connection`);
      }
      if (state.level !== level) changes.push({ scope, from: state.level, to: level });
    }

    // Only changed scopes are written, so a level above a lowered admin maximum comes back when admins raise it again.
    const next: McpStoredLevels = { ...stored };
    for (const { scope, to } of changes) next[scope] = to;
    const updated = await this.prisma.mcpAuthorization.update({
      where: { uid },
      data: { scopeLevels: next },
      select: CONNECTION_SELECT,
    });

    if (changes.length > 0) {
      void this.analytics.trackEvent({
        name: ANALYTICS_EVENTS.MCP.SCOPE_LEVELS_UPDATED,
        distinctId: memberUid,
        properties: {
          memberUid,
          authorizationUid: uid,
          clientName: row.clientName,
          changes,
          // Access requests are resolved by LAB-3014.
          viaRequest: Boolean(parsed.data.requestUid),
        },
      });
    }
    return this.toConnection(updated, caps);
  }

  async adminScopes(): Promise<McpAdminScopesResponse> {
    const caps = await this.adminCaps();
    return {
      scopes: MCP_SCOPES.map(({ key, label }) => ({
        key,
        label,
        registryMax: registryMaxLevel(key),
        adminMax: caps[key],
      })),
    };
  }

  async setAdminScopes(body: unknown, updatedByUid: string | null): Promise<McpAdminScopesResponse> {
    const parsed = UpdateMcpAdminScopesSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const entries = Object.entries(parsed.data.scopes) as Array<[McpScopeKey, McpLevel]>;
    const before = await this.adminCaps();
    await this.prisma.$transaction(
      entries.map(([scope, maxLevel]) =>
        this.prisma.mcpScopeSetting.upsert({
          where: { scope },
          create: { scope, maxLevel, updatedByUid },
          update: { maxLevel, updatedByUid },
        })
      )
    );
    for (const [scope, maxLevel] of entries) {
      if (before[scope] === maxLevel) continue;
      void this.analytics.trackEvent({
        name: ANALYTICS_EVENTS.MCP.ADMIN_SCOPE_UPDATED,
        distinctId: updatedByUid ?? 'admin',
        properties: { scope, from: before[scope], to: maxLevel, updatedByUid },
      });
    }
    return this.adminScopes();
  }
}
