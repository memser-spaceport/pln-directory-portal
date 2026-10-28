## ADDED Requirements

### Requirement: Every MCP tool belongs to one scope
The MCP server SHALL define, in one code registry, each scope (key, label, priority order, default admin maximum level) and, for each tool, its scope and level (`read` or `write`). `whoami` SHALL be the only tool outside the registry's scopes, and it SHALL always be listed. A tool not in the registry SHALL NOT be listed or callable. Member RBAC visibility (investor DB, forum read) SHALL still apply on top of scopes.

#### Scenario: Unregistered tool is never exposed
- **WHEN** a tool definition exists in code but has no registry entry
- **THEN** no connection lists it and a call to it returns "tool not found"

#### Scenario: RBAC still applies
- **WHEN** a connection's `investors` level is `read` but the member lacks `investor_db.view`
- **THEN** no investor tools are listed

### Requirement: Each connection has its own scope levels
Each MCP authorization SHALL store one level per scope: `none`, `read` or `write`. A scope with no stored level SHALL behave as `read`, capped by the admin maximum. Changing one connection SHALL NOT change any other connection, including another connection of the same member to the same client.

#### Scenario: Two connections stay independent
- **WHEN** a member sets `forum` to `none` on connection A
- **THEN** connection B of the same member still lists the forum tools

### Requirement: New connections start read only
On consent approval, the server SHALL store `read` for every scope, or `none` where the admin maximum is `none`, whatever `allowChanges` the request sends. When the approve request sends `acknowledgedContactDetails: true`, the server SHALL store `contactAckAt` on the authorization.

#### Scenario: allowChanges is ignored
- **WHEN** a member approves a client with `allowChanges: true`
- **THEN** the new connection has no scope at `write` and lists no write tool as callable

#### Scenario: Contact acknowledgement is recorded
- **WHEN** a member approves with `acknowledgedContactDetails: true`
- **THEN** the authorization's `contactAckAt` is set to the approval time

### Requirement: Admins cap each scope for everyone
Admins SHALL be able to read and set a maximum level (`none`, `read`, `write`) per scope through `GET` and `PUT /v1/admin/mcp/scopes`, guarded by `AdminAuthGuard`. A scope with no stored setting SHALL use the registry default. The effective level of a connection's scope SHALL be the lower of its stored level and the admin maximum, evaluated on every MCP request, without reconnecting. Stored connection levels SHALL NOT be rewritten when an admin lowers a maximum.

#### Scenario: Admin turns a scope off
- **WHEN** an admin sets `forum` to `none`
- **THEN** on the next request no connection lists forum tools, and a call to `get_forum_thread` returns a refusal saying Forum is turned off by LabOS admins, with no link

#### Scenario: Admin restores a scope
- **WHEN** an admin raises `forum` back to `read` after lowering it to `none`
- **THEN** connections that had `forum` at `read` list the forum tools again

#### Scenario: Unknown scope or level
- **WHEN** an admin sends a scope key that isn't in the registry, or a level outside `none`/`read`/`write`
- **THEN** the request fails with 400 and nothing is stored

### Requirement: Tool listing and calls honour effective levels
For each request the server SHALL list a tool only when its scope's effective level is at least the tool's level, with one exception: a `write` tool SHALL also be listed when the connection's effective level is `read` and the scope's maximum for this member is `write`. That tool's description SHALL start with a note that it needs write access the member can allow in LabOS. Calls SHALL be checked again at execution time.

#### Scenario: Read level lists read tools only as callable
- **WHEN** a connection has `ai_apps` at `read` and admins allow `write`
- **THEN** `list_ai_app_feedback` is listed, `update_ai_app_feedback_status` is listed with the needs-write note, and calling it returns the needs-write refusal

#### Scenario: None hides the scope
- **WHEN** a connection has `search` at `none`
- **THEN** no search tool is listed, and a call to `search_members` returns a refusal naming Search with a link to `/settings/mcp?request=<id>`

#### Scenario: Toggle store unavailable
- **WHEN** scope settings can't be read for a request
- **THEN** the request fails closed: only `whoami` is listed and every other call is refused

### Requirement: Refusals explain themselves and link to the fix
A call refused for a member-fixable reason (`needs_write` or `scope_none`) SHALL return `isError` with text naming the scope and level needed, plus a link `<WEB_UI_BASE_URL>/settings/mcp?request=<id>`. A call refused because of the admin maximum SHALL say the feature is turned off by LabOS admins and SHALL have no link. Every refusal SHALL emit PostHog `mcp-tool-refused` with `toolName`, `scope`, `reason` (`needs_write`, `scope_none`, `admin_off`) and `authorizationUid`. The agent SHALL NOT be able to change levels through MCP.

#### Scenario: Needs-write refusal
- **WHEN** a read-level connection calls `submit_warm_path_note`
- **THEN** the result is an error that says it needs write on "Investors and warm intros" and contains a `/settings/mcp?request=` link, and nothing is written

### Requirement: Access requests carry a refusal to Settings
Each member-fixable refusal SHALL create an `McpAccessRequest` (authorization, scope, requested level, tool name), or reuse an open one for the same authorization and scope created within the last 24 hours. `GET /v1/mcp/access-requests/:uid` SHALL return `{ uid, authorizationUid, scope, level, toolName, status, createdAt }` only to the authorization's member, with status `open`, `resolved`, or `expired` (open for more than 7 days). Saving levels that meet the request through the connection's PATCH with that `requestUid` SHALL mark it resolved.

#### Scenario: Another member opens the link
- **WHEN** a member opens an access request that belongs to another member's connection
- **THEN** the response is 404

#### Scenario: Refusals in a loop
- **WHEN** an agent hits the same needs-write refusal ten times within an hour
- **THEN** one access request exists and every refusal links to it

#### Scenario: Request resolved by saving
- **WHEN** the member saves `forum: write` with the request's uid
- **THEN** the request becomes `resolved` and the next forum write call is allowed

### Requirement: The connection list carries status and scopes
`GET /v1/mcp/authorizations` SHALL return, for each active connection: `uid`, `clientName`, `connectedAt`, `lastUsedAt`, `status`, and `scopes` in registry order, each `{ key, label, level, maxLevel, lock }`. `level` SHALL be the effective level. `maxLevel` SHALL be the highest level the member may set. `lock` SHALL be `admin` when the admin maximum is lower than the registry maximum, otherwise `null`. Status SHALL be `signin_expired` when a refresh would be refused, otherwise `not_used` when never used, `active` when used within 14 days, else `idle`. Scopes with no tools SHALL be omitted.

#### Scenario: Admin-locked scope in the list
- **WHEN** admins cap `forum` at `read`
- **THEN** each connection's forum entry has `maxLevel: 'read'` and `lock: 'admin'`

#### Scenario: Expired sign-in
- **WHEN** a connection was last used 8 days ago
- **THEN** its status is `signin_expired`

### Requirement: Members save a connection's levels in one call
`PATCH /v1/mcp/authorizations/:uid/scopes` with `{ levels: { [scope]: level }, requestUid? }` SHALL save all given levels atomically for the caller's own active connection and return the updated connection item. It SHALL emit `mcp-scope-levels-updated` with the changed scopes and whether a request was resolved.

#### Scenario: Level above the maximum
- **WHEN** a member sends `forum: write` while admins cap `forum` at `read`
- **THEN** the request fails with 409 and none of the sent levels are stored

#### Scenario: Not the member's connection
- **WHEN** the uid is revoked, unknown, or another member's
- **THEN** the request fails with 404

#### Scenario: Bad body
- **WHEN** the body names an unknown scope or an invalid level
- **THEN** the request fails with 400 and nothing is stored

### Requirement: Existing grants keep working after migration
The migration SHALL set `investors` and `ai_apps` to `write` for authorizations with `canWrite = true`, and leave every other scope at the `read` default. AI-app agent sessions and member proofs SHALL take `agentAccess` / `access` from the connection's effective `ai_apps` level (`write` → `write`, otherwise `read`).

#### Scenario: A grant that allowed changes
- **WHEN** an authorization had `canWrite = true` before the migration
- **THEN** it can still call `update_ai_app_feedback_status` and `submit_warm_path_note`, and cannot call anything it couldn't call before
