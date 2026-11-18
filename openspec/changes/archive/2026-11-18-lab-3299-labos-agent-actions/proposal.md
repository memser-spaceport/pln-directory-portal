## Why

Members want to change their profile, experience and team from the agent chat. Slice S2 (LAB-3299) of LAB-3272 adds action proposals in the chat and the C2 confirm route. Every write waits for the member's confirm (D2 option A). The contract is fixed in `contracts/lab-3272-labos-agent-api.md` (sections 3, 4 and 5).

## What Changes

- Prep: the MCP tool list moves from `mcp.controller.ts` into `McpToolCatalog` (`mcp-tool-catalog.ts`). The MCP server and the agent read the same list. The MCP server lists the same tools for each test role.
- The agent tools run with the member's effective RBAC permissions, the same as the MCP server.
- New read tools in chat: `get_my_profile`, `list_my_experiences`.
- `update_my_profile`, `add_experience`, `update_experience` and `update_team` are propose only in chat. A proposal goes into the cache for 15 minutes and into the stream body `proposals`.
- A member who is not a team lead gets no `update_team` proposal.
- New route `POST /v1/labos-agent/actions/confirm` (C2) runs the real MCP tool once after a confirm.

## Capabilities

### Modified Capabilities

- `labos-agent`: proposals in the chat, the C2 route and its errors.

## Impact

- **Code:** `apps/web-api/src/mcp/mcp-tool-catalog.ts` (new), `mcp.controller.ts`, `mcp.module.ts`, `apps/web-api/src/labos-agent/` (`labos-agent-proposals.ts` new), `libs/contracts/src/schema/labos-agent.ts`.
- **API:** new route `POST v1/labos-agent/actions/confirm`. New error codes `ACTION_NOT_ALLOWED`, `PROPOSAL_NOT_FOUND`, `PROPOSAL_CLOSED`, `PROPOSAL_EXPIRED`, `ACTION_FAILED`.
- **Database, config:** none. Proposals use the existing Redis cache. No migration, no new env var, no guard, RBAC or MCP scope change.
