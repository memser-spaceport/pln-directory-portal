import { McpScopeKey } from 'libs/contracts/src/schema/mcp-scopes';
import { McpToolDef } from './mcp-tools';
import { levelAtLeast, MCP_UNSCOPED_TOOLS, scopeLabel, toolScope } from './mcp-scopes.registry';
import { McpAdminCaps, McpStoredLevels, resolveScope } from './mcp-scopes.service';

/**
 * Why a call is refused (LAB-2995). `needs_write` and `scope_none` are member-fixable in Settings; `admin_off` is not;
 * `unavailable` means the scope settings could not be read, so everything scoped fails closed.
 */
export type McpRefusalReason = 'needs_write' | 'scope_none' | 'admin_off' | 'unavailable';

export type McpPlannedTool =
  /** Listed and runs. */
  | { tool: McpToolDef; mode: 'run' }
  /** Listed with a needs-write note; a call is refused. The member could raise the scope to write. */
  | { tool: McpToolDef; mode: 'listed_refused'; scope: McpScopeKey; reason: 'needs_write' }
  /** Not listed. A call by name is still answered with the refusal. */
  | { tool: McpToolDef; mode: 'hidden'; scope: McpScopeKey; reason: Exclude<McpRefusalReason, 'needs_write'> };

export const MCP_NEEDS_WRITE_NOTE = '[Needs write access: the member can allow it in LabOS]';

/**
 * Applies scope levels to the tools the member's RBAC already allows. `caps` is null when admin settings could not be
 * read. Tools missing from the registry are dropped entirely, so a call to one is "tool not found".
 */
export function planTools(tools: McpToolDef[], stored: McpStoredLevels, caps: McpAdminCaps | null): McpPlannedTool[] {
  const plan: McpPlannedTool[] = [];
  for (const tool of tools) {
    if (MCP_UNSCOPED_TOOLS.has(tool.name)) {
      plan.push({ tool, mode: 'run' });
      continue;
    }
    const entry = toolScope(tool.name);
    if (!entry) continue;
    if (!caps) {
      plan.push({ tool, mode: 'hidden', scope: entry.scope, reason: 'unavailable' });
      continue;
    }
    const state = resolveScope(stored, caps, entry.scope);
    if (levelAtLeast(state.level, entry.level)) {
      plan.push({ tool, mode: 'run' });
    } else if (entry.level === 'write' && state.level === 'read' && state.maxLevel === 'write') {
      plan.push({ tool, mode: 'listed_refused', scope: entry.scope, reason: 'needs_write' });
    } else {
      const reason = levelAtLeast(state.adminMax, entry.level) ? 'scope_none' : 'admin_off';
      plan.push({ tool, mode: 'hidden', scope: entry.scope, reason });
    }
  }
  return plan;
}

/** The text an agent gets back for a refused call. */
export function refusalText(reason: McpRefusalReason, scope: McpScopeKey, toolLevel: 'read' | 'write', settingsUrl: string) {
  const label = scopeLabel(scope);
  switch (reason) {
    case 'needs_write':
    case 'scope_none':
      return `This needs ${toolLevel} access to ${label} for this connection. Ask the member to allow it in LabOS: ${settingsUrl}`;
    case 'admin_off':
      return toolLevel === 'write'
        ? `Changes in ${label} are turned off by LabOS admins.`
        : `${label} is turned off by LabOS admins.`;
    case 'unavailable':
      return "LabOS couldn't check this connection's permissions. Try again later.";
  }
}

/** Tool names called by a JSON-RPC body (one message or a batch). */
export function calledToolNames(body: unknown): Set<string> {
  const names = new Set<string>();
  const messages = Array.isArray(body) ? body : [body];
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    const { method, params } = message as { method?: unknown; params?: { name?: unknown } };
    if (method === 'tools/call' && typeof params?.name === 'string') names.add(params.name);
  }
  return names;
}
