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
  update_fundraising_profile: { scope: 'directory', level: 'write' },
  update_team_pitch_profile: { scope: 'directory', level: 'write' },

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
  get_my_email_preferences: { scope: 'profile', level: 'read' },
  update_email_preferences: { scope: 'profile', level: 'write' },
  save_demo_day_team: { scope: 'profile', level: 'write' },
  unsave_demo_day_team: { scope: 'profile', level: 'write' },
  list_my_notifications: { scope: 'profile', level: 'read' },
  mark_notification_read: { scope: 'profile', level: 'write' },
  mark_all_notifications_read: { scope: 'profile', level: 'write' },
  list_deals: { scope: 'profile', level: 'read' },
  mark_deal_used: { scope: 'profile', level: 'write' },
  unmark_deal_used: { scope: 'profile', level: 'write' },
  report_deal_issue: { scope: 'profile', level: 'write' },
  like_guide: { scope: 'profile', level: 'write' },
  unlike_guide: { scope: 'profile', level: 'write' },
  submit_demo_day_feedback: { scope: 'profile', level: 'write' },
  list_my_office_hours_followups: { scope: 'profile', level: 'read' },
  submit_office_hours_feedback: { scope: 'profile', level: 'write' },
  update_my_investor_profile: { scope: 'profile', level: 'write' },
  update_my_privacy: { scope: 'profile', level: 'write' },
  update_my_team_membership: { scope: 'profile', level: 'write' },
  update_my_project_contribution: { scope: 'profile', level: 'write' },
  update_my_self_role: { scope: 'profile', level: 'write' },
  delete_my_image: { scope: 'profile', level: 'write' },
  update_notification_settings: { scope: 'profile', level: 'write' },
  list_my_job_applications: { scope: 'profile', level: 'read' },
  list_my_job_interests: { scope: 'profile', level: 'read' },
  apply_to_job: { scope: 'profile', level: 'write' },
  mark_job_interest: { scope: 'profile', level: 'write' },
  remove_job_interest: { scope: 'profile', level: 'write' },
  mark_team_hiring_interest: { scope: 'profile', level: 'write' },
  refer_job: { scope: 'profile', level: 'write' },
  create_guide_comment: { scope: 'profile', level: 'write' },
  reply_guide_comment: { scope: 'profile', level: 'write' },
  update_guide_comment: { scope: 'profile', level: 'write' },
  delete_guide_comment: { scope: 'profile', level: 'write' },
  like_guide_comment: { scope: 'profile', level: 'write' },
  unlike_guide_comment: { scope: 'profile', level: 'write' },
  request_guide: { scope: 'profile', level: 'write' },
  request_office_hours: { scope: 'profile', level: 'write' },
  close_office_hours_followup: { scope: 'profile', level: 'write' },
  report_broken_office_hours: { scope: 'profile', level: 'write' },
  accept_demo_day_confidentiality: { scope: 'profile', level: 'write' },
  apply_to_demo_day: { scope: 'profile', level: 'write' },
  express_demo_day_interest: { scope: 'profile', level: 'write' },
  accept_pitch_confidentiality: { scope: 'profile', level: 'write' },
  express_pitch_interest: { scope: 'profile', level: 'write' },
  submit_deal: { scope: 'profile', level: 'write' },
  request_deal: { scope: 'profile', level: 'write' },
  request_spv_access: { scope: 'profile', level: 'write' },
  contact_support: { scope: 'profile', level: 'write' },
  delete_notification: { scope: 'profile', level: 'write' },
  create_roadmap_item: { scope: 'profile', level: 'write' },
  update_roadmap_item: { scope: 'profile', level: 'write' },
  pin_roadmap_item: { scope: 'profile', level: 'write' },
  unpin_roadmap_item: { scope: 'profile', level: 'write' },

  update_team_fund_profile: { scope: 'directory', level: 'write' },
  update_team_membership_sources: { scope: 'directory', level: 'write' },
  update_team_communities: { scope: 'directory', level: 'write' },
  update_team_roster: { scope: 'directory', level: 'write' },
  create_team: { scope: 'directory', level: 'write' },
  delete_team: { scope: 'directory', level: 'write' },
  review_team_enrichment: { scope: 'directory', level: 'write' },
  create_project: { scope: 'directory', level: 'write' },
  delete_project: { scope: 'directory', level: 'write' },
  create_team_ask: { scope: 'directory', level: 'write' },
  update_ask: { scope: 'directory', level: 'write' },
  close_ask: { scope: 'directory', level: 'write' },
  delete_ask: { scope: 'directory', level: 'write' },
  update_project_ask: { scope: 'directory', level: 'write' },
  set_job_match_criteria: { scope: 'directory', level: 'write' },
  contact_suggested_candidate: { scope: 'directory', level: 'write' },
  mark_applicant_reviewed: { scope: 'directory', level: 'write' },
  mark_applicant_seen: { scope: 'directory', level: 'write' },

  submit_event: { scope: 'events', level: 'write' },
  update_my_event_rsvp: { scope: 'events', level: 'write' },
  request_event_presence: { scope: 'events', level: 'write' },

  upvote_team_news: { scope: 'news', level: 'write' },
  remove_team_news_upvote: { scope: 'news', level: 'write' },

  list_my_ai_apps: { scope: 'ai_apps', level: 'read' },
  list_ai_app_feedback: { scope: 'ai_apps', level: 'read' },
  update_ai_app_feedback_status: { scope: 'ai_apps', level: 'write' },
  redeploy_ai_app: { scope: 'ai_apps', level: 'write' },
  rename_ai_app: { scope: 'ai_apps', level: 'write' },
  update_ai_app_description: { scope: 'ai_apps', level: 'write' },
  delete_ai_app: { scope: 'ai_apps', level: 'write' },
  delete_ai_app_deployment: { scope: 'ai_apps', level: 'write' },
  update_ai_app_access: { scope: 'ai_apps', level: 'write' },
  update_ai_app_public_paths: { scope: 'ai_apps', level: 'write' },
  submit_ai_app_feedback: { scope: 'ai_apps', level: 'write' },

  regenerate_warm_intro: { scope: 'investors', level: 'write' },
  add_investor_to_list: { scope: 'investors', level: 'write' },
  remove_investor_from_list: { scope: 'investors', level: 'write' },
  submit_pathfinder_correction: { scope: 'investors', level: 'write' },
  resolve_pathfinder_crosswalk: { scope: 'investors', level: 'write' },
  clear_warm_path_refer: { scope: 'investors', level: 'write' },
  review_sourced_founder: { scope: 'investors', level: 'write' },
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
