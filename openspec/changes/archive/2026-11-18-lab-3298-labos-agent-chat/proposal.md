## Why

Members read a news story in LabOS and want to ask a follow-up question in place. LAB-3272 adds an in-app agent. Slice S1 (LAB-3298) is the read-only chat: the member asks, and the agent answers with LabOS news and the web. The API contract C1 is fixed in `contracts/lab-3272-labos-agent-api.md`.

## What Changes

- A new `labos-agent` module with `POST /v1/labos-agent/chat` and `GET /v1/labos-agent/access`, both behind `UserTokenValidation`.
- One pilot gate, `LabosAgentAccessService.isEnabled`. Until D1: on outside production, off on production.
- The chat reuses `HuskyAiService.createContextualToolsResponse`. It gets a small optional `options` argument: page context for the prompts, extra tools, extra response fields (`proposals: []`) and `persistHistory: false`. AI search passes nothing and keeps its behavior.
- `list_news` and `get_news_item` from the MCP news tools run in the chat as the member.

## Capabilities

### New Capabilities

- `labos-agent`: the agent chat turn (C1), the access check and the pilot gate.

## Impact

- **Code:** `apps/web-api/src/labos-agent/` (new), `apps/web-api/src/husky/husky-ai.service.ts` (optional options argument), `apps/web-api/src/app.module.ts`, `libs/contracts/src/schema/labos-agent.ts` (new).
- **API:** new routes `POST v1/labos-agent/chat` and `GET v1/labos-agent/access`. Only the global throttler applies.
- **Database, config:** none. No migration, no new env var, no rate limit change.
