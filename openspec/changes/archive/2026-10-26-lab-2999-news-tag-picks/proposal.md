# Proposal

## Why

[LAB-2999](https://linear.app/protocollabs/issue/LAB-2999), part of Goal [LAB-2969](https://linear.app/protocollabs/issue/LAB-2969): For You and the digest should pick news by the member's tags (focus areas, LAB-2998) instead of the related-teams expansion and the news categories. The frontend switches For You behind its flag (LAB-3001); the digest switches behind a backend flag so both can be turned on together after a quality check.

## What Changes

- `GET /v1/team-news/grouped-by-focus-area` also returns `forYouTags` (the viewer's effective tags, a parent expanded to its children) and `forYouOwnTeamUids` (the teams they belong to or follow). Both are `[]` for a signed-out viewer. `forYouTeamUids` is unchanged.
- With `NEWS_TAG_PICKS_ENABLED=true`, `POST /v1/team-news/digest-picks` picks, per member, stories from their own or followed teams plus stories sharing any of their tags, newest first, one per team; a member with no match gets the newest network stories. News categories no longer narrow the picks. With the flag off, picks are exactly as before.

Out of scope: the network-wide digest section (LAB-3002), the frontend For You switch (LAB-3001), removing `newsCategories`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `team-news`: For You tag fields and tag-based digest picks.
