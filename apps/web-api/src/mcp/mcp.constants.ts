export const MCP_CONNECT_PERMISSION = 'mcp.connect';
export const INVESTOR_DB_VIEW_PERMISSION = 'investor_db.view';

export const MCP_PATH = '/mcp';
export const MCP_SCOPE = 'labos';

export const MCP_AUTH_CODE_TTL_MS = 10 * 60 * 1000;
export const MCP_ACCESS_TOKEN_TTL_SEC = 60 * 60;
export const MCP_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const MCP_TOKEN_PREFIX = {
  access: 'mcp_at',
  refresh: 'mcp_rt',
  code: 'mcp_ac',
  client: 'mcp_client',
} as const;

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
