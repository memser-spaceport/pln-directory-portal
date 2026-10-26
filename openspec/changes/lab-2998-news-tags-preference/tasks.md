# Tasks

One PR from `lab-2969-2998` into `lab-2969` in pln-directory-portal.

## 1. Vocabulary (D1)

- [x] 1.1 Add the `NewsTagVocabulary` helper in `apps/web-api/src/team-news/` (slugify focus-area titles, parent slug, 10-minute cache, warning on slug collisions). Verify: unit tests cover `AI & Robotics` → `ai-robotics`, `Climate / ReFi` → `climate-refi`, and a parent/child pair.

## 2. Tag list (D2)

- [x] 2.1 Add `GET /v1/team-news/tags` to `contract-team-news.ts` before `:newsItemUid`, with a Zod response schema, and implement it in the team-news query service. Verify: tests for focus areas used by news, a child listed under its parent, `launch` excluded, and news older than 90 days ignored.
- [ ] 2.2 Check that `GET /v1/team-news/<uid>` still resolves a news item after the new route.

## 3. Member news tags (D3, D4)

- [x] 3.1 Validate `newsTags` in `toPreferencePatch` against the vocabulary; add `newsTagsSeeded` to `DERIVED_PREFERENCE_KEYS`. Verify: tests for a valid list, an unknown slug (400, nothing stored), `[]`, and other keys untouched.
- [x] 3.2 Return `newsTags` from `buildPreferenceResponse`, seeding from the member's teams' focus areas when the key is absent. Verify: tests for never saved, no team, and saved `[]`.
- [ ] 3.3 Try it against the local API with the dev data: the tag list, a member's seeded tags, a PATCH and a re-read.

## 4. Ship

- [x] 4.1 Run lint, `tsc` 5.6 on `apps/web-api` (the repo's `typecheck:api` is vacuous), and the web-api tests for the touched areas.
- [ ] 4.2 Run `npx -y @fission-ai/openspec@1.14.1 validate --json`, then archive this change.
