import { mcpSettingsUrl } from './mcp.constants';
import { MCP_CALL_TYPE_LABEL, McpLimitDecision, mcpLimitWindowLabel } from './mcp-limits.config';

/** Text added to a tool result the first time a member crosses the warning ratio in a window. */
export function limitWarningText(decision: McpLimitDecision): string {
  const label = MCP_CALL_TYPE_LABEL[decision.callType];
  const window = mcpLimitWindowLabel(decision.callType);
  return (
    `Warning: this member has used ${decision.used} of ${decision.limit} ${label} calls ${window}. ` +
    `The limit resets at ${decision.resetsAt} UTC. Tell the member.`
  );
}

/** Text for a refused call. Names the limit and the reset time, and points the member at Settings. */
export function limitRefusalText(decision: McpLimitDecision): string {
  const label = MCP_CALL_TYPE_LABEL[decision.callType];
  const settingsUrl = mcpSettingsUrl();
  if (decision.unavailable) {
    return (
      `LabOS couldn't check the ${label} limit, so this call was refused. Try again later. ` +
      `Tell the member. Their limits are in Settings: ${settingsUrl}`
    );
  }
  const window = mcpLimitWindowLabel(decision.callType);
  return [
    `LabOS limits this member's agents to ${decision.limit} ${label} calls ${window}. ` +
      `${decision.used} of ${decision.limit} are used. The limit resets at ${decision.resetsAt} UTC. ` +
      `Tell the member which limit was hit and when it resets. Point them to their limits in Settings: ${settingsUrl}`,
    `callType: ${decision.callType}`,
    `used: ${decision.used}`,
    `limit: ${decision.limit}`,
    `resetsAt: ${decision.resetsAt}`,
  ].join('\n');
}
