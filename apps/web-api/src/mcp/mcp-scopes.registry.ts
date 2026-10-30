import { MCP_SCOPE_KEYS, McpLevel, McpScopeKey } from 'libs/contracts/src/schema/mcp-scopes';

/**
 * The reviewed MCP allowlist (LAB-2995): every tool an agent can see, with its scope and level. A tool missing here is
 * never listed or callable (`whoami` aside). Adding a tool means adding it here, which is the review step.
 */

export const MCP_SCOPES: ReadonlyArray<{ key: McpScopeKey; label: string }> = [
  { key: 'search', label: 'Search' },
  { key: 'forum', label: 'Forum' },
  { key: 'news', label: 'News feed' },
  { key: 'directory', label: 'Members, teams and projects' },
  { key: 'events', label: 'Events' },
  { key: 'investors', label: 'Investors and warm intros' },
  { key: 'profile', label: 'Your profile' },
  { key: 'ai_apps', label: 'AI Apps' },
];

export type McpToolScope = { scope: McpScopeKey; level: 'read' | 'write' };

export const MCP_TOOL_SCOPES: Readonly<Record<string, McpToolScope>> = {
  search_members: { scope: 'search', level: 'read' },
  search_teams: { scope: 'search', level: 'read' },
  search_projects: { scope: 'search', level: 'read' },
  search_events: { scope: 'search', level: 'read' },

  search_forum_threads: { scope: 'forum', level: 'read' },
  get_forum_thread: { scope: 'forum', level: 'read' },

  list_news: { scope: 'news', level: 'read' },
  get_news_item: { scope: 'news', level: 'read' },
  post_team_news: { scope: 'news', level: 'write' },

  get_member: { scope: 'directory', level: 'read' },
  get_team: { scope: 'directory', level: 'read' },
  get_project: { scope: 'directory', level: 'read' },
  list_portfolio_teams: { scope: 'directory', level: 'read' },
  update_team: { scope: 'directory', level: 'write' },
  update_project: { scope: 'directory', level: 'write' },

  get_event: { scope: 'events', level: 'read' },
  rsvp_event: { scope: 'events', level: 'write' },
  cancel_event_rsvp: { scope: 'events', level: 'write' },

  search_master_profiles: { scope: 'investors', level: 'read' },
  get_master_profile: { scope: 'investors', level: 'read' },
  search_warm_intro_investors: { scope: 'investors', level: 'read' },
  get_warm_intro_investor: { scope: 'investors', level: 'read' },
  get_warm_path_feedback: { scope: 'investors', level: 'read' },
  get_warm_path_note: { scope: 'investors', level: 'read' },
  submit_warm_path_feedback: { scope: 'investors', level: 'write' },
  submit_warm_path_note: { scope: 'investors', level: 'write' },
  update_master_profile: { scope: 'investors', level: 'write' },
  update_connection_edge: { scope: 'investors', level: 'write' },
  update_warm_path: { scope: 'investors', level: 'write' },

  get_my_profile: { scope: 'profile', level: 'read' },
  update_my_profile: { scope: 'profile', level: 'write' },
  join_team: { scope: 'profile', level: 'write' },
  leave_team: { scope: 'profile', level: 'write' },
  join_project: { scope: 'profile', level: 'write' },
  leave_project: { scope: 'profile', level: 'write' },
  list_my_experiences: { scope: 'profile', level: 'read' },
  add_experience: { scope: 'profile', level: 'write' },
  update_experience: { scope: 'profile', level: 'write' },
  delete_experience: { scope: 'profile', level: 'write' },
  follow_team: { scope: 'profile', level: 'write' },
  unfollow_team: { scope: 'profile', level: 'write' },
  save_job: { scope: 'profile', level: 'write' },
  unsave_job: { scope: 'profile', level: 'write' },
  get_my_job_alert: { scope: 'profile', level: 'read' },
  set_job_alert: { scope: 'profile', level: 'write' },
  delete_job_alert: { scope: 'profile', level: 'write' },

  list_my_ai_apps: { scope: 'ai_apps', level: 'read' },
  list_ai_app_feedback: { scope: 'ai_apps', level: 'read' },
  update_ai_app_feedback_status: { scope: 'ai_apps', level: 'write' },
};

/** Tools outside every scope. Always listed. */
export const MCP_UNSCOPED_TOOLS: ReadonlySet<string> = new Set(['whoami']);

const RANK: Record<McpLevel, number> = { none: 0, read: 1, write: 2 };

export function levelAtLeast(level: McpLevel, needed: McpLevel): boolean {
  return RANK[level] >= RANK[needed];
}

export function minLevel(a: McpLevel, b: McpLevel): McpLevel {
  return RANK[a] <= RANK[b] ? a : b;
}

export function toolScope(toolName: string): McpToolScope | undefined {
  return MCP_TOOL_SCOPES[toolName];
}

export function isWriteTool(toolName: string): boolean {
  return MCP_TOOL_SCOPES[toolName]?.level === 'write';
}

/** What a scope's tools allow: `write` if any writes, `read` if it has tools, `none` if it has none yet. */
export function registryMaxLevel(scope: McpScopeKey): McpLevel {
  let max: McpLevel = 'none';
  for (const entry of Object.values(MCP_TOOL_SCOPES)) {
    if (entry.scope === scope && RANK[entry.level] > RANK[max]) {
      max = entry.level;
    }
  }
  return max;
}

/** Scopes in priority order that have at least one tool. Scopes without tools are not offered to anyone. */
export function scopesWithTools(): ReadonlyArray<{ key: McpScopeKey; label: string }> {
  return MCP_SCOPES.filter((s) => registryMaxLevel(s.key) !== 'none');
}

export function scopeLabel(scope: McpScopeKey): string {
  return MCP_SCOPES.find((s) => s.key === scope)?.label ?? scope;
}

export { MCP_SCOPE_KEYS };
