import { mcpSettingsUrl } from './mcp.constants';
import { MCP_CALL_TYPE_LABEL, McpLimitDecision, mcpLimitWindowLabel } from './mcp-limits.config';

/** Contact reads count people. Other call types count tool calls. */
export function limitUnit(decision: Pick<McpLimitDecision, 'callType'>): string {
  if (decision.callType === 'contact_read') return 'member contact details';
  return `${MCP_CALL_TYPE_LABEL[decision.callType]} calls`;
}

/** Text added to a tool result the first time a member crosses the warning ratio in a window. */
export function limitWarningText(decision: McpLimitDecision): string {
  const window = mcpLimitWindowLabel(decision.callType);
  return (
    `Warning: this member has used ${decision.used} of ${decision.limit} ${limitUnit(decision)} ${window}. ` +
    `The limit resets at ${decision.resetsAt} UTC. Tell the member.`
  );
}

/** Text for a refused call. Names the limit and the reset time, and points the member at Settings. */
export function limitRefusalText(decision: McpLimitDecision): string {
  const settingsUrl = mcpSettingsUrl();
  if (decision.unavailable) {
    return (
      `LabOS couldn't check the ${MCP_CALL_TYPE_LABEL[decision.callType]} limit, so this call was refused. Try again later. ` +
      `Tell the member. Their limits are in Settings: ${settingsUrl}`
    );
  }
  const window = mcpLimitWindowLabel(decision.callType);
  return [
    `LabOS limits this member's agents to ${decision.limit} ${limitUnit(decision)} ${window}. ` +
      `${decision.used} of ${decision.limit} are used. The limit resets at ${decision.resetsAt} UTC. ` +
      `Tell the member which limit was hit and when it resets. Point them to their limits in Settings: ${settingsUrl}`,
    `callType: ${decision.callType}`,
    `used: ${decision.used}`,
    `limit: ${decision.limit}`,
    `resetsAt: ${decision.resetsAt}`,
  ].join('\n');
}

/** A contact-read page has more people than the member's remaining allowance. The page is not returned. */
export function contactPageRefusalText(decision: McpLimitDecision, contacts: number): string {
  const settingsUrl = mcpSettingsUrl();
  const remaining = Math.max(0, decision.limit - decision.used);
  return [
    `This response includes ${contacts} member contact details. ` +
      `${remaining} of ${decision.limit} remain this hour. ` +
      `LabOS did not return the page, so no contact details were sent. ` +
      `Read one member at a time with get_member. ` +
      `The limit resets at ${decision.resetsAt} UTC. Tell the member. ` +
      `Their limits are in Settings: ${settingsUrl}`,
    `callType: contact_read`,
    `contacts: ${contacts}`,
    `remaining: ${remaining}`,
    `limit: ${decision.limit}`,
    `resetsAt: ${decision.resetsAt}`,
  ].join('\n');
}
