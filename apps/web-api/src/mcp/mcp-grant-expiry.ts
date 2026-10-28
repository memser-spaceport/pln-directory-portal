import { McpConnectionStatus } from 'libs/contracts/src/schema/mcp-scopes';
import { MCP_REFRESH_TOKEN_IDLE_TTL_MS, MCP_REFRESH_TOKEN_TTL_MS } from './mcp.constants';

type GrantTimes = { connectedAt: Date; lastUsedAt: Date | null };

/** A connection used within this window is Active; after it, Idle (LAB-2995). */
export const MCP_ACTIVE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** True when the grant is past 30 days from consent, or past 7 days from its last use. */
export function refreshGrantExpired(grant: GrantTimes, now = Date.now()): boolean {
  const lastUsed = grant.lastUsedAt ?? grant.connectedAt;
  return (
    now - grant.connectedAt.getTime() >= MCP_REFRESH_TOKEN_TTL_MS || now - lastUsed.getTime() >= MCP_REFRESH_TOKEN_IDLE_TTL_MS
  );
}

/**
 * The status badge in Settings. Sign-in expired wins: under the 7-day idle refresh lifetime a grant unused for 14 days
 * has already expired, so Idle only shows if those lifetimes change.
 */
export function connectionStatus(grant: GrantTimes, now = Date.now()): McpConnectionStatus {
  if (refreshGrantExpired(grant, now)) return 'signin_expired';
  if (!grant.lastUsedAt) return 'not_used';
  return now - grant.lastUsedAt.getTime() < MCP_ACTIVE_WINDOW_MS ? 'active' : 'idle';
}
