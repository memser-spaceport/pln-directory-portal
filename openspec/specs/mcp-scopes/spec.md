# mcp-scopes Specification

## Purpose

MCP agents reach LabOS only through a reviewed allowlist. Every tool belongs to one scope; each MCP connection sets each scope to none, read or write; admins cap each scope for everyone. Refused calls tell the agent why and link the member to the exact setting.

## Requirements

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
`GET /v1/mcp/authorizations` SHALL return, for each active connection: `uid`, `clientName`, `connectedAt`, `lastUsedAt`, `status`, and `scopes` in registry order, each `{ key, label, level, maxLevel, registryMax, lock }`. `level` SHALL be the effective level. `maxLevel` SHALL be the highest level the member may set. `registryMax` SHALL be what the scope's tools allow before admin caps. `lock` SHALL be `admin` when the admin maximum is lower than the registry maximum, otherwise `null`. Status SHALL be `signin_expired` when a refresh would be refused, otherwise `not_used` when never used, `active` when used within 14 days, else `idle`. Scopes with no tools SHALL be omitted.

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

### Requirement: Agents read the news feed under the news scope

The MCP server SHALL offer `list_news` and `get_news_item` in the `news` scope at level `read`. `list_news` SHALL return compact rows `{ uid, title, summary, eventType, eventDate, teamUid, teamName, url }`, where `url` opens the story in LabOS, plus `{ feed, page, hasMore }`; it SHALL NOT return upvote or viewer fields. With `feed: latest` (the default) it SHALL return Home → Latest order for the given search, page and limit (at most 25). With `feed: for_you` it SHALL return the latest story for each of the member's For You teams, and SHALL return Latest with `feed: latest` when there are none. With `teamUid` it SHALL return only that team's news. `get_news_item` SHALL return one story with its source link, and an unknown uid SHALL be an error result.

#### Scenario: For You without picks

- **WHEN** a member with no For You teams calls `list_news` with `feed: for_you`
- **THEN** the result is the Latest feed and says `feed: latest`

#### Scenario: News scope off

- **WHEN** a connection has `news` at `none`
- **THEN** neither news tool is listed

### Requirement: Agents post team news and edit their own profile

The `news` scope SHALL also offer `post_team_news` at `write`, which posts news for one of the member's teams with the same checks as the team page (team member or directory admin, active team, safe link, no duplicate link for the team). A new `profile` scope ("Your profile") SHALL offer `get_my_profile` at `read` and `update_my_profile` at `write`. `update_my_profile` SHALL accept only bio, moreDetails, the social handles, officeHours, openToWork, jobSearchStatus and skills (existing skill titles), SHALL reject a call that names any other field without changing anything, and SHALL run the normal member post-update actions.

#### Scenario: Blocked profile field

- **WHEN** an agent calls `update_my_profile` with `bio` and `email`
- **THEN** the call fails, naming `email` as a field an agent can't change, and the profile is unchanged (the bio is not saved either)

#### Scenario: Posting for another team

- **WHEN** an agent posts news for a team the member does not belong to
- **THEN** the call fails and nothing is posted

### Requirement: Agents RSVP to events for the member

The `events` scope SHALL offer `rsvp_event` and `cancel_event_rsvp` at `write`. Both SHALL act only on the calling member's own guest record for one upcoming event, through the same guest service as the IRL gathering page, and SHALL require `irlg.going.write` or directory admin, like the page's RSVP routes. `rsvp_event` SHALL use the member's main team unless the agent names another of the member's teams, SHALL keep the member's own telegram and office hours, and SHALL change nothing when the member is already going. `cancel_event_rsvp` SHALL remove only that event's guest row and SHALL change nothing when the member is not going. Both SHALL refuse events that have ended or have no gathering; `rsvp_event` SHALL also refuse invite-only events unless the member is a directory admin or already a guest, as the event page hides them; and SHALL refuse any argument other than `eventUid` (and `teamUid` for `rsvp_event`) without writing.

#### Scenario: RSVP twice

- **WHEN** an agent calls `rsvp_event` for an upcoming event the member is already going to
- **THEN** the result says the member is already going and no guest row is added

#### Scenario: RSVP with attendance details

- **WHEN** an agent calls `rsvp_event` with `topics`
- **THEN** the call fails naming `topics`, and the member is not added

#### Scenario: Ended event

- **WHEN** an agent calls `rsvp_event` or `cancel_event_rsvp` for an event that has ended
- **THEN** the call fails and the guest list is unchanged

### Requirement: Agents edit teams and projects the member may edit

The `directory` scope SHALL offer `update_team` and `update_project` at `write`, with the same edit rights as the pages: a team lead or directory admin for a team; a member of the project's maintaining or a contributing team, its creator, or a directory admin for a project. `update_team` SHALL change only shortDescription, longDescription, website, blog, contactMethod, the social handles (twitter, linkedin, telegram, bluesky), officeHours and moreDetails. `update_project` SHALL change only tagline, description, readMe, lookingForFunding, tags and projectLinks (https links). Both SHALL reject a call that names any other field without changing anything, and SHALL leave the logo, name, tags/relations, focus areas, members, contributing teams and contributions untouched. Team updates SHALL run the normal team post-update actions and record the change against AI-enriched fields; project updates SHALL reset the project cache.

#### Scenario: Team member who is not a lead

- **WHEN** an agent calls `update_team` for a team where the member is not a lead (and not an admin)
- **THEN** the call fails and the team is unchanged

#### Scenario: Renaming a team

- **WHEN** an agent calls `update_team` with `name` and `blog`
- **THEN** the call fails naming `name`, and neither field is saved

#### Scenario: Partial project update

- **WHEN** an agent updates only a project's `tagline`
- **THEN** its contributing teams, contributions and focus areas are unchanged

### Requirement: Agents join and leave the member's teams and projects

The `profile` scope SHALL offer `join_team`, `leave_team`, `join_project` and `leave_project` at `write`. They SHALL change only the calling member's own team roles and project contributions, through the same service steps as the profile page's save, with the current list plus or minus one entry, so the member's other teams, roles and contributions are unchanged. There SHALL be no approval step, as in the UI. `join_team` SHALL accept an active team, an optional role and an optional `mainTeam`; it SHALL make the new role a non-lead and SHALL make it the main team when asked or when it is the member's first team. `join_project` SHALL accept a non-deleted project with optional role, description, startDate (default today) and endDate (none means current). Joining a team the member is already on, or a project with a current contribution, and leaving one the member is not on, SHALL change nothing. `leave_project` SHALL remove all of the member's contributions to that project. Each tool SHALL refuse any other argument without writing, and SHALL run the normal member post-update actions after a change.

#### Scenario: Joining a team

- **WHEN** an agent calls `join_team` for an active team the member is not on
- **THEN** the member is on the team as a non-lead, and their other teams and main team are unchanged

#### Scenario: Leaving a project

- **WHEN** an agent calls `leave_project` for one of the member's projects
- **THEN** the member's contributions to that project are removed and their other contributions are unchanged

#### Scenario: Making yourself a lead

- **WHEN** an agent calls `join_team` with `teamLead: true`
- **THEN** the call fails naming `teamLead`, and nothing changes

### Requirement: Agents manage the member's experience, follows, saved jobs and job alert

The `profile` scope SHALL also offer `list_my_experiences` and `get_my_job_alert` at `read`, and `add_experience`, `update_experience`, `delete_experience`, `follow_team`, `unfollow_team`, `save_job`, `unsave_job`, `set_job_alert` and `delete_job_alert` at `write`. Each SHALL act only on the calling member's own data, through the same service as the page. The experience tools SHALL change only experiences that belong to the member (any other uid is not found), SHALL accept only title, company, location, startDate, endDate and isCurrent, and SHALL require an end date for a role that is not current. `set_job_alert` SHALL create the member's alert or replace its filters, SHALL accept only filter values the job board currently offers (matched case-insensitively and stored in the board's spelling), and SHALL refuse an unknown value by naming it and the accepted values. Follow, save and delete calls SHALL change nothing when already in the requested state. Each tool SHALL refuse any other argument without writing.

#### Scenario: Another member's experience

- **WHEN** an agent calls `update_experience` or `delete_experience` with the uid of an experience of another member
- **THEN** the call fails as not found and the experience is unchanged

#### Scenario: Misspelt job alert filter

- **WHEN** an agent calls `set_job_alert` with a role category the board does not offer
- **THEN** the call fails naming the value and the accepted values, and no alert is saved

### Requirement: Agent writes are rate limited per member

Each write tool SHALL allow at most 10 calls per member per tool per hour. A call over the limit SHALL be refused with an error that names the limit, SHALL NOT run, SHALL NOT create an access request, and SHALL emit `mcp-tool-refused` with reason `rate_limited`. If the limit store is unavailable the call SHALL be allowed.

#### Scenario: Eleventh post in an hour

- **WHEN** a connection calls `post_team_news` an eleventh time within the hour
- **THEN** the call is refused with "LabOS limits agents to 10 post_team_news calls an hour. Try again later."
