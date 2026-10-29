# Tasks

One PR from `lab-2969-2999` into `lab-2969` in pln-directory-portal.

## 1. Build

- [x] 1.1 `getOwnTeamUidsForMembers` in the suggestions service (memberships and follows), reused by the For You union. Verify: the existing suggestions tests pass unchanged.
- [x] 1.2 Batched starting tags and `getEffectiveTagsForMembers` (saved or seeded, parents expanded). Verify: vocabulary tests cover expansion, batching and a saved empty list.
- [x] 1.3 `forYouTags` and `forYouOwnTeamUids` on the grouped response. Verify: tests for a signed-in and a signed-out viewer.
- [x] 1.4 Tag-based digest picks behind `NEWS_TAG_PICKS_ENABLED`. Verify: tests for flag off (unchanged, categories still narrow) and flag on (own teams plus tag matches, one per team, verbs never match, categories ignored, fallback, top story unchanged); mutation-checked.

## 2. Ship

- [x] 2.1 Lint, `tsc` 5.6 on `apps/web-api`, and the team-news and members tests.
- [x] 2.2 `openspec validate`, then archive this change in the same PR.
