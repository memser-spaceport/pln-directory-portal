import { AnalyticsService } from '../analytics/service/analytics.service';
import { ANALYTICS_EVENTS } from '../utils/constants';
import type { McpTokenActor } from './mcp-oauth.service';

const MCP_WRITE_TOOLS = new Set(['submit_warm_path_feedback', 'submit_warm_path_note']);

export type McpToolOperation = 'read' | 'write';

export function mcpToolOperation(toolName: string): McpToolOperation {
  return MCP_WRITE_TOOLS.has(toolName) ? 'write' : 'read';
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

function compact(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined));
}

export function errorKindOf(error: unknown): string {
  if (error instanceof Error && error.constructor?.name) {
    return error.constructor.name;
  }
  return 'Error';
}

export function buildMcpToolAnalyticsProperties(
  toolName: string,
  args: Record<string, unknown> = {},
  result?: Record<string, unknown> | null,
  error?: unknown
): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  switch (toolName) {
    case 'search_master_profiles':
      props.limit = numberProp(result?.limit) ?? numberProp(args.limit);
      props.offset = numberProp(result?.offset) ?? numberProp(args.offset);
      props.resultCount = countOf(result?.profiles);
      break;
    case 'search_warm_intro_investors':
      props.limit = numberProp(result?.limit) ?? numberProp(args.limit);
      props.offset = numberProp(result?.offset) ?? numberProp(args.offset);
      props.resultCount = countOf(result?.investors);
      if (typeof result?.total === 'number') {
        props.total = result.total;
      }
      break;
    case 'get_master_profile':
      props.uid = stringProp(args.uid);
      break;
    case 'get_warm_intro_investor':
      props.profileUid = stringProp(args.profileUid);
      props.pathCount = countOf(result?.paths);
      break;
    case 'get_warm_path_feedback':
    case 'get_warm_path_note':
      props.warmPathUid = stringProp(args.warmPathUid);
      props.connectorProfileUid = stringProp(args.connectorProfileUid);
      props.hasNote = typeof result?.note === 'string' && result.note.length > 0;
      break;
    case 'submit_warm_path_feedback':
    case 'submit_warm_path_note':
      props.warmPathUid = stringProp(args.warmPathUid);
      props.connectorProfileUid = stringProp(args.connectorProfileUid);
      props.isClear = args.note === null;
      break;
    default:
      break;
  }

  if (error !== undefined) {
    props.errorKind = errorKindOf(error);
  }

  return compact(props);
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
