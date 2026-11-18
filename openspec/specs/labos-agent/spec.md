# labos-agent Specification

## Purpose

The LabOS in-app agent (LAB-3272). In S1 (LAB-3298) a signed-in member asks the agent a question, or a follow-up about the news story they read. The agent answers through the AI search stream. In S2 (LAB-3299) the agent proposes profile, experience and team edits, and the member confirms each one. In S3 (LAB-3300) the agent writes an intro request draft. The member edits it and sends it with the existing intro API (C3). Contract: `contracts/lab-3272-labos-agent-api.md` (C1, C2, section 8).

## Requirements

### Requirement: Signed-in members only

`POST /v1/labos-agent/chat`, `POST /v1/labos-agent/actions/confirm` and `GET /v1/labos-agent/access` SHALL use the `UserTokenValidation` guard. A request with no member token or a bad token SHALL get HTTP 401 from the guard.

#### Scenario: No token

- **GIVEN** a request with no member token
- **WHEN** it calls any of these routes
- **THEN** the response is HTTP 401

### Requirement: One pilot gate

The system SHALL decide access in one function, `LabosAgentAccessService.isEnabled`. Until decision D1 (who sees the agent), the agent SHALL be on for every live member when `ENVIRONMENT` is not `production`, and off on production. A token with no live member (unknown or deleted) SHALL never be enabled.

#### Scenario: Production

- **GIVEN** `ENVIRONMENT` is `production`
- **WHEN** a signed-in member calls `POST /v1/labos-agent/chat` with a valid body
- **THEN** the response is HTTP 403 with code `AGENT_NOT_ENABLED`
- **AND** no stream starts

### Requirement: Access check

`GET /v1/labos-agent/access` SHALL return `{ "enabled": boolean }` from the pilot gate. It SHALL never return 403.

#### Scenario: Dev and production

- **GIVEN** a signed-in live member
- **WHEN** the member calls the access route on dev
- **THEN** the response is `{ "enabled": true }`
- **AND** on production the response is `{ "enabled": false }`

### Requirement: Validate the chat body

The chat body SHALL have `threadId` and `chatId` (1 to 64 characters), `message` (1 to 2000 characters after trim) and an optional `context`. `context.page` SHALL be `news-story`, `home` or `intro`. `context.newsUid` SHALL be present when `page` is `news-story`. `context.introTarget` (`type` `member` or `team`, `uid` 1 to 64 characters) SHALL be present when `page` is `intro`, and SHALL NOT be present for other pages. A body that fails these rules SHALL get HTTP 400 with code `VALIDATION_ERROR` before the stream starts.

#### Scenario: Blank message

- **GIVEN** a message of only spaces
- **WHEN** the member posts it
- **THEN** the response is HTTP 400 with code `VALIDATION_ERROR`

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

### Requirement: Intro context

When `context.page` is `intro`, the system SHALL look up `context.introTarget` with the agent target lookup (`IntroRequestsService.findAgentTargetName`) before the stream starts. A member target SHALL be a member with no `deletedAt`, as in C3. A team target SHALL be a team whose status is not `INACTIVE`. A deleted (`INACTIVE`) team SHALL be unknown, as `GET /v1/teams/:uid` gives a non-admin 404 for it. C3 (`findTargetName`) SHALL NOT change: it still accepts any team uid. An unknown target SHALL get HTTP 404 with code `INTRO_TARGET_NOT_FOUND`, and no stream starts. A found target (type, uid and the name from the database) SHALL go to the model as page context.

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
