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

Each news item of `sourceRefs` SHALL have `directoryLink` `/?news=<uid>` (LAB-3362 D1), the Home page with the story open. This SHALL hold for the news of the agent tools and of the AI search news tool. The `[NewsLink]` marker in the tool results SHALL stay `/home?news=<uid>`, the same as the news tool JSON `url`, and MCP clients keep that url. So a `/home?news=` URL that the model cites or puts in `sources` SHALL fold into the one news ref and SHALL NOT come back as an extra `external` ref. The agent SHALL rewrite only the `sourceRefs`. AI search keeps its own links. The index, the title and the order of each ref SHALL NOT change, so the `[n]` citations still match.

#### Scenario: News source link

- **GIVEN** a turn where the AI search news tool returns a story with the link `/home?news=n-1`
- **WHEN** the stream ends
- **THEN** the news ref has `directoryLink` `/?news=n-1`
- **AND** `sourceCount` counts the story once when `list_news` also returns it

#### Scenario: Cited Home URL of a story

- **GIVEN** a `list_news` result for story n-1, and an answer that cites `https://<env>/home?news=n-1` and lists it in `sources`
- **WHEN** the stream ends
- **THEN** `sourceRefs` has one news ref for n-1 with `directoryLink` `/?news=n-1`
- **AND** no `external` ref for that URL

#### Scenario: Question about a story

- **GIVEN** an enabled member on a news story
- **WHEN** the member asks "What does this story mean?"
- **THEN** the response streams the answer about that story
- **AND** the final body has `proposals: []` when the agent made no proposal
- **AND** the final body has `drafts: []` when the agent made no draft

### Requirement: No writes in chat

The chat SHALL write nothing to the directory. Only C2 runs a write tool. The chat SHALL keep the thread summary, the latest reply (LAB-3367 h3), the kept intro target (B3) and the own claims (B4) in the AI search cache only and SHALL NOT write thread history or summaries to MongoDB.

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

### Requirement: Text parts around tool calls

The answer stream SHALL join the text before a tool call and the text after it with a blank line (`\n\n`), so markdown shows two paragraphs. A single `\n` is a soft break in markdown and renders as a space, so it is not enough. When the text already ends or starts with line breaks, the stream SHALL add only the missing ones. The stream SHALL NOT add a break between the deltas of one text part, or before the first text of the answer. The `content` in the final body SHALL match the streamed text. AI search uses the same stream and gets the same rule (LAB-3362 D3).

#### Scenario: Text after a tool call

- **GIVEN** the model writes "I will check your changes.", calls `get_my_profile`, then writes "Got your profile."
- **WHEN** the turn finishes
- **THEN** `content` is "I will check your changes.\n\nGot your profile."

#### Scenario: One text part in many deltas

- **GIVEN** the model streams "One " and "part." with no tool call between them
- **WHEN** the turn finishes
- **THEN** `content` is "One part."

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

### Requirement: Short answer with an intro draft

When the turn has a draft, the answer text SHALL be one short line: "Here is a draft intro. Edit it in the card, then send." The draft text SHALL be only in the draft card (`drafts[0].text`). The `draft_intro` description SHALL tell the model to call the tool before it writes the answer and not to write the draft text in the answer. The success text SHALL tell the model to write only that line. The server SHALL also enforce it: while `drafts` has a draft, the stream SHALL drop the model text (Husky `answerLine`). The stream SHALL add the line once, when the turn ends, and only when `drafts` still has a draft, so the line goes out only with a draft card. With the line on, a cut-off answer SHALL NOT be continued. When the line turns on, held text that is only `*` or `_` marks (for example `**` right before the `draft_intro` call) SHALL stream, and other held text SHALL be dropped (u4). When a refused call clears `drafts`, the model text SHALL stream again, so a refusal reaches the member, and the answer SHALL NOT have the line. The text before the tool call stays. The `content` in the final body and the thread summary SHALL match the streamed text. This adds no model call (LAB-3362 D4). In a turn with no draft, the answer SHALL NOT have the line (LAB-3367 F6): the stream SHALL remove the line from the model text (Husky `reservedReply`), also when it comes in more than one chunk. The stream SHALL hold back text that can start the line across the answer and its continuation. Text that only starts like the line SHALL stream after the last generation, before the stalled notice. The stream SHALL also remove the line with a curly apostrophe ("Here’s a draft intro. Edit it in the card, then send."), and each line in balanced bold (`**line**` or `__line__`), and SHALL keep all other text, also other bold or italic marks (t7b). It SHALL read the text from left to right and try the longest form first. When the text ends inside a form, the stream SHALL hold that end, so a bold line whose closing marks come in a later chunk or the continuation leaves no stray marks. Unbalanced marks around the line (for example `**line*`) stay in the text, and only the plain line is removed. The held text SHALL count as answer text for the cut-off check and the continuation (`partialAnswer`), and for the stalled check, and the continuation SHALL NOT repeat it (t7a). With `reservedReply`, the stream SHALL hold the first text that has no letter or digit (for example `**` or `. `) until text with a letter or digit comes, and then send them together (G3). Text with a letter or digit is not held. At the end, the held text SHALL go out only when the stream removed no line. A turn whose text is only the line, or has no letter or digit after the stream removed the line (for example `**line**!`), or is empty after a refused `draft_intro` call, SHALL send the fixed line "I did not change anything. Please say it again in other words." after the last flush, and SHALL store `''` as the latest reply (t1). This applies only with `reservedReply`, so AI search does not change.

G3 also applies to unbalanced marks. If the filter removes the reserved line and only marks remain, the stream uses the fixed fallback instead of those marks.

Known limit (v0): wording such as "clearer", "friendlier", "in Spanish" and "update" can get a model response without a draft card. The draft stays unchanged, and nothing is sent without Send. The post-v0 ticket is LAB-3423.

#### Scenario: Draft with text after the call

- **GIVEN** an eligible member on the intro page
- **WHEN** the model calls `draft_intro` and then writes the draft text again
- **THEN** the answer after the call is "Here is a draft intro. Edit it in the card, then send."
- **AND** the draft text is only in `drafts`

#### Scenario: Refusal

- **GIVEN** a member who cannot send intros
- **WHEN** the model calls `draft_intro` and writes the refusal
- **THEN** the answer shows the refusal text of the model

#### Scenario: A refused second call

- **GIVEN** a turn where a first `draft_intro` call made a draft
- **WHEN** a second call is refused and the model writes the refusal
- **THEN** the body has `drafts: []`
- **AND** the answer is the refusal text, with no "Here is a draft intro" line

### Requirement: Latest reply in C1

LAB-3367 h3 (contract 11.7 A). For each C1 turn, the agent SHALL keep the latest reply of the signed-in member in the thread under one cache key: `<ENVIRONMENT>:labos-agent:latest-reply:` (the env prefix of the proposal keys, `local` when unset) plus `JSON.stringify([memberUid, threadId])`. `memberUid` comes from the session, never from the body. The key SHALL NOT be the raw `threadId`, so another member with the same `threadId` gets another key. The key SHALL use the same cache and TTL as the Husky thread summary (`REDIS_CACHE_EXPIRY_IN_SECONDS`, default 24 hours). AI search SHALL NOT read or write this key, and its prompt SHALL NOT change.

1. Before the stream starts, Husky SHALL read the key. The answer call and continuation get the value under `Previous reply`. The structured tail does not get it. Use JSON text for a stored reply. If the reply is unknown, use `Previous reply: not available` with no quotes. The text `Previous reply: "not available"` is a stored answer, not the marker. When the stored reply is the fixed draft line, C1 SHALL send the bare words `Previous reply: an intro draft card`, with no quotes (Husky `reservedReplyLabel`, LAB-3367 G3). The stored value stays the line. AI search passes no label. When the turn asks again after a failed reply that is not known (rule 11, G7), the answer call SHALL have no `Previous reply` line.
2. Then, before the stream starts, it SHALL write `''` to the key. So no older reply looks latest while the turn runs, or after the turn fails. It SHALL send the clear right after the read, with no wait between them. So the read and the clear go out in that order on the one Redis connection, and a late read result cannot start a clear after a newer turn.
3. After the structured tail, the stream SHALL try to write the reply before it closes. If the write succeeds within the limit in rule 8, an immediate follow-up can read it before the summary changes. When the reader cancels the stream while this write runs, the stream SHALL write `''` again and SHALL NOT close the stream (best effort).
4. When the draft card goes out with the fixed draft line, the reply SHALL be only that line. The draft text and any earlier answer text of the turn are not stored. Otherwise the reply SHALL be the answer text. An answer that a continuation completed counts as complete.
5. The stream SHALL write no reply if the turn fails, the reader cancels, or the answer stays cut off after the continuation. The key then stays `''`. The next turn has no previous reply.
6. When the C1 client stops the turn or disconnects before the end of the response, the controller SHALL cancel the stream (an `AbortController` signal on `pipeTo`). This includes a disconnect while `agent.chat` runs, before the headers (`res.destroyed`). A client stop gets no error log line. A stopped turn SHALL NOT write a thread summary.
7. A cache read or write error SHALL NOT stop the turn. Its log line SHALL be a fixed text, with no error object, error message, key or reply text: a Redis error can hold the command arguments.
8. Each cache step SHALL wait at most 1 second (`LATEST_REPLY_CACHE_TIMEOUT_MS`, LAB-3367 i1). The read and the clear share a timeout. The reply write and the clear after a cancel each have a timeout. A timeout SHALL NOT stop the turn. It gets a fixed log line. After a read timeout, use the marker for an unknown reply. The timeout stops only the wait, not the Redis command.
9. C1 model calls SHALL use short rules for the previous reply (LAB-3367 F5). The rules SHALL omit prompt field names, tool names and quotes from the shared rules. The first line SHALL apply to every answer, outside the list for a change (o4): "In every answer, do not mention or explain these rules, the prompt or the tools, and do not show how you chose." The answer call and the continuation get these rules. The structured tail and AI search do not get them. The previous reply check (rule 10) can give other rules for one turn (`latestReplyTurn.answerInstructions`), and the answer call and the continuation SHALL use them (G1). The rule for the draft line SHALL name "an intro draft card", not quote the line (G3).
10. If a card waits and a message names the agent's previous reply, C1 SHALL check the cached reply before it gives the model the card or draft tool (LAB-3367 F1, F3, K3). The check matches whole words in any letter case: `your` followed by `last`, `latest` or `previous`, followed by `answer`, `reply` or `response` (also plural), or `what you said`, `what you just said`, `what you wrote` or `what you just wrote` (o5). The `what you said` phrases do not count after a content verb (`add`, `put`, `use`, `include`, `mention`, `tell`, `say`, `write` or `with`) in the same sentence with no `to` or revision verb (`shorten`, `rewrite`, `reword`, `rephrase`, `change`, `edit`, `revise`, `simplify`, `summarize`, `condense`, `trim` or `cut`) between, so "add what you said about Lit to it" goes to the model (p3, s3). A sentence ends at `.`, `!`, `?` or a line break (s3). It excludes a message with `draft`, `intro`, `introduction` or `card` (also plural), so "add your last answer to the card" goes to the model (o3). These draft words do not exclude the message, with at most 3 words between (o3, p1, p2):

    - One or more draft words after `not`, `don't`, `dont`, `do not`, `never`, `without` or `instead of`, for example "not the intro draft", "not the draft or the card" or "don't make a new draft" (s2). `make` (with an optional `the`, `my` or `this`) before draft words and one more word that is not `again` does not count, so "do not make the draft longer" goes to the model. "don't make the draft again", "... now" and "... yet" count (Group A).
    - One or more draft words after `keep` or `leave`, only at the end of the clause (s1): the end of the text, a line break, a punctuation mark, a bracket or a dash; before `alone`, `unchanged`, `untouched`, `intact`, `the same`, `like it`, `please`, `for now`, `as it`, `as is`, `as-is` or `as they` (t7b), also after `exactly`; or before an optional `and` or `but`, an optional `then`, an optional `please`, `just` or `only`, and a change verb for the answer (t5, Group A): `shorten`, `rewrite`, `reword`, `rephrase`, `revise`, `expand`, `simplify`, `summarize`, `condense`, `trim`, `cut`, `translate`, `redo`, or `make`, `change`, `edit` or `fix` followed by `your` (also `only your` or `just your`). `add` or `put` with `to your last answer`, or `remove` or `delete` with `of`, `from` or `in your last answer`, later in the same sentence, also end the clause (u3), for example "keep the draft and add a list to your last answer" and "keep the draft and remove the last line of your last answer". "keep the draft and add your last answer to it", "keep the draft and add a line from your last answer" and "keep the draft and make it match your last answer" stay on the draft path. Examples: "keep the intro card", "keep the draft and shorten your last answer", "(keep the draft)". "keep the intro short" and "keep the intro as short as it is" go to the model.

    If a card waits and the message starts with a change verb, then `this` or `the following` (optional `text`, `paragraph` or `message`), then a colon or a line break and a text, the pasted text is the text to change (review item 4). Examples: "shorten this: <text>", "rewrite the following text:" and a line break. The text after the colon SHALL have 4 words or more, the message SHALL NOT have a draft word, and the text SHALL NOT start with `add`, `remove`, `make`, `keep`, `mention`, `use`, `change` or `the name is` (t2), or with a small letter (u1). C1 SHALL then omit the card, the intro hints and `draft_intro`, with any cached reply, and SHALL NOT give the fixed clarification. "shorten this draft: ...", "edit this: add my PS to it", "fix this: the name is wrong, it is Grace", "rewrite this: more friendly", "edit this: please add my PS to the end", "rewrite this: say Monday and not Friday" and "fix this: there is a typo in the first line" stay on the draft path. A pasted text that starts with a small letter also stays on the draft path (accepted tradeoff, u1).

    Other requests, for example "make the draft shorter", "shorten the intro" and "make it shorter", use the prompt rules.

11. If the cached reply is a normal answer, C1 SHALL omit the card, the page and mention intro hints that name `draft_intro` (o1), and `draft_intro` from the tool list, also on the retry. If the reply is unknown or the fixed clarification and the message has a change word (for example shorten, rewrite, change, add, simpler, brief, concise, translate, redo, "in <n> sentences" or "too long"; not `update`, and not `cut` after `was` or `got` or before `off` or `short`, p4, F6), C1 SHALL return the fixed clarification without a model call (o3). A failure statement (`did not load`, `didn't load`, `was cut off`, `got cut off`, `failed` or `stopped`) asks for recovery, not a revision (t4). Then `simpler`, `brief`, `concise`, `translate`, `redo` and "in <n> sentences" are not change words, so "your last answer was cut off, tell me about Lit Protocol again in two sentences" goes to the model. With no change word, the turn goes to the model with no card, no intro hints and no draft tool. The fixed clarification SHALL tell how to change the draft, with no open question and no request for a pasted text (o2, review item 4): "I cannot tell which reply to change, so I changed nothing. To change the intro draft, say “make the draft shorter”." It SHALL leave the thread summary unchanged. If the reply is the fixed line from a draft turn, C1 SHALL retain the draft path, except when a `keep` or `leave` clause above keeps the draft (Group A): then C1 SHALL omit the card and `draft_intro`, so the draft cannot change. The same SHALL apply to `not`, `don't` or `never` with `make`, draft words and `now` or `yet` ("don't make the draft now"). Other negated draft words after the draft line ("not the intro draft", "don't make the draft again") still retain the draft path. A model answer that only echoes the draft line SHALL NOT count as a draft turn. If such a keep clause has a change word right after the draft line, for example "keep the draft and shorten your last answer", C1 SHALL return the fixed clarification with no model call, because the previous reply is the card (v1). If the keep clause has no change word and no failure statement, for example "keep the draft, what was your last answer about?", C1 SHALL return this fixed line with no model call: "My last answer was the intro draft in the card. I did not change it. To change it, say “make the draft shorter”." (Oleg final QA item 4).

    When the turn goes to the model with no card (LAB-3367 G1, G4, G7, w1, w2, w3):

    - Each of these turns, and each fixed answer above, SHALL have no `draft_intro`, no answer line, no card text and no intro hints.
    - The prompt context SHALL have the mention context, with no intro hints. It SHALL have the page context only when the message has "this" and one of team, member, story, job, page, company, org, organization, project, person, profile, article, role, position or opening (G1, w3), the text is not pasted (w2) and the page is not the intro page. The intro page context says that the member wants an intro, so it never goes to these turns.
    - When a card waits, the turn rules SHALL add this line: "An intro draft card is open in the chat. This request is not about it. Do not say that there is no draft." (G4).
    - For a pasted text, with or without a card, the turn rules SHALL add: "Change only the text after the colon in the question. Write only the changed text." (G1) and "Keep the words of the member in the text, also words such as "this team". Do not put a name in their place." (w2). The turn has no page context, also when the text has "this team".
    - For a change word and a known normal reply, the turn rules SHALL add: "Change only the text in Previous reply." (G1).
    - Recovery (G7, w1): the reply is unknown (`''`, the fixed clarification or the fixed recovery question), the message names the previous reply and has a failure statement, and the text is not pasted. This applies also when no card waits. The turn SHALL have no `Previous reply` line and no chat history in the answer, the continuation and the structured tail (Husky `omitHistory`). The turn rules SHALL add: "Your previous reply did not reach the member. Answer the message as a new question with the tools. If the message does not say what to answer, ask what to answer. Do not use an older request. When the message names a topic, answer only that topic. Do not write an intro draft." When the message has only recovery words (for example "your last answer failed, try again" or "... was cut off, continue"), C1 SHALL return this fixed line with no model call: "I do not know what you asked before, so I did not answer. Please tell me what to answer."

    These lines are fixed text, with no member or card text. The tools, the auth and the API do not change.

12. The C1 rules SHALL permit a change to an answer without a tool only when it adds no fact (LAB-3367 n1). If the request adds a fact, such as team size, the model SHALL use a tool result or state that it does not have the fact. This rule guides the model. It does not validate facts in the output.

Limits (best effort, no lock across requests):

- A normal answer can repeat text of the draft, and then the stored reply has that text (accepted risk).
- Two parallel turns of one member in one thread can race. The last write wins, and one turn can read a reply that is not the latest.
- A cache outage: if the `''` write at the start fails and the turn then fails or stops, or its own write also fails, the older reply can stay. If the second `''` write after a cancel fails, the reply of the cancelled turn can stay.
- A disconnect after `controller.close()`, while the last bytes are on the wire, keeps the stored reply.
- The stored reply has no length limit.
- A timed-out write can still land later. Commands of one app instance go in order on its one Redis connection, so a later turn of that instance sends its clear after it. Several app instances or connections have no order guarantee, so a late write from one instance can land after the clear of a newer turn on another instance.
- A cache write that times out can replace a newer reply or restore an older reply after Stop.
- After a timeout on the write, the stream closes, so an immediate next turn can read `''` or the reply, by the time of the write.

#### Scenario: Immediate follow-up

- **GIVEN** a finished agent turn with the answer A, and a thread summary that is not yet written
- **WHEN** the member sends the next C1 turn in the same thread
- **THEN** the answer prompt has `latestReply` A

#### Scenario: Draft turn, then a normal turn

- **GIVEN** a turn that gave a draft card with the fixed draft line
- **WHEN** the next turn reads the key
- **THEN** `latestReply` is only the draft line, with no draft text
- **AND** after a normal answer B, the next turn has `latestReply` B

#### Scenario: Failed, stopped or cut-off turn

- **WHEN** a turn fails, the client stops it, or its answer is still cut off after the continuation
- **THEN** the key is `''` and the next turn has no previous reply

#### Scenario: A last-answer request after the card is cancelled (F4)

- **GIVEN** a draft card that the member cancelled, then a normal answer B
- **WHEN** the member sends "Shorten your last answer." with no `introDraft`
- **THEN** the answer system message ends with `LAST_ANSWER_RULES`, and the answer prompt has `latestReply` B
- **AND** the rules tell the agent to change B and not to call `draft_intro`

#### Scenario: Another member, same thread ID

- **WHEN** two members use the same `threadId`
- **THEN** their latest reply keys are different

### Requirement: Current intro draft in C1

The C1 body MAY have `introDraft: { target: { type, uid }, text }` (contract change 4, section 11; LAB-3362). The object and its `target` SHALL be strict; `context.introTarget` does not change. `text` SHALL be 1 to 3500 characters after trim. A bad shape, an extra key, an empty text or a text over 3500 characters SHALL get the C1 400. `introDraft` is allowed with any `context.page` and with no `context`. An unknown or deleted target SHALL get 404 `INTRO_TARGET_NOT_FOUND` before the stream, with the lookup of the intro page (`findAgentTargetName`).

The backend SHALL give the model the card target and text only for this turn, except when the previous reply check omits the card. The agent SHALL use the text only when the member asks to change the draft. The rules for the previous reply take priority over the draft defaults (F1, F3, K3). The card prompt SHALL give that priority in one sentence without the other rules (k1). See "Latest reply in C1" for the code check and the prompt rules.

- **R2:** A brief request such as "make it shorter" SHALL revise the draft when the message does not name the last answer. This rule applies when the page or the items in the message point to a different target.
- **R3:** If the member asks for a different draft or asks to change other content, the agent SHALL NOT use the current draft text.
- **R4:** A member or team name in the revision SHALL be part of the text. It SHALL NOT change the target.
- **Q1:** The agent SHALL keep the facts of the current draft. The `draft_intro` description and the card prompt SHALL have this same rule for new drafts and revisions (Oleg, Q1 and s4): "In the draft text, facts about the member come only from the member’s messages or their LabOS profile (a tool result). When the member asks you to mention something about themselves, use their words. Do not add or strengthen experience, duration, results, roles, opinions, shared work or a vouch about the member from anywhere else. Facts about the target can come from the page or a tool." (t3). When `get_my_profile` or `list_my_experiences` is in the tool list of the turn, the `draft_intro` description SHALL name only those available tools as the way to read the member's own LabOS profile. When `get_my_profile` is there, the description SHALL also say "Call get_my_profile before the first draft." (G8). After the fact rule, the description and the card prompt SHALL have the same limits (`DRAFT_LIMITS_RULE`, G8): "When a fact is not given, leave it out. A short draft is correct." The draft SHALL use only the words of the member and the facts of their LabOS profile. It SHALL NOT add experience, work, skills, an intent or a reason that the member did not give. Knowing a member, a team or a project is not experience with it. It SHALL keep each concrete detail in the words of the member and SHALL NOT make it more general. For a new draft with no reason, the model SHALL make no draft and ask for the reason. For "make it more convincing", the model SHALL only reorder or reword the facts of the current text and add no new fact. Each intro hint (the intro page, a member or team page and a mention) SHALL have the same reason rule (`INTRO_REASON_RULE`): "If the member gave no reason for the intro, make no draft and ask the member for the reason." These are prompt rules, not an output check, except the B4 claim check below.
- **F2:** For a different member or team named without a valid target, the agent SHALL ask for an @mention and SHALL NOT call `draft_intro`. If the tool refuses a target outside the turn, it also asks for an @mention.
- **B2 (Oleg, 8fcac6ca QA):** A fact from an earlier message of the member SHALL count as the words of the member. The card prompt SHALL say: "A fact from an earlier message of the member in this chat is in the words of the member. When the member says "add that", keep that fact in the draft." When the whole message is a bare "add that" form (for example "add that to the draft" or "put it in the intro") and the latest reply is the draft line, C1 SHALL return this fixed line with no model call and no `draft_intro`, so the card does not change: "I did not change the draft. To add a new detail, write the detail in your message." The line SHALL NOT say what the draft has, because the draft can be without the fact (R2). "add that answer to the draft" keeps the draft path.
- **B4 (Oleg):** In a revision of the waiting card (the same target), `draft_intro` SHALL refuse a text with an experience claim (experience, expertise, hands-on, track record, seasoned, veteran, proven, well-versed, background in) that is not in the card text, the message or an own fact of the member. The refusal asks the model to write the draft again. An own fact is a claim sentence of an earlier message of the member in this thread, or a fact of their LabOS profile (`get_my_profile`, `list_my_experiences`, only when the turn has the tool). A draft part with a claim is allowed only when all its words, except filler words, are in ONE own fact. So "I have hands-on experience with IPFS" does not allow "experience in the grants space" or "ten years of experience with IPFS". C1 SHALL keep the claim sentences of the member's own messages (`ownClaims`: no question, no negation, not about another person; at most 20) under `<ENVIRONMENT>:labos-agent:own-claims:` plus `JSON.stringify([memberUid, threadId])`, for 24 hours. It SHALL NOT keep the agent text or the draft text there. Only a message with such a sentence writes the key. The check SHALL read the own facts only when the draft has a new claim. A failed read gives no facts, so the check refuses. A first draft and mild phrases do not change (post-v0).
- **B3 (Oleg), the strict choice (X2):** An intro request with a chip SHALL use only the chip as the intro target, with no intro hint of the page or of another chip, only when ALL of these are true (not on the `intro` page). (1) The message STARTS with the request, after at most "hi", "ok", "yes" or "please": "[Can you / Help me / I want to] draft (write, make, prepare, create, request) an intro to" or "introduce me / us to", and with a type word also "I want / need / would like an intro to". (2) The recipient comes right after "to": the @name of exactly one chip, or "this team" ("this company", "this member" and similar, also with the @name of the chip after it) that fits exactly one chip and not the page. (3) After the recipient comes only the end of the message (also "please"), or ONE sentence with the reason that starts with "because" or "about", or after a punctuation mark, a line break or a dash with "I / we want, need, would like". The reason names no chip, has no "@", and has no "both", "instead", "rather", "else", "other" or "another". (4) The message does not name the page: its name or first name, "this / that / the page", "this / that / the <page type>" ("the member", "the person", also "the other member"), and on a member page "she", "her", "hers", "he", "him" or "his". (5) The message has no negation and no second "intro to". Everything else is not clear. The rule SHALL NOT grow by wordings: a miss keeps the chip and the page, a wrong choice sends the intro to the wrong person. A chip that the message only mentions SHALL NOT replace the page target.
- **B3, an ask that is not clear (D1):** When the message asks for an intro with a chip, no chip is chosen and the page is not the recipient ("Draft an intro for @Acme", "an intro with @Acme", "Draft an intro" with a chip, "to someone at @Acme", "to the team", "I want an intro to @Acme", "Ask Grace to make an intro to @Kyle", "Draft an intro to @Acme. Actually the member", "Draft an intro to this team. I work at @Acme", "Connect me with this team"), the page and the chips SHALL be the targets of this turn and of the next turns, until a draft. The prompt SHALL NOT say that the member asked for an intro to that chip. It says that the chip or the page can be the recipient, and that the agent asks when it is not clear. Nothing is kept when the recipient is the page ("an intro to this company, @Kyle told me about it"), when the chip is the own team of the member by its name or "this" ("I work at @Acme", "I lead this team"), when the message has only a past form, and, with a waiting card, when the message has no request with a recipient.
- **B3, what is kept for the next turn (B7, retest 7):** After a turn, the service SHALL keep only the page (by being on it) and a chip chosen by the strict rule, plus the chips of an unclear ask when the member is on a page and the ask names no other recipient. On Home or with no page, an unclear ask SHALL keep nothing, as with no rule. An ask with a recipient that is not a chip or the page ("Draft an intro to Dana. @Kyle knows her") SHALL NOT keep the chip; the targets of that turn do not change.
- **B3, the kept targets (X1):** C1 SHALL keep the chosen chip, or the chips of an unclear ask (at most 3), for the same member and thread under `introTargetKey`: the types and uids, the page of the request (the `context` uids) and the `noPage`, `both` and `unclear` marks, no text and no name, with a 10-minute TTL (a write starts it again). Each later turn on that page SHALL use them, whatever the words of the message. A chosen chip is the only target, so `draft_intro` refuses the page target. The prompt SHALL say that the model makes no draft when the message is about something else. The chips of the message stay targets, and a new unclear ask adds its chips and the page. A question, "ok", "try again", a stopped turn, a failed turn and a turn with a refused draft SHALL keep them. They go when a turn ends with a draft, when a waiting card has one of them as its target, when the teams and members are not found, and after the TTL. With a card for another target, the kept targets and the card target are the targets, and a revision of that card keeps the kept targets.
- **B3, another recipient (R1):** The kept targets SHALL go when the recipient of a request is the page ("an intro to Grace instead", "to this member", "for her"): then the page is the target, as with no kept target. When the recipient is another name or "another team", when the message is a directory search ("find storage teams") or a cancel ("forget it", "no intro"), there SHALL be no kept or page target in this turn, so the agent makes no draft. In the next turns the kept targets and the page are the targets (D1). When the message names the page in another way ("Grace told me about them", "the member instead", "Not the team, the person", "Grace's team"), the page and the kept targets SHALL all be targets until a draft is made. On another page the kept targets SHALL NOT be used. Back on the page of the request, the page and the kept targets are the targets. When the page of the request was no intro target (Home, no page), they are also used with the page on a member or team page, but not on the `intro` page. While a target is kept, the page is never the only target unless a request names it or the member is on another page.
- **B3, B4 cache:** Each Redis step of the kept target and the own claims SHALL wait at most 1 second, the limit of the latest reply steps (`LATEST_REPLY_CACHE_TIMEOUT_MS`). A failure or a timeout SHALL NOT stop the turn and gets a fixed log line. A failure loses only the next turn; the chip still wins in its own turn. The steps are not atomic.

These rules add no target and do not force a `draft_intro` call. If a draft needs a reason and the member gave none, the model SHALL ask for the reason before it makes the draft. Only the Q1 rules are in the tool description. `draft_intro` SHALL accept the `introDraft` target as a target of the turn. It SHALL check the sender eligibility and the target again. The backend SHALL NOT store `introDraft` or write its text to a log line, error message or analytics event. The latest reply of a draft turn is only the fixed draft line.

A Husky catch and the C1 controller catch SHALL log only `{ name, statusCode, message }` of an error, not the error object. An AI SDK `APICallError` holds the whole prompt in `requestBodyValues`. When the stream fails after the headers, the controller SHALL destroy the connection with no error argument. For `AI_InvalidToolArgumentsError`, `AI_TypeValidationError` and `AI_JSONParseError`, the log SHALL have only `name` and `toolName` if it is a tool of that call. The Husky answer stream `error` part SHALL use the same log form.

#### Scenario: The chosen team stays the target (X1)

- **GIVEN** a member on the page of Grace who sent "Draft an intro to this team" with a chip for Acme Team, and the agent asked for the reason
- **WHEN** the member sends "ok" and then "I'm interested in their SDK" with no chip
- **THEN** only Acme Team is an intro target in both turns
- **AND** after a turn that ends with the draft for Acme Team, Grace is the target of the page again

#### Scenario: A chip that is only mentioned (X2)

- **GIVEN** a member on a team page
- **WHEN** the member sends "Draft an intro to this company, @Kyle Weiss told me about it" with a chip for Kyle Weiss
- **THEN** the page team is an intro target
- **AND** no target is kept

#### Scenario: A past intro is not a request (X2)

- **GIVEN** a member on a team page
- **WHEN** the member sends "Thanks for the intro to @Kyle Weiss. Now draft an intro to this team" with a chip for Kyle Weiss, and then the reason
- **THEN** only the page team is the intro target in the turn of the reason

#### Scenario: The recipient does not end its clause (X2)

- **GIVEN** a member on a team page
- **WHEN** the member sends "Draft an intro to the person in charge of grants, @Kyle Weiss sent me" with a chip for Kyle Weiss, and then the reason
- **THEN** the page team and Kyle Weiss are the intro targets in both turns
- **AND** the prompt does not say that the member asked for an intro to Kyle Weiss

#### Scenario: A correction in the same message (X2)

- **GIVEN** a member on a member page
- **WHEN** the member sends "Draft an intro to @Acme. Actually the member" with a chip for Acme, and then the reason
- **THEN** the page member and Acme are the intro targets in both turns
- **AND** the prompt does not say that the member asked for an intro to Acme

#### Scenario: A mentioned chip on Home is not kept (B7)

- **GIVEN** a member on the Home page
- **WHEN** the member sends "Draft an intro to Dana. @Juan knows her" with a chip for Juan, and then "I want feedback on our roadmap."
- **THEN** the reason turn has no intro target, and the prompt does not name Juan

#### Scenario: An ask that is not clear (D1)

- **GIVEN** a member on the page of Grace
- **WHEN** the member sends "Draft an intro for @Acme Team" with a chip for Acme Team, and then the reason with no chip
- **THEN** Acme Team and Grace are the intro targets in both turns
- **AND** the prompt does not say that the member asked for an intro to Acme Team

#### Scenario: Another recipient (R1)

- **GIVEN** a kept Acme Team on the page of Grace
- **WHEN** the member sends "an intro to Grace instead"
- **THEN** only Grace is the intro target, and the kept target is gone
- **AND** for "the member instead", Acme Team and Grace are the intro targets
- **AND** for "find storage teams" there is no intro target in the turn, and the next turn has Acme Team and Grace

#### Scenario: An own fact in a revision (B4)

- **GIVEN** a waiting card, and an earlier message "I have hands-on experience with IPFS." in the thread
- **WHEN** the member sends "add that to the draft" after a normal answer
- **THEN** `draft_intro` accepts the text with that sentence
- **AND** it refuses "I have hands-on experience in the grants space."

#### Scenario: Make it shorter

- **GIVEN** an eligible member with an intro card for Grace that waits in the chat
- **WHEN** the member sends "Make it shorter." with `introDraft` and no `context`
- **THEN** the prompt context has the card text
- **AND** a `draft_intro` call for Grace gives one draft in `drafts`, with the short intro line

#### Scenario: Brief revision next to another page target or an added item (R2)

- **GIVEN** an intro card that waits in the chat, on the intro page of another target or with an item added to the message for another member
- **WHEN** the member sends "Make it shorter." with `introDraft`
- **THEN** the prompt context tells the agent to revise this draft, also with that page or chip
- **AND** a `draft_intro` call for the card target gives one draft in `drafts`

#### Scenario: An edit that names a team (R4)

- **GIVEN** an intro card for Grace that waits in the chat
- **WHEN** the member sends "Mention that I know Acme Team."
- **THEN** the prompt context tells the agent that the name is new text and does not change the target
- **AND** a `draft_intro` call for Grace gives one draft in `drafts`

#### Scenario: A request for a different draft or other content instead (R3)

- **GIVEN** an intro card for Grace that waits in the chat, and a target of the turn for Acme Team (the page or an item added to the message)
- **WHEN** the member sends "Write the intro to Acme Team instead."
- **THEN** the prompt context tells the agent to follow that request and not to use the draft text
- **AND** a `draft_intro` call for Acme Team gives one draft, and the targets of the turn do not change

#### Scenario: Only the facts of the member (Q1)

- **GIVEN** an intro card that waits in the chat
- **WHEN** the member asks for a revision
- **THEN** the prompt context tells the agent to keep the facts of the current text
- **AND** it has the Q1 fact rule

#### Scenario: The member's own words in new drafts and revisions (Q1)

- **GIVEN** a new intro draft turn, or a team intro card that waits in the chat
- **WHEN** the member sends "mention that I know Lit Protocol"
- **THEN** the `draft_intro` description has the Q1 fact rule: facts about the member come only from the member's messages or their LabOS profile, in the member's words
- **AND** the agent does not add or strengthen experience, duration, results, roles, opinions, shared work or a vouch about the member from anywhere else

#### Scenario: Your last answer (F1)

- **GIVEN** an intro card that waits in the chat
- **WHEN** the member sends "Shorten your last answer."
- **THEN** C1 checks which reply to change before it gives the model the draft tool
- **AND** the turn returns a draft only after a successful `draft_intro` call

#### Scenario: A normal last answer wins over the draft (F1)

- **GIVEN** an intro card that waits in the chat, and `latestReply` is a normal answer
- **WHEN** the member sends "Shorten your last answer."
- **THEN** the answer model gets the normal reply and does not get the card text or `draft_intro`
- **AND** the turn returns no new draft card

#### Scenario: The latest reply is unknown (F3)

- **GIVEN** a stopped turn, so the key is `''`
- **WHEN** the member sends "Shorten your last answer." with an intro card
- **THEN** C1 returns the fixed clarification, which asks for the full request again, and no new draft card
- **AND** C1 calls no model or tool

#### Scenario: No change word after Stop (o3)

- **GIVEN** a stopped turn, so the key is `''`, and an intro card
- **WHEN** the member sends "Your last answer did not load. What is new in LabOS?"
- **THEN** the model answers with no card text, no intro hints and no `draft_intro`

#### Scenario: A negated draft word (o3)

- **GIVEN** an intro card and a normal previous reply
- **WHEN** the member sends "shorten your last answer, not the draft"
- **THEN** the turn has no card text, no intro hints and no `draft_intro`

#### Scenario: The previous answer as content of the card (o3)

- **GIVEN** an intro card and a normal previous reply
- **WHEN** the member sends "add your last answer to the card"
- **THEN** the turn keeps the draft path

#### Scenario: The member repeats a request after a clarification (K3)

- **GIVEN** C1 returned the fixed clarification with an intro card in the chat
- **WHEN** the member sends "Shorten your last answer." again
- **THEN** C1 returns the same clarification and no new draft card

#### Scenario: The member requests a new fact (n1)

- **WHEN** the member sends "Add the team size to your last answer."
- **THEN** the answer rules require a tool result for the size
- **AND** the rules require the model to say that the size is not available if no tool result has it

#### Scenario: An earlier answer as content of the draft (k1)

- **GIVEN** an intro card that waits in the chat
- **WHEN** the member sends "Add that answer to the draft."
- **THEN** the rules for the last answer in the answer system message say that it is not a request to change the last answer, and to follow the intro draft rules
- **AND** the card prompt has no extra sentence for it, so the draft fact rules (Q1) apply as for any revision

#### Scenario: A switch by name only (F2)

- **GIVEN** an intro card for Grace that waits in the chat, and no other target of the turn
- **WHEN** the member sends "Write the intro to Linus instead."
- **THEN** the prompt context tells the agent to ask for an @mention and not to call `draft_intro` for a name
- **AND** a `draft_intro` call for another uid gives the "not the intro target of this turn" refusal, which asks for an @mention, and no draft

#### Scenario: Unknown introDraft target

- **WHEN** `introDraft.target` is an unknown member, a deleted member or an INACTIVE team
- **THEN** C1 returns 404 `INTRO_TARGET_NOT_FOUND` and no stream starts

#### Scenario: No introDraft

- **WHEN** the body has no `introDraft`
- **THEN** the prompt context has no draft text

#### Scenario: A model call fails

- **GIVEN** a turn with `introDraft`
- **WHEN** the structured tail, the summary or the answer stream fails with an `APICallError` (429, 529 or 5xx)
- **THEN** the log line has only the error name, status code and message
- **AND** no log line has the card text

#### Scenario: Invalid draft_intro arguments

- **WHEN** the model calls `draft_intro` with `type: "person"` and a draft text
- **AND** the AI SDK reports `AI_InvalidToolArgumentsError` in the stream or as a thrown error
- **THEN** the log line is `{"name":"AI_InvalidToolArgumentsError","toolName":"draft_intro"}`
- **AND** no log line has the draft text

#### Scenario: Sender who cannot send intros

- **GIVEN** a member who cannot send intros and sends `introDraft`
- **WHEN** the model calls `draft_intro`
- **THEN** the tool refuses, `drafts` is empty and the answer has no intro line

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

The C1 `sources` SHALL hold only web pages that are not pages of the app itself and are not in `sourceRefs` (LAB-3362 D2). A source SHALL be dropped when it is the same page as the `externalUrl` or the `directoryLink` of a source ref. The same page means the same host (without `www.`), path (without a trailing slash) and query; the protocol and the fragment do not count, and a relative `directoryLink` resolves against the web app origin (`WEB_UI_BASE_URL`, else `APPLICATION_BASE_URL`). A source on a host of the app itself SHALL be dropped: the web app origin and `os.pl.xyz` with each of its subdomains. The web app origin is `WEB_UI_BASE_URL`; only an env without `WEB_UI_BASE_URL` uses `APPLICATION_BASE_URL`, as the job links do. Other Protocol Labs sites, for example `plnetwork.io`, SHALL stay as web sources unless they repeat a page in `sourceRefs`. A page SHALL be in `sources` once, and a value that is not an http(s) URL SHALL be dropped. The order SHALL stay. `sourceCount` SHALL count the `sources` that the body sends. `sourceRefs` SHALL NOT change. AI search keeps its own `sources`.

#### Scenario: News and team refs

- **GIVEN** a turn with a news ref `/?news=n-1` and a team ref with `externalUrl` `https://textile.io`
- **AND** the model `sources` are the LabOS page of the story, `https://www.textile.io/` and `https://filecoin.io/blog/post`
- **WHEN** the stream ends
- **THEN** `sources` is only `https://filecoin.io/blog/post`
- **AND** `sourceCount` is 3

#### Scenario: A Protocol Labs site that is not the app

- **GIVEN** a turn with no source refs
- **AND** the model `sources` are `https://plnetwork.io/blog/post` and `https://lab-3272.os.pl.xyz/teams/t-1`
- **WHEN** the stream ends
- **THEN** `sources` is only `https://plnetwork.io/blog/post`
