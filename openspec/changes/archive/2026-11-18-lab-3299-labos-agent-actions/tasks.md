## 1. Shared tool list (prep commit)

- [x] 1.1 Move the MCP tool list into `McpToolCatalog` and export it from `McpModule`.
- [x] 1.2 Test that each test role gets the same tool names as before the move.

## 2. Contract

- [x] 2.1 Add the C2 request schema, proposal and response types, and the C2 error codes.

## 3. Proposals and C2

- [x] 3.1 Resolve the member's RBAC permissions as the MCP server does. Take the tools from `McpToolCatalog`.
- [x] 3.2 Add the propose variants, the proposal store and the lead check (`labos-agent-proposals.ts`).
- [x] 3.3 Add `POST /v1/labos-agent/actions/confirm` with the C2 errors.
- [x] 3.4 Tests: no write before confirm, profile and experience proposals, no `update_team` proposal for a non-lead, 403, 404, 409, 410, 422, cancel, runs once.

## 4. Review fixes (PR #3741)

- [x] 4.1 Apply the admin MCP caps through `McpToolCatalog.forApp` (`planTools`) in the chat and in C2. Fail closed when the caps cannot be read. The MCP server uses `McpToolCatalog.plan`, with no behavior change.
- [x] 4.2 Add the stored `status` to the C2 409 `PROPOSAL_CLOSED` body.
- [x] 4.3 Prefix the proposal cache keys with `ENVIRONMENT`.
- [x] 4.4 Tests: confirm-time lead recheck (fails without it), cancel against confirm race, admin caps read and failure, 409 status.
