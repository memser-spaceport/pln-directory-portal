## Context

`McpController.handle` (`apps/web-api/src/mcp/mcp.controller.ts`) authenticates the bearer token on every request (`McpOAuthService.authenticateAccessToken`, which also stamps `lastUsedAt`). It then builds the catalog inline from five factories (`WHOAMI_TOOL`, `warmIntroTools`, `directoryTools`, `aiAppFeedbackTools`, `portfolioTools`), filters it with `toolsForPermissions(permissions, catalog, canWrite)`, and registers the survivors on a fresh stateless `McpServer`. The read/write gate is `MCP_WRITE_TOOLS` (6 names in `mcp.constants.ts`) plus `McpAuthorization.canWrite`, which is set at consent from `allowChanges` (LAB-2902, #3575). A filtered-out tool is simply missing, so the SDK answers "tool not found". `canWrite` also feeds `agentAccess` for AI-app sessions (`mcp-app-session.service.ts`) and `access` for member proofs (`mcp-member-proof.service.ts`).

Refresh grants expire after 30 days from consent or 7 idle days (`MCP_REFRESH_TOKEN_TTL_MS`, `MCP_REFRESH_TOKEN_IDLE_TTL_MS`, `refreshGrantExpired`). An expired grant is revoked on the client's next refresh attempt (`mcp-oauth` spec).

Only `directory_admin_pl_internal` and `pl_infra_team_pl_internal` hold `mcp.connect`, so the audience is small.

## Goals / Non-Goals

**Goals:**
- One registry that is the only source of tool → scope + level.
- Per-connection levels under per-scope admin maximums, enforced on list and call, effective on the next request.
- Refusals the agent can relay: a reason, plus a link to the exact setting.
- The data the `/settings/mcp` page needs (status, scopes with locks, one-call save, access request lookup).
- No behaviour regression for existing grants.

**Non-Goals:**
- New write tools (News write, Forum write) and throttling; these are follow-ups.
- The `news` tools themselves (a separate subtask in this change's Goal). The registry only reserves the scope.
- An admin UI, client account email, an activity log (LAB-2938), or who holds `mcp.connect`.
- Dropping `canWrite` (follow-up after one release).

## Decisions

**Registry module `mcp-scopes.registry.ts`.**
```ts
type McpScopeKey = 'search' | 'forum' | 'news' | 'directory' | 'events' | 'investors' | 'ai_apps';
type McpLevel = 'none' | 'read' | 'write';
const MCP_SCOPES: { key; label; defaultAdminMax: McpLevel }[]   // priority order
const MCP_TOOL_SCOPES: Record<toolName, { scope: McpScopeKey; level: 'read' | 'write' }>
```
Mapping:
- `search`: `search_members`, `search_teams`, `search_projects`, `search_events`.
- `directory` (label "Members, teams and projects"): `get_member`, `get_team`, `get_project`, `list_portfolio_teams`.
- `events`: `get_event`.
- `forum`: `search_forum_threads`, `get_forum_thread`.
- `investors`: all `mcp-tools.ts` master-profile and warm-intro tools, with level `write` for the five write tools.
- `ai_apps`: `list_my_ai_apps`, `list_ai_app_feedback` (read) and `update_ai_app_feedback_status` (write).
- `news`: added by the news subtask.

Write tools become exactly the entries whose level is `write`; `MCP_WRITE_TOOLS` is deleted. The registry's maximum for a scope is `write` if it has any write tool, otherwise `read`. A unit test fails if any catalog tool other than `whoami` is missing from the registry, which catches new tools added without review. *Alternative:* a `scope` field on `McpToolDef`. It was rejected because the reviewed list would be scattered across five files.

**Storage.**
- `McpAuthorization.scopeLevels Json @default("{}")` holds a `{ [scope]: level }` map, and a missing key means `read`. *Alternative:* a row per scope (`McpAuthorizationScope`). A connection always reads and writes its whole map at once, and the map is small, so JSON avoids N rows and joins. Keys are validated against the registry on write and ignored on read if unknown.
- `McpAuthorization.contactAckAt DateTime?`.
- `McpScopeSetting { scope String @id, maxLevel String, updatedByUid String?, updatedAt }`. A missing row means the registry default (the `RoadmapSettings`/`IrlGatheringPushConfig` pattern).
- `McpAccessRequest { uid, authorizationUid → McpAuthorization (cascade), scope, level, toolName, createdAt, resolvedAt? }` with `@@index([authorizationUid, scope, createdAt])`.

**Effective levels: `McpScopesService.resolve(authorization, memberPermissions)`.** For each scope, `effective = min(stored ?? 'read', adminMax)` and `maxLevel = min(registryMax, adminMax)`. `lock = 'admin'` when `adminMax < registryMax`. The service reads `McpScopeSetting` once per request; it has 7 rows and needs no cache. If that read throws, the controller fails closed (catalog = `[WHOAMI_TOOL]`, and every named call is refused with a generic message). `authenticateAccessToken` returns `scopeLevels` on the actor instead of `canWrite`.

**Listing vs refusal.**
- **Registered and runnable:** tools with `effective >= tool.level`.
- **Listed but refused:** write tools whose effective level is `read` and whose `maxLevel` is `write`. They're registered with a handler that returns the needs-write refusal, and their description is prefixed `[Needs write access — the member can allow it in LabOS]`.
- **Hidden:** tools at `none` or above the admin maximum.

To give hidden tools a meaningful error instead of "tool not found", the controller pre-reads the JSON-RPC body (single message or batch): for a `tools/call` naming a hidden registry tool, it answers that message itself with `{ isError: true, content: [text] }` and skips the SDK. Every refusal path goes through one `refuse(actor, tool, reason)` helper, which creates or reuses the access request, emits `mcp-tool-refused`, and formats the text. *Alternative:* registering every tool and checking inside the handler. That's simpler, but then `tools/list` would expose admin-off tools, which the Goal forbids.

**Refusal text.**
- needs write: `This needs write access to <Label> for this connection. Ask the member to allow it in LabOS: <WEB_UI_BASE_URL>/settings/mcp?request=<uid>`
- `none`: same wording with "read access".
- admin off: `<Label> is turned off by LabOS admins.`

**Access requests.** Reuse an open request (`resolvedAt` null, younger than 24h) for the same authorization + scope, raising the stored `level` if the new request needs more. A request is `expired` when it's more than 7 days old and unresolved. The status is computed and not stored. `PATCH …/scopes` with `requestUid` resolves it when the saved effective level is at least the requested level. Ownership is checked through the authorization's `memberUid` (404 otherwise).

**Endpoints** (`mcp-authorizations.controller.ts`, same guards: `UserAccessTokenValidateGuard` + `RbacGuard` + `mcp.connect`):
- `GET /v1/mcp/authorizations` → `{ items: McpConnection[] }`
- `PATCH /v1/mcp/authorizations/:uid/scopes` → `McpConnection`
- `GET /v1/mcp/access-requests/:uid` → `McpAccessRequest`
- Admin: a new `mcp-admin-scopes.controller.ts`, `@Controller('v1/admin/mcp/scopes') @UseGuards(AdminAuthGuard)`, with `GET` → `{ scopes: [{ key, label, registryMax, adminMax }] }` and `PUT { scopes: { [key]: level } }`.
- Zod schemas live in `libs/contracts/src/schema/mcp-scopes.ts` so the frontend can mirror them.

**Status.** `signin_expired` if `refreshGrantExpired(authorization)`, else `not_used` if `lastUsedAt` is null, else `active` if `now - lastUsedAt < 14d`, else `idle`. `refreshGrantExpired` moves to a shared pure helper used by both the OAuth service and the list.

**`ai_apps` drives agent access.** `agentAccess`/member-proof `access` = `write` iff the effective `ai_apps` level is `write`. These are the only consumers of `canWrite` besides tool filtering.

**Migration (one file).** ADD COLUMN `scopeLevels jsonb NOT NULL DEFAULT '{}'`, ADD COLUMN `contactAckAt`, CREATE TABLE ×2, then `UPDATE "McpAuthorization" SET "scopeLevels" = '{"investors":"write","ai_apps":"write"}' WHERE "canWrite" = true AND "revokedAt" IS NULL`. No admin seed rows: the registry defaults are all `write`/`read` maximums. Office hours has no tools yet, so it isn't a scope.

## Risks / Trade-offs

- [The "Idle" status is unreachable: any grant unused for 7 days is already `signin_expired`, so "idle after 14 days" never shows] → Keep the precedence (expired first) and raise it with Anuj. Either the badge thresholds or the refresh idle TTL changes.
- [Pre-parsing the JSON-RPC body duplicates a little SDK behaviour] → Only `tools/call` with a known hidden name is intercepted, and everything else passes through untouched. Covered by controller tests for single and batch bodies.
- [Listing write tools at read level adds noise to agents' tool lists] → Only scopes where the member can actually allow write are affected (`investors`, `ai_apps` today).
- [The JSON column isn't enforced by the DB] → Validated with zod against the registry on every write, and unknown keys are ignored on read.
- [Grants older than this change keep `canWrite`, which is now meaningless] → The backfill maps it, and the follow-up drops the column.

## Migration Plan

Deploy the backend with the migration. Behaviour stays equivalent for existing grants, and new grants start read only. The frontend consent copy (no "Make changes" checkbox) ships in the same release. The `/settings/mcp` page ships behind its flag. Rollback: revert the deploy. The new columns and tables are additive, and `canWrite` is untouched, so the old code keeps working.

## Open Questions

- Idle vs sign-in expiry thresholds (Anuj).
- Whether `none` scopes should list their tools too (currently hidden to keep agent context small).
