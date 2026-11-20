# labos-agent Specification

## Purpose

The LabOS in-app agent (LAB-3272). In S1 (LAB-3298) a signed-in member asks the agent a question, or a follow-up about the news story they read. The agent answers through the AI search stream. In S2 (LAB-3299) the agent proposes profile, experience and team edits, and the member confirms each one. In S3 (LAB-3300) the agent writes an intro request draft. The member edits it and sends it with the existing intro API (C3). In S5 (LAB-3302) the agent reads the member, team, job or profile page. In S6 (LAB-3318) the member @mentions members, teams, news and pages: C4 searches the picker items and C1 takes a `mentions` list. Contract: `contracts/lab-3272-labos-agent-api.md` (C1, C2, C4, sections 8 to 10).

## Requirements

### Requirement: Signed-in members only

`POST /v1/labos-agent/chat`, `POST /v1/labos-agent/actions/confirm`, `GET /v1/labos-agent/access` and `GET /v1/labos-agent/mentions` SHALL use the `UserTokenValidation` guard. A request with no member token or a bad token SHALL get HTTP 401 from the guard.

#### Scenario: No token

- **GIVEN** a request with no member token
- **WHEN** it calls any of these routes
- **THEN** the response is HTTP 401

### Requirement: One pilot gate

The system SHALL decide access in one function, `LabosAgentAccessService.isEnabled`. Decision D1 option A (LAB-3344): staff and a pilot list see the agent, by RBAC. A token with no live member (unknown or deleted) SHALL never be enabled. When `ENVIRONMENT` is not `production`, the agent SHALL be on for every live member (the rule from before D1, kept for dev and previews). On production, the agent SHALL be on only for a member whose effective permissions (`AccessControlV2Service.hasPermission`, direct grants and policies) include `labos_agent.use`. There SHALL be no other staff rule: staff get the agent through the same permission. A failed permission lookup SHALL give "off".

Migration `20261119120000_add_labos_agent_use_permission` SHALL add the permission `labos_agent.use`. Migration `20261119120100_add_labos_agent_pilot_policy` SHALL add the policy `labos_agent_pilot`, which holds `labos_agent.use`. Both SHALL be idempotent and SHALL NOT change or delete rows. Admins SHALL grant access with the existing `POST /v1/admin/access-control-v2/assign-policy` (policy `labos_agent_pilot`) or `POST /v1/admin/access-control-v2/member-permissions` (permission `labos_agent.use`). A member without access SHALL get the same response as before D1 on production: `{ "enabled": false }` from the access check and HTTP 403 `AGENT_NOT_ENABLED` from the other routes.

#### Scenario: Production without access

- **GIVEN** `ENVIRONMENT` is `production`
- **AND** the member does not have `labos_agent.use`
- **WHEN** the member calls `POST /v1/labos-agent/chat` with a valid body
- **THEN** the response is HTTP 403 with code `AGENT_NOT_ENABLED`
- **AND** no stream starts

#### Scenario: Production with the pilot policy

- **GIVEN** `ENVIRONMENT` is `production`
- **AND** an admin assigned the policy `labos_agent_pilot` to the member, or granted `labos_agent.use` directly
- **WHEN** the member calls `GET /v1/labos-agent/access`
- **THEN** the response is `{ "enabled": true }`
- **AND** the chat routes run for the member

### Requirement: Access check

`GET /v1/labos-agent/access` SHALL return `{ "enabled": boolean }` from the pilot gate. It SHALL never return 403.

#### Scenario: Dev and production

- **GIVEN** a signed-in live member
- **WHEN** the member calls the access route on dev
- **THEN** the response is `{ "enabled": true }`
- **AND** on production the response is `{ "enabled": false }` for a member without `labos_agent.use`
- **AND** on production the response is `{ "enabled": true }` for a member with `labos_agent.use`

### Requirement: Validate the chat body

The chat body SHALL have `threadId` and `chatId` (1 to 64 characters), `message` (1 to 2000 characters after trim) and an optional `context`. `context.page` SHALL be `news-story`, `home`, `intro`, `member`, `team`, `job` or `profile`. `context.newsUid` SHALL be present when `page` is `news-story`. `context.introTarget` (`type` `member` or `team`, `uid` 1 to 64 characters) SHALL be present when `page` is `intro`, and SHALL NOT be present for other pages. `context.memberUid` (1 to 64 characters) SHALL be present when `page` is `member` and SHALL NOT be present for other pages. `context.teamUid` (1 to 64 characters) SHALL be present when `page` is `team` and SHALL NOT be present for other pages. `context.jobUid` (1 to 64 characters) is optional when `page` is `job` and SHALL NOT be present for other pages. `profile` has no id field. A body that fails these rules SHALL get HTTP 400 with code `VALIDATION_ERROR` before the stream starts.

#### Scenario: Blank message

- **GIVEN** a message of only spaces
- **WHEN** the member posts it
- **THEN** the response is HTTP 400 with code `VALIDATION_ERROR`

#### Scenario: Member page with no uid

- **GIVEN** `context.page` `member` with no `memberUid`
- **WHEN** the member posts it
- **THEN** the response is HTTP 400 with code `VALIDATION_ERROR` and the path `context.memberUid`

### Requirement: Story context

When `context.page` is `news-story`, the system SHALL load the story by `newsUid` before the stream starts. An unknown uid SHALL get HTTP 404 with code `NEWS_NOT_FOUND`. A found story SHALL go to every model call as page context (uid, title, summary, team, date), so "this story" means that item. When `context.page` is `home`, the page context SHALL say that the member is on Home.

#### Scenario: Unknown story

- **GIVEN** a `newsUid` that does not exist
- **WHEN** the member asks a question about it
- **THEN** the response is HTTP 404 with code `NEWS_NOT_FOUND`
- **AND** no stream starts

### Requirement: Reuse the AI search stream

The chat SHALL return the AI search stream of `POST /v1/husky/chat/contextual-tools`: the same headers, chunked JSON body, model settings (`HUSKY_SEARCH_*`), stall watchdog, one continuation and stalled notice. The body SHALL have `steps`, `content`, `sources`, `sourceRefs` (when there are any), `followUpQuestions`, `actions`, `proposals` and `drafts`. `proposals` SHALL hold the action proposals of the turn, or `[]`. `drafts` SHALL hold the intro draft of the turn, or `[]`. A hard error after the headers SHALL destroy the connection. The agent SHALL act as the signed-in member, with the AI search tools (including the news and web search tools) and the MCP tools `list_news`, `get_news_item`, `get_my_profile` and `list_my_experiences`. Each `list_news` and `get_news_item` result SHALL carry a `[NewsLink]` line per story, so the answer gets `sourceRefs` for those stories.

#### Scenario: Question about a story

- **GIVEN** an enabled member on a news story
- **WHEN** the member asks "What does this story mean?"
- **THEN** the response streams the answer about that story
- **AND** the final body has `proposals: []` when the agent made no proposal
- **AND** the final body has `drafts: []` when the agent made no draft

### Requirement: No writes in chat

The chat SHALL write nothing to the directory. Only C2 runs a write tool. The chat SHALL keep the thread summary in the AI search cache only and SHALL NOT write thread history or summaries to MongoDB.

#### Scenario: A finished turn

- **GIVEN** an enabled member
- **WHEN** a chat turn finishes
- **THEN** the cache has the thread summary
- **AND** MongoDB has no new thread document

#### Scenario: A proposal

- **GIVEN** an enabled member who asks the agent to change the bio
- **WHEN** the turn finishes
- **THEN** the body has one `update_my_profile` proposal
- **AND** the profile is not changed

### Requirement: Real permissions and the shared tool list

The agent SHALL get its MCP tools from `McpToolCatalog.forApp`, the same tool list as the MCP server. It SHALL use the member's effective RBAC permissions from `AccessControlV2Service.getMemberAccess`, the same as the MCP server. The admin MCP caps (`McpScopesService.adminCaps`) SHALL apply through `planTools`, the same step as the MCP server, in the chat (read and propose tools) and again in C2 confirm. Per-connection MCP scope levels SHALL NOT apply: the agent has no connection, so every scope starts at `write` and only the admin cap and the registry maximum limit it. When the admin caps cannot be read, the agent SHALL fail closed as the MCP server does: every scoped tool is hidden, so the chat has no LabOS tools and C2 confirm returns 403 `ACTION_NOT_ALLOWED`.

#### Scenario: Tool visibility

- **GIVEN** a member whose permissions hide a tool on the MCP server
- **WHEN** the member chats with the agent
- **THEN** the agent does not get that tool

#### Scenario: Admin sets profile to read

- **GIVEN** an admin set the `profile` scope to `read`
- **WHEN** the member chats with the agent
- **THEN** the agent gets `get_my_profile` and `list_my_experiences`
- **AND** the agent gets no `update_my_profile`, `add_experience` or `update_experience` proposal tool
- **AND** C2 confirm of an older profile proposal returns HTTP 403 `ACTION_NOT_ALLOWED` and writes nothing

#### Scenario: Admin caps cannot be read

- **GIVEN** the admin MCP caps cannot be read
- **WHEN** the member chats or confirms a proposal
- **THEN** the chat has no LabOS MCP tools
- **AND** C2 confirm returns HTTP 403 `ACTION_NOT_ALLOWED` and writes nothing

### Requirement: Propose-only tools

`update_my_profile`, `add_experience`, `update_experience` and `update_team` SHALL be propose only in the chat. A call SHALL check the arguments against the tool's own input schema and refuse unknown fields. It SHALL compute `changes` (`field`, `label`, `oldValue`, `newValue`) from the member's current data. It SHALL store the proposal in the cache with the member uid, tool, arguments and status `open`, under a `proposalId` that starts with `ap_`. The cache keys SHALL start with the `ENVIRONMENT` value (`<env>:labos-agent:`), as member proof keys do, so environments that share one Redis do not share proposals. The proposal SHALL be open for 15 minutes (`expiresAt`). The model SHALL get a short text, and the proposal SHALL go into the stream body `proposals`.

#### Scenario: Unknown field

- **GIVEN** an enabled member
- **WHEN** the model calls `update_my_profile` with `email`
- **THEN** the model gets a refusal text that names `email`
- **AND** no proposal is made

### Requirement: Team leads only

A member who is not a lead of the team, and is not a directory admin, SHALL get no `update_team` proposal. The model SHALL get a text that says the member cannot change the team.

#### Scenario: Not a lead

- **GIVEN** a member who is not a lead of team T
- **WHEN** the model calls `update_team` for team T
- **THEN** no proposal is made
- **AND** the model gets the text "cannot change the team"

### Requirement: C2 confirm

`POST /v1/labos-agent/actions/confirm` SHALL take `{ proposalId, decision }` with `decision` `confirm` or `cancel`. It SHALL use the same guard and pilot gate as the chat. Cancel SHALL close the proposal and write nothing. Confirm SHALL check the member's current permissions, the admin MCP caps and the lead status again, before it closes the proposal, then run the real MCP tool once with the stored arguments. A failed recheck SHALL leave the proposal open and SHALL NOT run the tool. Closing SHALL use one atomic cache delete, so two confirms run the tool once. The response SHALL be `{ proposalId, status, tool, summary, result }` with `status` `done` or `cancelled`.

#### Scenario: Confirm twice

- **GIVEN** an open proposal
- **WHEN** the member confirms it two times at once
- **THEN** one response is `status: "done"` with the tool result
- **AND** the other response is HTTP 409 `PROPOSAL_CLOSED`
- **AND** the tool runs one time

#### Scenario: Cancel and confirm at once

- **GIVEN** an open proposal
- **WHEN** the member sends cancel and confirm at the same time
- **THEN** exactly one request wins
- **AND** the tool runs at most one time
- **AND** the other request gets HTTP 409 `PROPOSAL_CLOSED` with the `status` of the winner

### Requirement: C2 errors

C2 SHALL return HTTP 400 `VALIDATION_ERROR` for a bad body, 403 `AGENT_NOT_ENABLED` outside the gate, 403 `ACTION_NOT_ALLOWED` when the member cannot do the action now, 404 `PROPOSAL_NOT_FOUND` for an unknown id or another member's proposal, 409 `PROPOSAL_CLOSED` for a confirmed, cancelled or failed proposal, 410 `PROPOSAL_EXPIRED` after 15 minutes, and 422 `ACTION_FAILED` with `message` when the tool refuses the values. The cache SHALL keep the proposal record for 24 hours, so 409 and 410 are different from 404. The 409 body SHALL have `status`: the stored status `done`, `cancelled` or `failed`, or `pending` when another request closed the proposal and its write has not finished.

#### Scenario: No longer a lead

- **GIVEN** an open `update_team` proposal
- **AND** the member is no longer a lead of the team
- **WHEN** the member confirms it
- **THEN** the response is HTTP 403 `ACTION_NOT_ALLOWED`
- **AND** the team is not changed
- **AND** the tool does not run and the proposal stays open

#### Scenario: Retry after a lost response

- **GIVEN** a proposal that C2 already confirmed
- **WHEN** the client sends confirm again
- **THEN** the response is HTTP 409 `PROPOSAL_CLOSED` with `status: "done"`

### Requirement: Error bodies keep the code

A C1 or C2 error body with a `code` SHALL reach the client as-is, with `statusCode`, `code`, `message` and its other fields (for example the 409 `status` and the 400 `errors`). `LabosAgentExceptionFilter`, scoped to the LabOS agent controller, does this (LAB-3300). The global `LogException` SHALL NOT change. An error with no `code` SHALL get the `LogException` body.

#### Scenario: Unknown intro target over HTTP

- **GIVEN** an intro target uid that does not exist
- **WHEN** the member posts a chat turn for it
- **THEN** the response body is `{ "statusCode": 404, "code": "INTRO_TARGET_NOT_FOUND", "message": "<text>" }`

### Requirement: Intro context

When `context.page` is `intro`, the system SHALL look up `context.introTarget` with the agent target lookup (`IntroRequestsService.findAgentTargetName`) before the stream starts. A member target SHALL be a member with no `deletedAt`, as in C3. A team target SHALL be a team whose status is not `INACTIVE`. A deleted (`INACTIVE`) team SHALL be unknown, as `GET /v1/teams/:uid` gives a non-admin 404 for it. C3 checks a team target with its own rule (`requireVisibleTeam`, LAB-3323), and a directory admin can still send to a deleted team there. An unknown target SHALL get HTTP 404 with code `INTRO_TARGET_NOT_FOUND`, and no stream starts. A found target (type, uid and the name from the database) SHALL go to the model as page context.

#### Scenario: Unknown intro target

- **GIVEN** an `introTarget` member uid that does not exist, or a deleted member
- **WHEN** the member opens the chat on the intro page
- **THEN** the response is HTTP 404 with code `INTRO_TARGET_NOT_FOUND`
- **AND** no stream starts

#### Scenario: Deleted team as intro target

- **GIVEN** an `introTarget` team uid of a team with status `INACTIVE`
- **WHEN** the member opens the chat on the intro page
- **THEN** the response is HTTP 404 with code `INTRO_TARGET_NOT_FOUND`
- **AND** no stream starts
- **AND** C3 for the same team uid does not change

### Requirement: Intro drafts

The chat SHALL have the agent tool `draft_intro` with the arguments `type` (`member` or `team`), `targetUid` and `text`. It SHALL NOT be an MCP tool and SHALL NOT be in `McpToolCatalog`, so the admin MCP caps do not apply to it. It SHALL write nothing: no `IntroRequest` row, no Telegram post and no cache entry. A call SHALL, in this order: refuse a `type` or `targetUid` that is not the `context.introTarget` of the turn; check the sender with the C3 rule (`IntroRequestsService.findEligibleRequester`, the same method as C3); load the target name with the agent target lookup (a deleted team is not found); trim `text` and refuse a length below 20 or above 3500. Then it SHALL put one draft in `drafts`: `draftId` (`dr_` and a UUID), `kind` `intro`, `target` (`type`, `uid`, `name` from the database), `text`, `minLength` 20, `maxLength` 3500 and `source` `agent`. A valid second call in the same turn SHALL replace the first draft. Each call SHALL first clear `drafts`. A refusal SHALL be a text for the model, and the turn SHALL have `drafts: []`, also when an earlier call made a draft. An unexpected error SHALL give the model a fixed text and SHALL go to the server log. The model SHALL NOT get the error message. The backend SHALL NOT store `source` or the draft.

#### Scenario: Eligible member

- **GIVEN** a member with a current role on a PL Portfolio team, on the intro page for member M
- **WHEN** the model calls `draft_intro` for M with a text of 20 to 3500 characters
- **THEN** the body has exactly one draft with `kind` `intro` and the target M with its name from the database
- **AND** no intro request is stored or posted

#### Scenario: Member who cannot send intros

- **GIVEN** a member with no current portfolio role and no PL Infra policy
- **WHEN** the model calls `draft_intro`
- **THEN** the body has `drafts: []`
- **AND** the model gets the text "The member cannot request intros. Only members of portfolio teams and PL Infra can. Make no draft. Tell the member this."

#### Scenario: Another target

- **GIVEN** a member on the intro page for member M
- **WHEN** the model calls `draft_intro` for another uid
- **THEN** the body has `drafts: []`

#### Scenario: Text out of limits

- **GIVEN** an eligible member on the intro page
- **WHEN** the model calls `draft_intro` with 10 or 3600 characters
- **THEN** the model gets a refusal with the limits 20 to 3500
- **AND** the body has `drafts: []`

#### Scenario: A refused second call

- **GIVEN** an eligible member on the intro page, and a first `draft_intro` call that made a draft
- **WHEN** the model calls `draft_intro` again and the call is refused
- **THEN** the body has `drafts: []`

#### Scenario: An unexpected error

- **GIVEN** an eligible member on the intro page
- **WHEN** a `draft_intro` call fails with an error
- **THEN** the model gets a fixed text that does not contain the error message
- **AND** the error goes to the server log
- **AND** the body has `drafts: []`

### Requirement: Page context for member, team, job and profile pages

When `context.page` is `member`, `team` or `job` with a `jobUid`, the system SHALL look up the page before the stream starts, after the pilot gate. A member outside the gate SHALL get HTTP 403 `AGENT_NOT_ENABLED` and no lookup SHALL run. The `member` page SHALL use a member with no `deletedAt` who is directory-visible (`directoryVisibleMemberWhere()` in `apps/web-api/src/members/member-visibility.ts`: approved, or `member.profile.visible` and not REJECTED); else HTTP 404 `MEMBER_NOT_FOUND`. The `team` page SHALL use the rule of `GET /v1/teams/:uid` (`TeamsService.assertTeamVisibleToViewer`); every case that hides the page (unknown, `INACTIVE` for a member who is not a directory admin, L0 for a member who is not a lead or admin) SHALL get HTTP 404 `TEAM_NOT_FOUND`, also where the GET gives 403. The `job` page SHALL use the rule of `GET /v1/job-openings/:uid` (`JobOpeningsQueryService.getJobOpening`); an unknown job, a hidden status or a job with no team SHALL get HTTP 404 `JOB_NOT_FOUND`. A job of an `INACTIVE` team SHALL show, as on the GET. `job` with no `jobUid` (the job board) and `profile` SHALL make no lookup. A `member` page with the session member's own uid SHALL be the `profile` page. The 404 body SHALL be `{ statusCode, code, message }`, and no model call SHALL run.

#### Scenario: Deleted member page

- **GIVEN** a `memberUid` of a member with `deletedAt` set
- **WHEN** the member asks on that page
- **THEN** the response is HTTP 404 with code `MEMBER_NOT_FOUND`
- **AND** no stream starts

#### Scenario: Member page of a member who is not directory-visible

- **GIVEN** a `memberUid` of a member who is not approved and does not have `member.profile.visible`
- **WHEN** the member asks on that page
- **THEN** the response is HTTP 404 with code `MEMBER_NOT_FOUND`
- **AND** no stream starts

#### Scenario: L0 team for a member who is not a lead

- **GIVEN** a team with access level L0 and a member who is not its lead or an admin
- **WHEN** the member asks on the team page
- **THEN** the response is HTTP 404 with code `TEAM_NOT_FOUND`, not 403

#### Scenario: Hidden job

- **GIVEN** a job with status `STALE`, or a job with no team
- **WHEN** the member asks on the job page
- **THEN** the response is HTTP 404 with code `JOB_NOT_FOUND`

#### Scenario: Own member page

- **GIVEN** a `member` page with the session member's own uid
- **WHEN** the member asks
- **THEN** the turn gets the `profile` context and no lookup runs

### Requirement: Public fields only in the page context

The page context SHALL hold one plain sentence and the JSON of the row, from the database and not from the body. The `member` context SHALL have only `uid`, `name`, `bio` (plain text, HTML removed, up to 1000 characters), `teams` (`uid`, `name`, `role` for each current role on a team that is not `INACTIVE`) and `skills` (names). The `team` context SHALL have `uid`, `name` and `shortDescription`. The `job` context SHALL have `uid`, `roleTitle`, `team` (`uid`, `name`), `roleCategory`, `seniority`, `location`, `workMode`, `department`, `postedDate`, `pay` (when present), `applyUrl` and `description` (plain text, up to 2000 characters). The job board context SHALL say to use `getJobOpenings`. The `profile` context SHALL have only the session member's `uid` and the hint to call `get_my_profile`. No context SHALL have an email, a phone, a social handle, Telegram, an office hours link, `jobReferEmail`, `interestedCount`, `viewerIsInterested` or a viewer-gated field.

#### Scenario: Member page with private fields

- **GIVEN** a member with an email, a Telegram handle and a Twitter handle
- **WHEN** another member asks on their page
- **THEN** the page context has none of these values

### Requirement: Intro target on member and team pages

On a `member` or `team` page, the page target SHALL also be the intro target of the turn, with the name from the agent target lookup (`IntroRequestsService.findAgentTargetName`). If the lookup gives no name (for example, a directory admin on an `INACTIVE` team), the turn SHALL have no intro target and no error. `draft_intro` SHALL keep all S3 steps. The `profile`, `job` and `home` pages SHALL have no intro target. Member and team mentions (S6) SHALL add more intro targets with the same lookup. `draft_intro` SHALL give a draft only for a target of the turn, and at most one draft for each turn.

#### Scenario: Draft on a team page

- **GIVEN** an eligible member on the page of team T
- **WHEN** the model calls `draft_intro` for T
- **THEN** the body has one draft with the target T
- **AND** a call for another uid gives `drafts: []`

### Requirement: C4 mention search

`GET /v1/labos-agent/mentions` SHALL check the pilot gate first; outside the gate it SHALL give HTTP 403 `AGENT_NOT_ENABLED` and run no search. The query SHALL have `q` (trimmed, up to 64 characters, default empty), `types` (a comma list of `member`, `team`, `news`; absent means all; empty or an unknown type gives 400) and `limit` (an integer from 1 to 10, default 5). A bad query SHALL get HTTP 400 `VALIDATION_ERROR`. The response SHALL always have `q`, `members`, `teams` and `news`, and each array SHALL have at most `limit` items. `members` SHALL have only directory-listed members with no `deletedAt`, never the session member, and only for a member with `member.search.read`. A member item SHALL have only `type`, `uid`, `name`, `imageUrl`, `teamName` and `role`. `teams` SHALL have no `INACTIVE` team and no L0 team, and only for a member with `team.search.read`. `news` SHALL have no item of a team in `TEAM_NEWS_EXCLUDED_TEAM_NAMES` and needs no search permission. The rank SHALL use the LAB-1277 tiers (`searchRelevanceScore` in `apps/web-api/src/members/member-search-relevance.ts`, shared with `MembersService.searchMembers`): on the member name (and current team names), on the team name (a tie sorts A to Z) and on the news title (a tie sorts the newest `eventDate` first). An empty `q` SHALL give no members, the member's current teams and the newest news. C4 SHALL call no model.

#### Scenario: Member without search permission

- **GIVEN** a member without `member.search.read`
- **WHEN** the member calls C4 with `q=ada`
- **THEN** `members` is `[]`
- **AND** `news` still has the matches

#### Scenario: Limit out of range

- **GIVEN** `limit=11`
- **WHEN** the member calls C4
- **THEN** the response is HTTP 400 with code `VALIDATION_ERROR`

### Requirement: Mentions in the chat body

The chat body SHALL take an optional top-level `mentions` list (next to `context`) of 1 to 5 items. An item SHALL be `{ type: 'member' | 'team' | 'news', uid }` (`uid` 1 to 64 characters) or `{ type: 'page', page: 'home' | 'job' | 'profile' }`, with no other key. Two items with the same key (`type` and `uid`, or `page`) SHALL give 400. More than 5 items SHALL give 400 `VALIDATION_ERROR` with the path `mentions`. A body with no `mentions` SHALL parse as before.

#### Scenario: Six mentions

- **GIVEN** a chat body with 6 mentions
- **WHEN** the member posts it
- **THEN** the response is HTTP 400 with code `VALIDATION_ERROR` and the path `mentions`

### Requirement: Mention lookups before the stream

After the pilot gate and the `context` lookup, the system SHALL look up each mention in order with the S5 page rules: a member who is unknown, deleted or not directory-visible gives 404 `MEMBER_NOT_FOUND`, a team the member cannot see gives 404 `TEAM_NOT_FOUND`, and an unknown story gives 404 `NEWS_NOT_FOUND`. A mention 404 body SHALL also have `mentionIndex` (the index in `mentions`); a `context` 404 SHALL have no `mentionIndex`. With a bad `context` and a bad mention, the 404 SHALL be for `context`. A member mention of another member SHALL need `member.search.read`, the C4 rule; without it the mention SHALL get 404 `MEMBER_NOT_FOUND` (not 403, so the answer does not tell that the member exists) and no member lookup SHALL run. Team, news and page mentions need no `member.search.read`. A member mention with the session member's uid SHALL be the `profile` item, with no lookup. A mention with the same key as `context` SHALL be used once. On any error, no model call SHALL run.

#### Scenario: Unknown member mention

- **GIVEN** a second mention with an unknown member uid
- **WHEN** the member posts the turn
- **THEN** the response is HTTP 404 with code `MEMBER_NOT_FOUND` and `mentionIndex` 1
- **AND** no stream starts

#### Scenario: Member mention without member.search.read

- **GIVEN** a member without `member.search.read`
- **AND** a second mention of another member who is directory-visible
- **WHEN** the member posts the turn
- **THEN** the response is HTTP 404 with code `MEMBER_NOT_FOUND` and `mentionIndex` 1
- **AND** no stream starts

### Requirement: What the agent sees

The prompt context SHALL have the S5 page text first, then one line `Item <n> (<type>): ...` for each mention in the order of `mentions`, with the same public fields as the S5 rows. A turn with no `context` and no `mentions` SHALL have only the no-page sentence (`NO_PAGE_SENTENCE`), so the model does not say that it read a page. The turn SHALL make one model call, as in S5. C1 and C4 SHALL call no notification, email, push or Telegram code.

#### Scenario: Three mentions

- **GIVEN** a turn with 3 mentions
- **WHEN** the member asks a question
- **THEN** the prompt has 3 item lines in the order of `mentions`
- **AND** no line has an email, a social handle or a Telegram value

### Requirement: Answer counts in the C1 body

The C1 stream body SHALL end with `toolCount`, `usedWebSearch` and `sourceCount` (LAB-3297, V0-R4). `toolCount` SHALL be the number of tool calls of the model in the turn, all tools, web search too. `usedWebSearch` SHALL be true when at least one `searchWeb` call ran. `sourceCount` SHALL be the number of distinct items in `sources` and `sourceRefs`: a page in both lists, or twice in one list, counts once. The fields SHALL hold counts and a boolean only, never text, names, emails or ids. The counts come from `HuskyAiService` option `turnFields`; AI search passes no `turnFields`, so its body does not change. `LabosAgentChatResponseSchema` in `libs/contracts` has the fields as optional, so a body without them still parses. The counts add no model call.

#### Scenario: Web search with sources

- **GIVEN** a turn where the model calls `list_news` and `searchWeb`
- **AND** the body has 1 news source ref, 1 web source ref and the same web URL in `sources`
- **WHEN** the stream ends
- **THEN** the body has `toolCount` 2, `usedWebSearch` true and `sourceCount` 2

#### Scenario: No tool call

- **GIVEN** a turn where the model calls no tool and the body has no sources
- **WHEN** the stream ends
- **THEN** the body has `toolCount` 0, `usedWebSearch` false and `sourceCount` 0

### Requirement: Web sources in the C1 body

The C1 `sources` SHALL hold only web pages outside LabOS that are not in `sourceRefs` (LAB-3362 D2). A source SHALL be dropped when it is the same page as the `externalUrl` or the `directoryLink` of a source ref. The same page means the same host (without `www.`), path (without a trailing slash) and query; the protocol and the fragment do not count, and a relative `directoryLink` resolves against the web app origin (`WEB_UI_BASE_URL`, else `APPLICATION_BASE_URL`). A source on a LabOS host SHALL be dropped: the web app origin, `os.pl.xyz`, `directory-portal*.os.pl.xyz`, `lab-*.os.pl.xyz` and `plnetwork.io` with its subdomains. A page SHALL be in `sources` once, and a value that is not an http(s) URL SHALL be dropped. The order SHALL stay. `sourceCount` SHALL count the `sources` that the body sends. `sourceRefs` SHALL NOT change. AI search keeps its own `sources`.

#### Scenario: News and team refs

- **GIVEN** a turn with a news ref `/?news=n-1` and a team ref with `externalUrl` `https://textile.io`
- **AND** the model `sources` are the LabOS page of the story, `https://www.textile.io/` and `https://filecoin.io/blog/post`
- **WHEN** the stream ends
- **THEN** `sources` is only `https://filecoin.io/blog/post`
- **AND** `sourceCount` is 3
