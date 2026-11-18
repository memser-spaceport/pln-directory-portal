## ADDED Requirements

### Requirement: Real permissions and the shared tool list

The agent SHALL get its MCP tools from `McpToolCatalog`, the same tool list as the MCP server. It SHALL use the member's effective RBAC permissions from `AccessControlV2Service.getMemberAccess`, the same as the MCP server. MCP connection scopes SHALL NOT apply.

#### Scenario: Tool visibility

- **GIVEN** a member whose permissions hide a tool on the MCP server
- **WHEN** the member chats with the agent
- **THEN** the agent does not get that tool

### Requirement: Propose-only tools

`update_my_profile`, `add_experience`, `update_experience` and `update_team` SHALL be propose only in the chat. A call SHALL check the arguments against the tool's own input schema and refuse unknown fields. It SHALL compute `changes` (`field`, `label`, `oldValue`, `newValue`) from the member's current data. It SHALL store the proposal in the cache with the member uid, tool, arguments and status `open`, under a `proposalId` that starts with `ap_`. The proposal SHALL be open for 15 minutes (`expiresAt`). The model SHALL get a short text, and the proposal SHALL go into the stream body `proposals`.

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

`POST /v1/labos-agent/actions/confirm` SHALL take `{ proposalId, decision }` with `decision` `confirm` or `cancel`. It SHALL use the same guard and pilot gate as the chat. Cancel SHALL close the proposal and write nothing. Confirm SHALL check the member's current permissions and lead status again, close the proposal, then run the real MCP tool once with the stored arguments. Closing SHALL use one atomic cache delete, so two confirms run the tool once. The response SHALL be `{ proposalId, status, tool, summary, result }` with `status` `done` or `cancelled`.

#### Scenario: Confirm twice

- **GIVEN** an open proposal
- **WHEN** the member confirms it two times at once
- **THEN** one response is `status: "done"` with the tool result
- **AND** the other response is HTTP 409 `PROPOSAL_CLOSED`
- **AND** the tool runs one time

### Requirement: C2 errors

C2 SHALL return HTTP 400 `VALIDATION_ERROR` for a bad body, 403 `AGENT_NOT_ENABLED` outside the gate, 403 `ACTION_NOT_ALLOWED` when the member cannot do the action now, 404 `PROPOSAL_NOT_FOUND` for an unknown id or another member's proposal, 409 `PROPOSAL_CLOSED` for a confirmed, cancelled or failed proposal, 410 `PROPOSAL_EXPIRED` after 15 minutes, and 422 `ACTION_FAILED` with `message` when the tool refuses the values. The cache SHALL keep the proposal record for 24 hours, so 409 and 410 are different from 404.

#### Scenario: No longer a lead

- **GIVEN** an open `update_team` proposal
- **AND** the member is no longer a lead of the team
- **WHEN** the member confirms it
- **THEN** the response is HTTP 403 `ACTION_NOT_ALLOWED`
- **AND** the team is not changed

## RENAMED Requirements

- FROM: `### Requirement: No writes in S1`
- TO: `### Requirement: No writes in chat`

## MODIFIED Requirements

### Requirement: Signed-in members only

`POST /v1/labos-agent/chat`, `POST /v1/labos-agent/actions/confirm` and `GET /v1/labos-agent/access` SHALL use the `UserTokenValidation` guard. A request with no member token or a bad token SHALL get HTTP 401 from the guard.

#### Scenario: No token

- **GIVEN** a request with no member token
- **WHEN** it calls any of these routes
- **THEN** the response is HTTP 401

### Requirement: Reuse the AI search stream

The chat SHALL return the AI search stream of `POST /v1/husky/chat/contextual-tools`: the same headers, chunked JSON body, model settings (`HUSKY_SEARCH_*`), stall watchdog, one continuation and stalled notice. The body SHALL have `steps`, `content`, `sources`, `sourceRefs` (when there are any), `followUpQuestions`, `actions` and `proposals`. `proposals` SHALL hold the action proposals of the turn, or `[]`. A hard error after the headers SHALL destroy the connection. The agent SHALL act as the signed-in member, with the AI search tools (including the news and web search tools) and the MCP tools `list_news`, `get_news_item`, `get_my_profile` and `list_my_experiences`. Each `list_news` and `get_news_item` result SHALL carry a `[NewsLink]` line per story, so the answer gets `sourceRefs` for those stories.

#### Scenario: Question about a story

- **GIVEN** an enabled member on a news story
- **WHEN** the member asks "What does this story mean?"
- **THEN** the response streams the answer about that story
- **AND** the final body has `proposals: []` when the agent made no proposal

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
