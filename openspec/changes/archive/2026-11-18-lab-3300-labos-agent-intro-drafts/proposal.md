## Why

Members of portfolio teams and PL Infra want help to write an intro request. Slice S3 (LAB-3300) of LAB-3272 lets the agent write a draft. The member edits the draft and sends it with the existing intro API (C3). The agent never sends. The contract is fixed in `contracts/lab-3272-labos-agent-api.md` (section 8). Decisions: Q1 option A (`page` `intro` with `introTarget`), Q3 keep the limits (draft 20 to 3500, C3 1 to 4000), Q2 no stored `source`.

## What Changes

- `IntroRequestsService` gets two public methods: `findEligibleRequester` (the C3 sender rule) and `findTargetName` (the C3 target lookup). C3 uses them, with no change in behavior. `IntroRequestsModule` exports the service.
- C1 accepts `context.page` `intro` with `context.introTarget` `{ type, uid }`. An unknown target returns 404 `INTRO_TARGET_NOT_FOUND` before the stream.
- New agent-only tool `draft_intro`. It is propose only and writes nothing. It adds one item to the new stream body field `drafts`.
- Every C1 body has `drafts` (`[]` when the turn has no draft).

## Capabilities

### Modified Capabilities

- `labos-agent`: the intro context, the `draft_intro` tool and the `drafts` field.
- `intro-requests`: one shared sender rule and target lookup.

## Impact

- **Code:** `apps/web-api/src/intro-requests/intro-requests.service.ts`, `intro-requests.module.ts`, `apps/web-api/src/labos-agent/` (`labos-agent-drafts.ts` new), `libs/contracts/src/schema/labos-agent.ts`.
- **API:** C1 request gets the `intro` page and `introTarget`. C1 body gets `drafts`. New error code `INTRO_TARGET_NOT_FOUND`. C3 `POST /v1/intro-requests` does not change.
- **Database, config:** none. No migration, no cache entry, no new env var, no guard, RBAC, MCP scope or rate limit change.
