## Why

LAB-2995: the LabOS MCP server exposes every tool a member's RBAC allows, gated only by one connection-wide `canWrite` flag set at consent. Members can't choose what each agent connection reaches, admins can't switch a feature off for everyone, and a refused call looks like "tool not found", so the agent can't tell the member what to allow. The Goal asks for a reviewed allowlist: one scope per feature, each set to `none`, `read` or `write` per connection, under admin switches, with a refusal that links the member to the exact setting.

## What Changes

- A code registry maps every MCP tool to one scope and one level (`read` or `write`). A tool that isn't in the registry is never listed (default deny). `whoami` stays always on. This replaces the hand-kept `MCP_WRITE_TOOLS`.
- Scopes in priority order: `search`, `forum`, `news`, `directory`, `events`, `investors`, `ai_apps`. A scope with no tools is not returned. `news` gets tools in LAB-2995's news subtask.
- Every MCP connection stores its own level per scope. A new connection starts at `read` on every scope (or `none` where admins capped the scope at `none`). Consent no longer grants write: `allowChanges` is accepted and ignored. Consent stores `contactAckAt` when the member acknowledged contact-details exposure.
- Admins set a maximum level per scope for everyone (`none`/`read`/`write`) through admin endpoints. A missing row means the registry default. There is no admin UI in this change.
- `tools/list` and every call honour `min(connection level, admin max)`, re-read on every request. A write tool whose scope the member could raise to `write` stays listed, but calling it returns a "needs write" refusal with a link to `/settings/mcp?request=<id>`. Tools at `none` or admin-off are not listed. A call to one by name returns a clear refusal, and an admin-off refusal has no link.
- Refusals create or reuse an `McpAccessRequest`, which the member's Settings page reads. A request is valid for 7 days, is visible only to its owner, is reused within 24h for the same connection and scope, and is resolved when the member saves the requested level.
- `GET /v1/mcp/authorizations` returns each connection's `status` (`active` / `idle` / `not_used` / `signin_expired`) and its scopes with `level`, `maxLevel` and `lock`. A new `PATCH` saves all of a connection's levels in one call.
- **BREAKING (data):** `canWrite` stops driving behaviour. A migration turns `canWrite=true` into `write` on `investors` and `ai_apps`, the scopes that have write tools today. Everything else becomes `read`. AI-app agent sessions and member proofs take their read/write from the `ai_apps` level. The column stays for one release, then a follow-up drops it.
- PostHog: `mcp-tool-refused`, `mcp-scope-levels-updated`, `mcp-admin-scope-updated`.

## Capabilities

### New Capabilities
- `mcp-scopes`: the scope registry, per-connection levels, admin maximum levels, `tools/list` and call enforcement, refusals and access requests, the connection list's status and scope data, and the consent defaults.

### Modified Capabilities
<!-- mcp-oauth requirements (refresh expiry, revoke on expiry) are unchanged. -->

## Impact

- `apps/web-api/src/mcp/`: a new registry and scope service, an access-request service, changes to `mcp.controller.ts` (filtering and refusal), `mcp-authorizations.controller.ts` (list shape, PATCH, request GET), a new admin controller, `mcp-oauth.service.ts` (approve defaults and the actor's levels), and `mcp-app-session.service.ts`/`mcp-member-proof.service.ts` (`ai_apps` level).
- `prisma/schema.prisma` plus one migration: `McpAuthorization.scopeLevels Json`, `McpAuthorization.contactAckAt`, new `McpScopeSetting` and `McpAccessRequest`, and a backfill from `canWrite`.
- `libs/contracts`: new `mcp-scopes` schema, shared with the frontend (LAB-2997).
- Frontend (separate PRs): the `/settings/mcp` page and the read-only consent screen.
- Env: the refusal link uses `WEB_UI_BASE_URL`.
