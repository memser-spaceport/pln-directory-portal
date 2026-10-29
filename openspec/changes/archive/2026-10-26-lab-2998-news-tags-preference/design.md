# Design

## Context

See proposal.md for the motivation. Code at `0a5a9f159` (`lab-2969` cut from `develop`, 2026-10-26):

- **News tags.** `TeamNewsItem.tags String[]` (no index), filled by the ingest producer and stored as sent (`team-news.service.ts`). On dev they are focus-area slugs, legacy verbs (`launch`, `fund`, `$`, …) or free-form extras.
- **Focus areas.** `FocusArea` has `uid`, unique `title`, `parentUid`; no slug column. `TeamFocusArea` links a team to a focus area and its top-level ancestor (`ancestorArea`). `slugify` in `apps/web-api/src/utils/helper/helper.ts` turns titles into exactly the news tag slugs (`AI & Robotics` → `ai-robotics`, `Climate / ReFi` → `climate-refi`).
- **Preferences.** `PATCH /v1/member/:uid/preferences` goes through `toPreferencePatch` (`members/member-preferences.ts`), which drops derived keys and validates `newsCategories`; the update merges top-level keys (pln-directory-portal#3413). `GET /v1/members/:uid/preferences` goes through `buildPreferenceResponse` (`members.service.ts` ~1890), which injects derived keys and `newsCategories`.
- **Routes.** ts-rest contracts in `libs/contracts/src/lib/contract-team-news.ts`. `GET /v1/team-news/:newsItemUid` is declared there, so a `/team-news/tags` route must come before it.

## Goals / Non-Goals

**Goals:**

- One source of truth for "which slugs are tags": the focus-area table, slugified.
- `newsTags` stored and validated like `newsCategories`, with a seed computed on read.
- No schema migration.

**Non-Goals:**

- Matching For You or the digest by tags (LAB-2999).
- A slug column on `FocusArea`, or rewriting stored news tags.

## Decisions

### D1. Vocabulary = slugified focus-area titles

A small `NewsTagVocabulary` helper loads all focus areas (`uid, title, parentUid`), maps `slugify(title)` → `{ slug, title, parentSlug }`, and caches it in memory for 10 minutes (114 rows today). Validation, the tag list and the seed all use it.

_Alternative:_ a `slug` column with a migration and backfill. Rejected for now: titles are unique and `slugify` is deterministic, so a column adds a migration without changing behaviour. If two titles ever slugify the same, the helper logs a warning and keeps the first.

### D2. Tag list from news of the last 90 days

`SELECT DISTINCT unnest(tags) FROM "TeamNewsItem" WHERE "createdAt" > now() - interval '90 days'`, intersected with the vocabulary. Parents of matched children are added so the client can group. The response is cached for 10 minutes. The route `GET /v1/team-news/tags` is public, like the other read routes in that contract, and is declared before `:newsItemUid`.

### D3. Validation in `toPreferencePatch`

`newsTags` joins `newsCategories` as a validated key: an array of strings, each a vocabulary slug, deduplicated; otherwise `BadRequestException`. `[]` is valid. Because the vocabulary is async, `toPreferencePatch` takes the vocabulary as a parameter and the service loads it before calling it.

### D4. Seed on read, never on write

`buildPreferenceResponse` returns the stored `newsTags` when the key is present. Otherwise it queries the member's teams' `TeamFocusArea` rows, takes `slugify(focusArea.title)` for each (the focus area itself, child or top-level), dedupes, keeps vocabulary members, and sets `newsTagsSeeded: true`. `newsTagsSeeded` is a derived key: it is added to `DERIVED_PREFERENCE_KEYS` so a client echoing it back cannot store it.

## Risks / Trade-offs

- [The preferences GET gains a query for members who never saved] → One indexed query on `TeamFocusArea` by team uids; only for members without the key.
- [A focus area is renamed] → Its slug changes, so stored member tags and old news tags stop matching it. This is acceptable for now (titles are stable); D1's alternative is the fix if it becomes a problem.
- [The enrichment producer emits a slug of a renamed or deleted area] → It is simply not in the vocabulary, so it is neither listed nor matched.
