## Why

At the SU on Nov 16, Vova and Anuj changed what "More like this" and "Less like this" do on the digest page (LAB-3241, LAB-3263). A choice must not change the news tags a member selected. It changes only the member's interest profile weights for the story's topics. The first version (PR 3716, on `develop`) added and removed news tags and muted them, so it is reworked before it reaches prod.

## What Changes

- More raises the member's interest profile `TOPIC` weights for the story's focus-area tags by one step (`DIGEST_CHOICE_WEIGHT_STEP`, 2). Less lowers them by one step, never below 0. Neither changes `newsTags` or any other preference.
- The change is written to the profile in the same transaction as the choice. The daily profile rebuild applies the active choices again, so a choice survives the rebuild. An active choice has no decay; Undo ends it.
- `LabosDigestChoice` stores the weights of the story's topics before and after the choice (`beforeWeights`, `afterWeights`). Undo restores them, or removes only this choice's change when the weight moved since.
- **BREAKING (unreleased)**: the muted news tags (`newsTagsMuted`) are removed: no validation on save, no unmute on save, no effect on effective tags, starting tags or digest tag picks. A stored key from the first version is ignored.
- When news tag picks are on, a member's digest picks are ordered by the sum of their topic weights for each story's tags, highest first, newest first on a tie, before the limit. Saved tags, own and followed teams and categories still decide which stories can be picked (Anuj, LAB-3263).

## Capabilities

### Modified Capabilities

- `labos-digest-page`: More / Less / Undo move topic weights instead of news tags.
- `team-news`: the muted news tags and the muted-tag skip in digest tag picks are removed; digest tag picks are ordered by topic weights.

## Impact

- `apps/web-api/src/team-news/labos-digest-page.service.ts`, `labos-digest-choice.util.ts`.
- `apps/web-api/src/member-interest-profile/` (`build-profile.ts`, `profile-sources.loader.ts`, constants).
- Removal of the muted-tag code in `members/member-preferences.ts`, `members.service.ts`, `news-tag-vocabulary.service.ts`, `select-for-you-news-items.ts`, `team-news-query.service.ts`, `utils/news-tags.ts`.
- Migration `20261117120000_labos_digest_choice_weights`: two nullable JSONB columns. The tag columns stay unused until a later cleanup.
- No API contract change: the page, the frontend and the notification service are unchanged.
