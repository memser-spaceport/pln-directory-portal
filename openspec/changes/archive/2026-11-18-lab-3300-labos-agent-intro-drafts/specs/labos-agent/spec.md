## ADDED Requirements

### Requirement: Intro context

When `context.page` is `intro`, the system SHALL look up `context.introTarget` with the C3 target lookup (`IntroRequestsService.findTargetName`) before the stream starts. A member target SHALL be a member with no `deletedAt`. A team target SHALL be any team uid. An unknown target SHALL get HTTP 404 with code `INTRO_TARGET_NOT_FOUND`, and no stream starts. A found target (type, uid and the name from the database) SHALL go to the model as page context.

#### Scenario: Unknown intro target

- **GIVEN** an `introTarget` member uid that does not exist, or a deleted member
- **WHEN** the member opens the chat on the intro page
- **THEN** the response is HTTP 404 with code `INTRO_TARGET_NOT_FOUND`
- **AND** no stream starts

### Requirement: Intro drafts

The chat SHALL have the agent tool `draft_intro` with the arguments `type` (`member` or `team`), `targetUid` and `text`. It SHALL NOT be an MCP tool and SHALL NOT be in `McpToolCatalog`, so the admin MCP caps do not apply to it. It SHALL write nothing: no `IntroRequest` row, no Telegram post and no cache entry. A call SHALL, in this order: refuse a `type` or `targetUid` that is not the `context.introTarget` of the turn; check the sender with the C3 rule (`IntroRequestsService.findEligibleRequester`, the same method as C3); load the target name with the C3 lookup; trim `text` and refuse a length below 20 or above 3500. Then it SHALL put one draft in `drafts`: `draftId` (`dr_` and a UUID), `kind` `intro`, `target` (`type`, `uid`, `name` from the database), `text`, `minLength` 20, `maxLength` 3500 and `source` `agent`. A second call in the same turn SHALL replace the first draft. A refusal SHALL be a text for the model, and the turn SHALL have `drafts: []`. The backend SHALL NOT store `source` or the draft.

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

## MODIFIED Requirements

### Requirement: Validate the chat body

The chat body SHALL have `threadId` and `chatId` (1 to 64 characters), `message` (1 to 2000 characters after trim) and an optional `context`. `context.page` SHALL be `news-story`, `home` or `intro`. `context.newsUid` SHALL be present when `page` is `news-story`. `context.introTarget` (`type` `member` or `team`, `uid` 1 to 64 characters) SHALL be present when `page` is `intro`, and SHALL NOT be present for other pages. A body that fails these rules SHALL get HTTP 400 with code `VALIDATION_ERROR` before the stream starts.

#### Scenario: Blank message

- **GIVEN** a message of only spaces
- **WHEN** the member posts it
- **THEN** the response is HTTP 400 with code `VALIDATION_ERROR`

### Requirement: Reuse the AI search stream

The chat SHALL return the AI search stream of `POST /v1/husky/chat/contextual-tools`: the same headers, chunked JSON body, model settings (`HUSKY_SEARCH_*`), stall watchdog, one continuation and stalled notice. The body SHALL have `steps`, `content`, `sources`, `sourceRefs` (when there are any), `followUpQuestions`, `actions`, `proposals` and `drafts`. `proposals` SHALL hold the action proposals of the turn, or `[]`. `drafts` SHALL hold the intro draft of the turn, or `[]`. A hard error after the headers SHALL destroy the connection. The agent SHALL act as the signed-in member, with the AI search tools (including the news and web search tools) and the MCP tools `list_news`, `get_news_item`, `get_my_profile` and `list_my_experiences`. Each `list_news` and `get_news_item` result SHALL carry a `[NewsLink]` line per story, so the answer gets `sourceRefs` for those stories.

#### Scenario: Question about a story

- **GIVEN** an enabled member on a news story
- **WHEN** the member asks "What does this story mean?"
- **THEN** the response streams the answer about that story
- **AND** the final body has `proposals: []` when the agent made no proposal
- **AND** the final body has `drafts: []` when the agent made no draft
