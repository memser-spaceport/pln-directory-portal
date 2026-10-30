# MCP scopes (LAB-2995)

What an agent connected to LabOS over MCP may list and call. The rules are in `openspec/specs/mcp-scopes/spec.md`; this
page is the working map.

## Registry

`apps/web-api/src/mcp/mcp-scopes.registry.ts` is the reviewed allowlist. Every tool has one scope and one level (`read`
or `write`). A tool missing from it is never listed or callable (`whoami` aside), and a spec fails when a catalog tool
has no entry. Adding a tool to MCP means adding it there.

| Scope | Label | Tools | Write tools |
| --- | --- | --- | --- |
| `search` | Search | `search_members`, `search_teams`, `search_projects`, `search_events` | none |
| `forum` | Forum | `search_forum_threads`, `get_forum_thread` | none |
| `news` | News feed | `list_news` (feed `latest` = Home → Latest, `for_you` = one latest story per For You team, falls back to latest; `teamUid` = one team), `get_news_item` | `post_team_news` (team members / admins; duplicate link rejected) |
| `directory` | Members, teams and projects | `get_member`, `get_team`, `get_project`, `list_portfolio_teams` | none |
| `events` | Events | `get_event` | none |
| `investors` | Investors and warm intros | master-profile and warm-intro reads | `submit_warm_path_feedback`, `submit_warm_path_note`, `update_master_profile`, `update_connection_edge`, `update_warm_path` |
| `profile` | Your profile | `get_my_profile`, `list_my_experiences`, `get_my_job_alert` | `update_my_profile` (allowlist: bio, moreDetails, social handles, officeHours, openToWork, jobSearchStatus, skills); `join_team`, `leave_team`, `join_project`, `leave_project` (own teams and project contributions, as on the profile page); `add_experience`, `update_experience`, `delete_experience` (own entries only); `follow_team`, `unfollow_team`; `save_job`, `unsave_job`; `set_job_alert`, `delete_job_alert` (the member's one alert; filter values checked against the board's facets) |
| `ai_apps` | AI Apps | `list_my_ai_apps`, `list_ai_app_feedback` | `update_ai_app_feedback_status` |

Member RBAC still applies on top (investor DB tools need `investor_db.view` / `.edit`, forum tools `forum.read`).

## Levels

- **Per connection.** `McpAuthorization.scopeLevels` holds `{ [scope]: 'none' | 'read' | 'write' }`. A scope with no
  key is `read`. Consent stores `read` for every scope (or `none` where admins set `none`); `allowChanges` is ignored.
  Write is turned on later in Settings → MCP connections (`PATCH /v1/mcp/authorizations/:uid/scopes`).
- **Admin caps.** `McpScopeSetting` holds a maximum per scope for everyone; no row means not capped. Read and set with
  `GET` / `PUT /v1/admin/mcp/scopes` (`AdminAuthGuard`, body `{ scopes: { [scope]: level } }`). There is no admin UI yet.
- **Effective level** = the lower of the stored level, the admin cap, and what the scope's tools allow. Read on every
  MCP request, so a change applies to the next call without reconnecting. Lowering a cap does not rewrite stored levels.
- **AI-app sessions and member proofs** take `agentAccess` / `access` from the effective `ai_apps` level.

## What the agent sees

| Situation | `tools/list` | A call |
| --- | --- | --- |
| Effective level covers the tool | listed | runs |
| Write tool, connection at `read`, member may raise to `write` | listed, description starts `[Needs write access: …]` | `isError`: "This needs write access to <Label> for this connection. Ask the member to allow it in LabOS: <WEB_UI_BASE_URL>/settings/mcp?request=<uid>" |
| Connection set the scope to `none` | hidden | same refusal, "read access" (or "write access" for a write tool) |
| Admin cap below the tool's level | hidden | `isError`: "<Label> is turned off by LabOS admins." (write tools: "Changes in <Label> are turned off…"), no link |
| Scope settings can't be read | only `whoami` | `isError`: "LabOS couldn't check this connection's permissions. Try again later." |

A hidden tool is registered on the per-request server only when the request's JSON-RPC body names it in `tools/call`,
so it never appears in `tools/list`. Every refusal except the last sends PostHog `mcp-tool-refused` (`toolName`,
`scope`, `reason`: `needs_write`, `scope_none`, `admin_off`). Level saves send `mcp-scope-levels-updated`; admin changes
`mcp-admin-scope-updated`.

## Access requests

Each member-fixable refusal (`needs_write`, `scope_none`) creates an `McpAccessRequest` or reuses the open one for the
same connection and scope from the last 24 hours (a write refusal raises a read request to write). The refusal links to
`/settings/mcp?request=<uid>`. If the request can't be stored, the refusal still goes out with the plain link.
`admin_off` refusals get no request.

- `GET /v1/mcp/access-requests/:uid` (member guards, `mcp.connect`) returns
  `{ uid, authorizationUid, scope, level, toolName, status, createdAt }` to the connection's member only; anyone else
  gets 404. `status` is `open`, `resolved`, or `expired` (unresolved for 7 days).
- `PATCH /v1/mcp/authorizations/:uid/scopes` with `requestUid` resolves the request when the save reaches the
  requested level on that same connection. `mcp-scope-levels-updated` carries `viaRequest` and `requestResolved`.
- The table is also the "Blocked by permissions" record for the activity drawer (LAB-2938).

## Write limit

Every write tool allows 10 calls per member per tool per hour (`McpWriteLimitService`, a fixed-window counter in the
shared cache). Over the limit the call is refused with "LabOS limits agents to 10 <tool> calls an hour. Try again
later." and `mcp-tool-refused` reason `rate_limited`; no access request is created. If the cache is unavailable the
call is allowed.
