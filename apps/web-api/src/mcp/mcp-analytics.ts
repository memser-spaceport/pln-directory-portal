import { AnalyticsService } from '../analytics/service/analytics.service';
import { ANALYTICS_EVENTS } from '../utils/constants';
import { isWriteTool, toolScope } from './mcp-scopes.registry';
import type { McpTokenActor } from './mcp-oauth.service';

export type McpToolOperation = 'read' | 'write';

export function mcpToolOperation(toolName: string): McpToolOperation {
  return isWriteTool(toolName) ? 'write' : 'read';
}

function stringProp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function numberProp(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

function countOf(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

function fieldCount(value: unknown): number | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return Object.keys(value).length;
}

function compact(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined));
}

export function errorKindOf(error: unknown): string {
  if (error instanceof Error && error.constructor?.name) {
    return error.constructor.name;
  }
  return 'Error';
}

type McpToolArgs = Record<string, unknown>;
type McpToolResult = Record<string, unknown> | null | undefined;
type McpToolPropertyBuilder = (args: McpToolArgs, result: McpToolResult) => Record<string, unknown>;

const QUERY_MAX = 200;

const none: McpToolPropertyBuilder = () => ({});

const FIELD_NAME_MAX = 64;
const FIELD_NAMES_MAX = 30;

/**
 * Names of the fields a write call sends, never their values (LAB-3050). Tools that keep unknown arguments pass the
 * agent's own key names through, so the names are capped in length and number.
 */
function fieldNames(args: McpToolArgs, idKeys: string[] = []): { fields: string[]; fieldCount: number } {
  const keys = Object.keys(args).filter((key) => !idKeys.includes(key) && args[key] !== undefined);
  const fields = keys
    .map((key) => key.slice(0, FIELD_NAME_MAX))
    .sort()
    .slice(0, FIELD_NAMES_MAX);
  return { fields, fieldCount: keys.length };
}

function fieldsOnly(...idKeys: string[]): McpToolPropertyBuilder {
  return (args) => {
    const props: Record<string, unknown> = {};
    for (const key of idKeys) props[key] = stringProp(args[key]);
    return { ...props, ...fieldNames(args, idKeys) };
  };
}

function uidsOnly(...keys: string[]): McpToolPropertyBuilder {
  return (args) => Object.fromEntries(keys.map((key) => [key, stringProp(args[key])]));
}

const directorySearch: McpToolPropertyBuilder = (args, result) => ({
  limit: numberProp(result?.limit) ?? numberProp(args.limit),
  resultCount: countOf(result?.results),
});

const warmPathRead: McpToolPropertyBuilder = (args, result) => ({
  warmPathUid: stringProp(args.warmPathUid),
  connectorProfileUid: stringProp(args.connectorProfileUid),
  hasNote: typeof result?.note === 'string' && result.note.length > 0,
});

const warmPathSubmit: McpToolPropertyBuilder = (args) => ({
  warmPathUid: stringProp(args.warmPathUid),
  connectorProfileUid: stringProp(args.connectorProfileUid),
  isClear: args.note === null,
});

const lockedFieldsUpdate: McpToolPropertyBuilder = (args) => ({
  uid: stringProp(args.uid),
  fieldCount: fieldCount(args.fields),
});

const getByUid = uidsOnly('uid');

/**
 * One property builder per MCP tool (LAB-3050): every tool in `MCP_TOOL_SCOPES` plus `whoami`. A spec fails when a
 * tool has no entry. Builders send ids, counts, filters and field names; never message text, bodies, notes or contact
 * details. Free-text search queries are added separately, by `MCP_TOOL_QUERY_ARGS`, on the per-tool event only.
 */
export const MCP_TOOL_PROPERTY_BUILDERS: Readonly<Record<string, McpToolPropertyBuilder>> = {
  whoami: none,

  search_members: directorySearch,
  search_teams: directorySearch,
  search_projects: directorySearch,
  search_events: directorySearch,

  search_forum_threads: directorySearch,
  get_forum_thread: getByUid,

  list_news: (args, result) => ({
    feed: stringProp(result?.feed) ?? stringProp(args.feed) ?? 'latest',
    teamUid: stringProp(args.teamUid),
    limit: numberProp(args.limit),
    page: numberProp(result?.page) ?? numberProp(args.page),
    resultCount: countOf(result?.items),
    hasMore: typeof result?.hasMore === 'boolean' ? result.hasMore : undefined,
  }),
  get_news_item: getByUid,
  post_team_news: (args, result) => {
    const posted = result?.posted as Record<string, unknown> | undefined;
    return {
      teamUid: stringProp(args.teamUid),
      newsUid: stringProp(posted?.uid),
      hasBody: Boolean(stringProp(args.body)),
    };
  },

  get_member: getByUid,
  get_team: getByUid,
  get_project: getByUid,
  list_portfolio_teams: (args, result) => ({
    hasQuery: Boolean(stringProp(args.q)),
    island: stringProp(args.island),
    limit: numberProp(result?.limit) ?? numberProp(args.limit),
    offset: numberProp(result?.offset) ?? numberProp(args.offset),
    resultCount: countOf(result?.teams),
    total: numberProp(result?.total),
  }),
  update_team: fieldsOnly('teamUid'),
  update_project: fieldsOnly('projectUid'),

  get_event: getByUid,
  rsvp_event: (args, result) => ({
    eventUid: stringProp(args.eventUid),
    teamUid: stringProp(args.teamUid),
    alreadyGoing: typeof result?.alreadyGoing === 'boolean' ? result.alreadyGoing : undefined,
  }),
  cancel_event_rsvp: (args, result) => ({
    eventUid: stringProp(args.eventUid),
    wasGoing: typeof result?.wasGoing === 'boolean' ? result.wasGoing : undefined,
  }),

  search_master_profiles: (args, result) => ({
    type: stringProp(args.type),
    limit: numberProp(result?.limit) ?? numberProp(args.limit),
    offset: numberProp(result?.offset) ?? numberProp(args.offset),
    resultCount: countOf(result?.profiles),
  }),
  get_master_profile: getByUid,
  search_warm_intro_investors: (args, result) => ({
    limit: numberProp(result?.limit) ?? numberProp(args.limit),
    offset: numberProp(result?.offset) ?? numberProp(args.offset),
    resultCount: countOf(result?.investors),
    total: numberProp(result?.total),
  }),
  get_warm_intro_investor: (args, result) => ({
    profileUid: stringProp(args.profileUid),
    pathCount: countOf(result?.paths),
  }),
  get_warm_path_feedback: warmPathRead,
  get_warm_path_note: warmPathRead,
  submit_warm_path_feedback: warmPathSubmit,
  submit_warm_path_note: warmPathSubmit,
  update_master_profile: lockedFieldsUpdate,
  update_connection_edge: lockedFieldsUpdate,
  update_warm_path: lockedFieldsUpdate,

  get_my_profile: none,
  update_my_profile: fieldsOnly(),
  join_team: (args) => ({
    teamUid: stringProp(args.teamUid),
    mainTeam: typeof args.mainTeam === 'boolean' ? args.mainTeam : undefined,
    hasRole: Boolean(stringProp(args.role)),
  }),
  leave_team: uidsOnly('teamUid'),
  join_project: fieldsOnly('projectUid'),
  leave_project: uidsOnly('projectUid'),
  list_my_experiences: (_args, result) => ({ resultCount: countOf(result?.experiences) }),
  add_experience: (args, result) => {
    const added = result?.added as Record<string, unknown> | undefined;
    return { experienceUid: stringProp(added?.uid), ...fieldNames(args) };
  },
  update_experience: fieldsOnly('experienceUid'),
  delete_experience: uidsOnly('experienceUid'),
  follow_team: uidsOnly('teamUid'),
  unfollow_team: uidsOnly('teamUid'),
  save_job: uidsOnly('jobUid'),
  unsave_job: uidsOnly('jobUid'),
  get_my_job_alert: none,
  set_job_alert: fieldsOnly(),
  delete_job_alert: none,
  get_my_email_preferences: none,
  update_email_preferences: fieldsOnly(),
  save_demo_day_team: uidsOnly('demoDay', 'teamUid'),
  unsave_demo_day_team: uidsOnly('demoDay', 'teamUid'),

  list_my_ai_apps: (_args, result) => ({ resultCount: countOf(result?.apps) }),
  list_ai_app_feedback: (args, result) => ({
    appUid: stringProp(args.appUid),
    status: stringProp(args.status),
    limit: numberProp(result?.limit) ?? numberProp(args.limit),
    offset: numberProp(result?.offset) ?? numberProp(args.offset),
    resultCount: countOf(result?.items),
    total: numberProp(result?.total),
  }),
  update_ai_app_feedback_status: (args) => ({
    appUid: stringProp(args.appUid),
    feedbackUid: stringProp(args.feedbackUid),
    status: stringProp(args.status),
    hasNote: Boolean(stringProp(args.note)),
  }),
  redeploy_ai_app: (args, result) => ({
    appUid: stringProp(args.appUid),
    deploymentId: stringProp(result?.deploymentId),
  }),
  rename_ai_app: fieldsOnly('appUid'),
  update_ai_app_description: fieldsOnly('appUid'),
};

/**
 * The free-text query argument of search and list tools, sent as `query` (trimmed to 200 characters) on the per-tool
 * event (LAB-3050). Investor DB searches are left out: their text is a person's name or email.
 */
export const MCP_TOOL_QUERY_ARGS: Readonly<Record<string, string>> = {
  search_members: 'q',
  search_teams: 'q',
  search_projects: 'q',
  search_events: 'q',
  search_forum_threads: 'q',
  list_news: 'search',
  list_portfolio_teams: 'q',
};

export function buildMcpToolAnalyticsProperties(
  toolName: string,
  args: Record<string, unknown> = {},
  result?: Record<string, unknown> | null,
  error?: unknown
): Record<string, unknown> {
  const builder = MCP_TOOL_PROPERTY_BUILDERS[toolName] ?? none;
  const props: Record<string, unknown> = { ...builder(args, result) };

  if (error !== undefined) {
    props.errorKind = errorKindOf(error);
  }

  return compact(props);
}

/** `search_members` -> `mcp-search-members-called` (LAB-3050). */
export function mcpToolCalledEventName(toolName: string): string {
  return `mcp-${toolName.replace(/_/g, '-')}-called`;
}

function queryProps(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
  const key = MCP_TOOL_QUERY_ARGS[toolName];
  const query = key ? stringProp(args[key]) : undefined;
  return query ? { query: query.slice(0, QUERY_MAX) } : {};
}

export type McpToolCallResult = 'ok' | 'refused' | 'error';

/**
 * Sends the per-tool event `mcp-<tool>-called` (LAB-3050) for a call that ran (`ok`), threw (`error`) or was refused
 * (`refused`). `mcp-tool-invoked` and `mcp-tool-refused` are sent as before, beside it.
 */
export function trackMcpToolCalled(
  analytics: AnalyticsService,
  actor: Pick<McpTokenActor, 'memberUid' | 'clientName' | 'authorizationUid'>,
  input: {
    toolName: string;
    result: McpToolCallResult;
    args?: Record<string, unknown>;
    output?: Record<string, unknown> | null;
    reason?: string;
    error?: unknown;
  }
): void {
  const args = input.args ?? {};
  const properties = compact({
    toolName: input.toolName,
    memberUid: actor.memberUid,
    authorizationUid: actor.authorizationUid,
    clientName: actor.clientName,
    scope: toolScope(input.toolName)?.scope ?? 'unscoped',
    operation: mcpToolOperation(input.toolName),
    result: input.result,
    reason: input.reason,
    // A refusal runs nothing, so it sends nothing from the arguments.
    ...(input.result === 'refused'
      ? {}
      : {
          ...buildMcpToolAnalyticsProperties(input.toolName, args, input.output, input.error),
          ...queryProps(input.toolName, args),
        }),
  });
  void analytics.trackEvent({
    name: mcpToolCalledEventName(input.toolName),
    distinctId: actor.memberUid,
    properties,
  });
}

export function trackMcpToolInvocation(
  analytics: AnalyticsService,
  actor: Pick<McpTokenActor, 'memberUid' | 'clientName' | 'authorizationUid'>,
  input: {
    toolName: string;
    args?: Record<string, unknown>;
    result?: Record<string, unknown> | null;
    success: boolean;
    isError: boolean;
    error?: unknown;
  }
): void {
  void analytics.trackEvent({
    name: ANALYTICS_EVENTS.MCP.TOOL_INVOKED,
    distinctId: actor.memberUid,
    properties: {
      toolName: input.toolName,
      operation: mcpToolOperation(input.toolName),
      success: input.success,
      isError: input.isError,
      memberUid: actor.memberUid,
      clientName: actor.clientName,
      authorizationUid: actor.authorizationUid,
      ...buildMcpToolAnalyticsProperties(input.toolName, input.args ?? {}, input.result, input.error),
    },
  });
}
