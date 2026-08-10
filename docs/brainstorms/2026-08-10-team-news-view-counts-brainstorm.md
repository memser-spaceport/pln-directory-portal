---
date: 2026-08-10
topic: team-news-view-counts
---

# Team News — View Counts

## What We're Building

A raw, non-deduplicated view counter for native Team News items. When a news item's card becomes visible in the feed (an impression — not just opening the detail view), the frontend batches these impressions client-side and periodically POSTs the affected `newsItemUid`s to a new endpoint, which atomically increments a `viewCount` on each `TeamNewsItem`. `viewCount` is returned alongside existing fields (`upvoteCount`, `viewerHasUpvoted`, etc.) in the existing team news feed responses.

Forum posts shown in the feed are explicitly out of scope — only native `TeamNewsItem` records get view tracking.

## Why This Approach

The spec is unusually explicit that this is a raw counter, not an engagement metric: every impression counts, no per-user/session dedup, anonymous visitors included. That rules out the codebase's existing per-member-row pattern (`ArticleStatistic`, unique on `(articleUid, memberUid)`) — there's no user to key off of, and dedup is explicitly unwanted. It also rules out reusing the like/upvote tables (`FeedNewsLike`, `TeamNewsUpvote`), which are built around a `@@unique([newsItemUid, memberUid])` toggle — the opposite semantics.

The closest existing precedent is `DiscoveryQuestion.viewCount` — a flat column with a plain `{ increment: 1 }` and no dedup — which matches this feature's requirements exactly. This keeps the feature simple, avoids inventing new infrastructure, and stays inside the explicit scope ("views counter only, not likes/comments/other newsfeed redesign items").

The one real risk this approach introduces: the write endpoint must accept unauthenticated requests (anonymous views count) and directly moves a public-facing number with no dedup guard. We decided to accept that risk for now, scoped to the app's existing general-purpose API rate limiting, rather than building bespoke anti-abuse logic — consistent with keeping this feature minimal and revisiting only if real abuse is observed.

## Key Decisions

- **Scope**: native `TeamNewsItem` only. Forum posts in the feed are not tracked (separate underlying model, would need its own design).
- **Storage**: new `viewCount Int @default(0)` column directly on `TeamNewsItem` (not a separate stats table, not a per-member row) — atomic `{ increment: N }` on write, no aggregation needed on read.
- **Impression trigger**: fires when a card crosses a simple intersection threshold (e.g. ≥50% of the card in viewport) — no minimum dwell time required.
- **Repeat impressions**: no throttling or per-session dedup. A card that scrolls out of view and back in again counts again, every time, matching the spec literally.
- **Anonymous visitors**: counted. The write endpoint does not require authentication.
- **Write pattern**: frontend buffers impression events for a short window (e.g. 1–2s) and sends one batched request with a list of `newsItemUid`s, rather than one request per impression. Server loops the batch as atomic increments.
- **API shape**: new endpoint (e.g. `POST /v1/team-news/impressions`) accepting a batch of `newsItemUid`s; `viewCount` added to the existing feed DTO (`TeamNewsQueryService.toDto`), following the same batched `loadX(itemUids)` pattern already used for upvotes/discussions.
- **Abuse protection**: standard app-wide API rate limiting only — no bespoke per-item or per-IP anti-spam logic in this scope.
- **Trending**: not touched. `editorialRank`/`getPopular()` currently rank on upvotes only; views are not wired into trending as part of this feature.

## Open Questions

- Exact intersection threshold percentage (e.g. 50%) and batching window duration (e.g. 1–2s) — left as implementation-detail tuning for the planning/build phase, not a product decision.
- Whether `viewCount` should ever feed into trending/ranking later — explicitly deferred, not part of this scope.
- Whether basic per-request sanity caps (e.g. max batch size) are worth adding during implementation even though bespoke anti-abuse logic is out of scope — worth a quick sanity check during planning.

## Next Steps

→ `/workflows:plan` for implementation details
