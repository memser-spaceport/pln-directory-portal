import { McpCallType, MCP_CALL_TYPES } from 'libs/contracts/src/schema/mcp-limits';

export { MCP_CALL_TYPES };
export type { McpCallType };

/**
 * Draft limits until real MCP usage exists (LAB-3149). One place for every number.
 * PL infra is `infraMultiplier` times the standard limit. A warning is sent once
 * a member reaches `warningRatio` of the limit in the current window.
 */
export const MCP_LIMITS: {
  warningRatio: number;
  infraMultiplier: number;
  recentHitSeconds: number;
  standard: Record<McpCallType, { limit: number; windowSeconds: number }>;
} = {
  warningRatio: 0.8,
  infraMultiplier: 5,
  /** How long a hit stays "recent" on the member and admin views. */
  recentHitSeconds: 7 * 24 * 60 * 60,
  standard: {
    read: { limit: 600, windowSeconds: 60 * 60 },
    contact_read: { limit: 30, windowSeconds: 60 * 60 },
    write: { limit: 30, windowSeconds: 60 * 60 },
    forum_post: { limit: 10, windowSeconds: 24 * 60 * 60 },
  },
};

export type McpLimitTier = 'standard' | 'pl_infra';

export type McpLimitDecision = {
  allowed: boolean;
  warned: boolean;
  unavailable: boolean;
  callType: McpCallType;
  used: number;
  limit: number;
  resetsAt: string;
  tier: McpLimitTier;
  override: boolean;
};

export const MCP_CALL_TYPE_LABEL: Record<McpCallType, string> = {
  read: 'read',
  contact_read: 'contact read',
  write: 'write',
  forum_post: 'forum post',
};

export function mcpLimitWindow(callType: McpCallType): 'hour' | 'day' {
  return MCP_LIMITS.standard[callType].windowSeconds >= 24 * 60 * 60 ? 'day' : 'hour';
}

export function mcpLimitWindowLabel(callType: McpCallType): string {
  return mcpLimitWindow(callType) === 'day' ? 'per day' : 'per hour';
}

export function tierLimit(tier: McpLimitTier, callType: McpCallType): number {
  const base = MCP_LIMITS.standard[callType].limit;
  return tier === 'pl_infra' ? base * MCP_LIMITS.infraMultiplier : base;
}

export function limitBucket(callType: McpCallType, now: number): { bucket: number; resetsAt: string } {
  const windowMs = MCP_LIMITS.standard[callType].windowSeconds * 1000;
  const bucket = Math.floor(now / windowMs);
  return { bucket, resetsAt: new Date((bucket + 1) * windowMs).toISOString() };
}
