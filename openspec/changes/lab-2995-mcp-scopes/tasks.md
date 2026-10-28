## 1. Data and contract (BE-1)

- [ ] 1.1 Prisma: add `McpAuthorization.scopeLevels Json @default("{}")` and `contactAckAt DateTime?`, plus the `McpScopeSetting` and `McpAccessRequest` models
- [ ] 1.2 One migration: additive DDL plus the `canWrite = true` backfill to `{"investors":"write","ai_apps":"write"}` for unrevoked grants; check it against a local DB copy
- [ ] 1.3 `libs/contracts/src/schema/mcp-scopes.ts`: zod schemas for scope keys and levels, `McpConnection`, the PATCH body, `McpAccessRequest`, and the admin GET/PUT bodies

## 2. Registry and resolution (BE-1)

- [ ] 2.1 `mcp-scopes.registry.ts`: scopes in priority order with labels, and the tool → `{scope, level}` map for every current tool (see design); delete `MCP_WRITE_TOOLS`
- [ ] 2.2 Test: every catalog tool except `whoami` has a registry entry; registry max is `write` only for scopes with write tools
- [ ] 2.3 `McpScopesService`: read admin settings, `resolve()` effective level / maxLevel / lock per scope, validate and save levels; fail closed when settings can't be read
- [ ] 2.4 Move `refreshGrantExpired` into a shared helper; add `connectionStatus()` (signin_expired > not_used > active within 14d > idle)

## 3. Enforcement in the MCP controller (BE-1)

- [ ] 3.1 `authenticateAccessToken` returns `scopeLevels` (and keeps `canWrite` only for the session/proof fallback until 3.5)
- [ ] 3.2 Replace `toolsForPermissions(…, canWrite)` with registry + RBAC + effective levels: runnable, listed-but-refused (needs-write note in description), hidden
- [ ] 3.3 `refuse()` helper: reason text with the link, `mcp-tool-refused` event; the listed-but-refused handler uses it
- [ ] 3.4 Pre-read the JSON-RPC body (single and batch) and answer `tools/call` for hidden registry tools with the `scope_none` / `admin_off` refusal
- [ ] 3.5 `agentAccess` (app sessions) and member-proof `access` derive from the `ai_apps` effective level
- [ ] 3.6 Controller tests: read-only connection, needs-write listing and refusal, `none`, admin off (listed nowhere, named call refused without a link), fail closed, batch body, `whoami` always present

## 4. Member and admin endpoints (BE-1)

- [ ] 4.1 `approve()`: store `read` levels (or `none` under an admin `none`), ignore `allowChanges`, store `contactAckAt` when `acknowledgedContactDetails` is true; update the DTO
- [ ] 4.2 `GET /v1/mcp/authorizations`: return `status` and `scopes[]` (`key`, `label`, `level`, `maxLevel`, `lock`), omitting scopes with no tools
- [ ] 4.3 `PATCH /v1/mcp/authorizations/:uid/scopes`: atomic save, 400/404/409, `mcp-scope-levels-updated`
- [ ] 4.4 `mcp-admin-scopes.controller.ts`: `GET`/`PUT /v1/admin/mcp/scopes` with `AdminAuthGuard`, 400 on unknown key or level, `mcp-admin-scope-updated`
- [ ] 4.5 Add the three events to `ANALYTICS_EVENTS.MCP`
- [ ] 4.6 Tests for each endpoint, including two connections of one member staying independent and a lowered admin max not rewriting stored levels

## 5. Access requests (BE-2)

- [ ] 5.1 `McpAccessRequestsService`: create or reuse within 24h for the same authorization and scope (raise the level if needed), computed status (`open`/`resolved`/`expired` after 7 days)
- [ ] 5.2 `refuse()` creates or reuses the request for `needs_write` and `scope_none`, and puts `<WEB_UI_BASE_URL>/settings/mcp?request=<uid>` in the text
- [ ] 5.3 `GET /v1/mcp/access-requests/:uid`, owner only (404 otherwise)
- [ ] 5.4 PATCH `…/scopes` with `requestUid` resolves the request when the saved level meets it
- [ ] 5.5 Tests: loop dedupe, ownership, expiry, resolve on save, no request for `admin_off`

## 6. Docs and spec

- [ ] 6.1 Update `docs/AI_APPS.md` (or the MCP section) with scopes, levels, and the refusal format
- [ ] 6.2 Archive this change in the last subtask PR so `openspec/specs/mcp-scopes/spec.md` lands with the code
