export const MCP_CONNECT_PERMISSION = 'mcp.connect';
export const INVESTOR_DB_VIEW_PERMISSION = 'investor_db.view';
export const INVESTOR_DB_EDIT_PERMISSION = 'investor_db.edit';

export const MCP_PATH = '/mcp';
export const MCP_SCOPE = 'labos';

export const MCP_AUTH_CODE_TTL_MS = 10 * 60 * 1000;
export const MCP_ACCESS_TOKEN_TTL_SEC = 60 * 60;
/** Absolute refresh-grant lifetime from consent. Also how long a rotated refresh hash is kept for reuse detection. */
export const MCP_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Idle refresh-grant lifetime from the last use, or from consent when the grant has not been used. */
export const MCP_REFRESH_TOKEN_IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Registrations one IP may make per hour. The throttler store is in-memory, so this limit is per pod. */
export const MCP_CLIENT_REGISTER_LIMIT = 5;
export const MCP_CLIENT_REGISTER_TTL_SECONDS = 60 * 60;
/** Most OAuth clients the table may hold. Registration returns 429 at this count. */
export const MCP_CLIENT_REGISTER_TOTAL_CAP = 1000;

export const MCP_TOKEN_PREFIX = {
  access: 'mcp_at',
  refresh: 'mcp_rt',
  code: 'mcp_ac',
  client: 'mcp_client',
  memberProof: 'mcp_mp',
} as const;

/** A member proof (LAB-2900) is redeemable once, within this window. */
export const MCP_MEMBER_PROOF_TTL_SECONDS = 5 * 60;

export function mcpIssuerUrl(): string {
  return (process.env.WEB_API_BASE_URL || '').replace(/\/+$/, '');
}

export function mcpResourceUrl(): string {
  return `${mcpIssuerUrl()}${MCP_PATH}`;
}

export function mcpConsentUrl(): string {
  const web = (process.env.WEB_UI_BASE_URL || '').replace(/\/+$/, '');
  return `${web}/mcp/authorize`;
}

/** Settings → MCP connections (LAB-2995). Refusals point the member here. */
export function mcpSettingsUrl(): string {
  const web = (process.env.WEB_UI_BASE_URL || '').replace(/\/+$/, '');
  return `${web}/settings/mcp`;
}
