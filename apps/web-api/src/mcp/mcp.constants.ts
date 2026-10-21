export const MCP_CONNECT_PERMISSION = 'mcp.connect';
export const INVESTOR_DB_VIEW_PERMISSION = 'investor_db.view';
export const INVESTOR_DB_EDIT_PERMISSION = 'investor_db.edit';

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

/** AI Apps feedback tools that change data; `mcp-tool-invoked` counts them as writes. */
export const AI_APP_FEEDBACK_WRITE_TOOLS = ['update_ai_app_feedback_status'];

/**
 * Every MCP tool that changes data. `mcp-tool-invoked` counts these as writes, and a read-only grant does not list
 * them (LAB-2902). A new tool that changes data goes here.
 */
export const MCP_WRITE_TOOLS: ReadonlySet<string> = new Set([
  'submit_warm_path_feedback',
  'submit_warm_path_note',
  'update_master_profile',
  'update_connection_edge',
  'update_warm_path',
  ...AI_APP_FEEDBACK_WRITE_TOOLS,
]);
