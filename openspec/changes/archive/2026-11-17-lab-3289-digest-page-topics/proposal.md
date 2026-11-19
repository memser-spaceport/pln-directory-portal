## Why

The digest page v2 (LAB-3287) has an "Add topics" card and a topics modal (LAB-3289). The page needs the link member's topics: which tags they follow and which to suggest first.

## What Changes

- `POST v1/labos-digest/page` returns `topics: { followed, suggested }`, each `{ slug, title }`.
- `followed` is the saved news tags, else the starting tags (as News preferences shows them).
- `suggested` is the News preferences tags the member doesn't get yet, by interest-profile topic score.
- Saving stays on the existing `PATCH /v1/member/:uid/preferences` with `newsTags`; no change there.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `labos-digest-page`: the page read adds `topics`.

## Impact

- `libs/contracts/src/schema/team-news.ts` (`LabosDigestPageSchema.topics`)
- `apps/web-api/src/team-news/labos-digest-page.service.ts`, new `labos-digest-topics.util.ts`
- No migration, no new endpoint.
