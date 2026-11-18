# labos-agent Specification

## Purpose

The LabOS in-app agent (LAB-3272). In S1 (LAB-3298) a signed-in member asks the agent a question, or a follow-up about the news story they read. The agent answers through the AI search stream. Contract: `contracts/lab-3272-labos-agent-api.md` (C1).

## Requirements

### Requirement: Signed-in members only

`POST /v1/labos-agent/chat` and `GET /v1/labos-agent/access` SHALL use the `UserTokenValidation` guard. A request with no member token or a bad token SHALL get HTTP 401 from the guard.

#### Scenario: No token

- **GIVEN** a request with no member token
- **WHEN** it calls either route
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

The chat body SHALL have `threadId` and `chatId` (1 to 64 characters), `message` (1 to 2000 characters after trim) and an optional `context`. `context.page` SHALL be `news-story` or `home`. `context.newsUid` SHALL be present when `page` is `news-story`. A body that fails these rules SHALL get HTTP 400 with code `VALIDATION_ERROR` before the stream starts.

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

The chat SHALL return the AI search stream of `POST /v1/husky/chat/contextual-tools`: the same headers, chunked JSON body, model settings (`HUSKY_SEARCH_*`), stall watchdog, one continuation and stalled notice. The body SHALL have `steps`, `content`, `sources`, `sourceRefs` (when there are any), `followUpQuestions`, `actions` and `proposals`. In S1 `proposals` SHALL be `[]`. A hard error after the headers SHALL destroy the connection. The agent SHALL act as the signed-in member, with the AI search tools (including the news and web search tools) and the MCP tools `list_news` and `get_news_item`. Each `list_news` and `get_news_item` result SHALL carry a `[NewsLink]` line per story, so the answer gets `sourceRefs` for those stories.

#### Scenario: Question about a story

- **GIVEN** an enabled member on a news story
- **WHEN** the member asks "What does this story mean?"
- **THEN** the response streams the answer about that story
- **AND** the final body has `proposals: []`

### Requirement: No writes in S1

The chat SHALL write nothing to the directory. It SHALL keep the thread summary in the AI search cache only and SHALL NOT write thread history or summaries to MongoDB.

#### Scenario: A finished turn

- **GIVEN** an enabled member
- **WHEN** a chat turn finishes
- **THEN** the cache has the thread summary
- **AND** MongoDB has no new thread document
