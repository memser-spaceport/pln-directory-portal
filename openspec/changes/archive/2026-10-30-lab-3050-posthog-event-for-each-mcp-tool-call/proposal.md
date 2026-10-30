## Why

LAB-3050 (https://linear.app/protocollabs/issue/LAB-3050): the team cannot see which MCP agent actions members use. The MCP server sends `mcp-tool-invoked` (newer tools get no per-tool properties) and `mcp-tool-refused`, but no event per tool. The first ship goes to PL infra; the numbers decide what to open next.

## What Changes

- Each MCP tool sends its own server-side PostHog event `mcp-<tool name with dashes>-called` on every call: `result: ok`, `result: error` with `errorKind`, or `result: refused` with `reason`.
- Every per-tool event carries `toolName`, `memberUid`, `authorizationUid`, `clientName`, `scope`, `operation` and `result`.
- Search and list tools add their query text, trimmed to 200 characters, and their filters. Investor DB searches send no query text.
- Write tools send item ids, field names and counts only; never message text, bodies, notes or contact details.
- `mcp-tool-invoked` and `mcp-tool-refused` keep working as before.

Out of scope: new MCP tools (LAB-3047), frontend analytics events, changes to the refusal rules or the scopes.

## Capabilities

### New Capabilities

### Modified Capabilities

- `mcp-scopes`: refusals also send the per-tool event; a new requirement covers the per-tool events.

## Impact

- Server-side PostHog events for every MCP tool call; no change to what the agent sees.
- `docs/MCP_SCOPES.md` lists each event with its trigger.
