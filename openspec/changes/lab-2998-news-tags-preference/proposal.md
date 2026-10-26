# Proposal

## Why

[LAB-2998](https://linear.app/protocollabs/issue/LAB-2998), part of Goal [LAB-2969](https://linear.app/protocollabs/issue/LAB-2969): members will choose news topics ("tags") instead of the six event categories, and For You and the digest will match news by those tags. The backend has to say which tags exist, store each member's choice, and give a sensible starting list to members who never chose. News tags are already focus-area slugs in practice: on dev, 25 of the 49 distinct tags on the last 120 days of news match a focus-area title exactly (checked 2026-10-26).

## What Changes

- **New:** `GET /v1/team-news/tags` lists the focus areas that tagged at least one news item in the last 90 days, as `{ slug, title, children: { slug, title }[] }[]`, grouped under the top-level focus area.
- **New preference key:** `Member.preferences.newsTags: string[]` (focus-area slugs), written through the existing `PATCH /v1/member/:uid/preferences`. Unknown slugs are rejected with 400 and nothing is stored. An empty list is allowed.
- **Read:** `GET /v1/members/:uid/preferences` returns `newsTags`. When the member never saved the key, it returns the slugs of their teams' focus areas and `newsTagsSeeded: true`.
- `newsCategories` stays as is (read and validated) until LAB-2999 stops using it behind its flag. Nothing deletes stored categories.

Out of scope:

- For You and digest matching by tags (LAB-2999).
- The frontend page (LAB-3000).
- Changing how enrichment assigns tags.
- Normalising or rewriting stored news tags.

## Capabilities

### New Capabilities

- `team-news`: Which tags news can be matched on, and each member's chosen news tags.

### Modified Capabilities

None.
