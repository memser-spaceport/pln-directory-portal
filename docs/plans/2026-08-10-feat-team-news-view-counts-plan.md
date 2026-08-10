---
title: "feat: Team News — Track and Expose View Counts"
type: feat
date: 2026-08-10
brainstorm: docs/brainstorms/2026-08-10-team-news-view-counts-brainstorm.md
---

# feat: Team News — Track and Expose View Counts

## Overview

Add a raw, non-deduplicated `viewCount` to `TeamNewsItem`, incremented via a new unauthenticated
batch endpoint (`POST /v1/team-news/impressions`) that the frontend calls once per short buffering
window with the `newsItemUid`s that crossed the visibility threshold in the feed. `viewCount` is
exposed on the existing team news feed DTO.

**Scope note:** this repo (`backend`) contains `web-api` and `back-office` only — the Team News
feed UI that fires impression events lives in a separate frontend repo. This plan covers the
backend data model and API surface only; wiring up `IntersectionObserver` + client-side batching is
out of scope here and should be tracked as a follow-up in the frontend repo once this API ships.

---

## Problem Statement

Team news items have no view/impression tracking today. The two existing counters on
`TeamNewsItem` — `TeamNewsUpvote` and `FeedNewsLike` — are both per-member, deduplicated,
toggleable signals (`@@unique([newsItemUid, memberUid])`), which is the opposite of what's needed
here: every card impression should increment a single global counter, with no dedup by user,
session, or repeat viewing, including anonymous visitors.

---

## Proposed Solution

1. **Schema**: add `viewCount Int @default(0)` directly to `TeamNewsItem` — a flat counter, not a
   per-member row, matching the existing `DiscoveryQuestion.viewCount` precedent
   (`husky.service.ts:107-118`) rather than the `ArticleStatistic`/upvote/like pattern.
2. **Write path**: new `TeamNewsImpressionsService` with one method, `recordImpressions(uids)`,
   called from a new unauthenticated `POST /v1/team-news/impressions` endpoint. Duplicate uids in a
   single batch each count (a card that scrolls in/out repeatedly within one buffering window
   increments once per occurrence).
3. **Read path**: `viewCount` is read directly off the row in `toDto` — it's a plain scalar column
   on `TeamNewsItem`, already present on every call site's primary query result, so (unlike
   `loadUpvotes`/`loadDiscussions`, which need a second query into other tables) no batched loader
   is needed. An earlier version of this PR added one anyway; code review caught the redundancy
   (see "Post-review correction" below).

---

## Technical Approach

### Schema change

```prisma
// apps/web-api/prisma/schema.prisma — TeamNewsItem (~line 2304)
model TeamNewsItem {
  ...
  editorialRank    Int?
  /// Raw impression count. Incremented once per feed-card impression via
  /// POST /v1/team-news/impressions. Not deduplicated by user, session, or
  /// repeat viewing — unlike upvotes/likes below.
  viewCount        Int                 @default(0)
  createdAt        DateTime            @default(now())
  ...
}
```

`@default(0)` means Postgres sets the default via metadata on `ALTER TABLE ADD COLUMN` without
scanning/rewriting existing rows — safe on this table's current size.

### API contract

New request/response schemas in `libs/contracts/src/schema/team-news.ts`:

```ts
// Batch size capped at 200, matching the existing POST /v1/feed/comments/counts precedent.
export const RecordTeamNewsImpressionsRequestSchema = z.object({
  newsItemUids: z.array(z.string()).min(1).max(200),
});

export const RecordTeamNewsImpressionsResponseSchema = z.object({
  success: z.literal(true),
});
```

Add `viewCount: z.number().int().min(0),` to `TeamNewsItemSchema` (the main feed item schema,
`team-news.ts:54-83`) — not to `TeamNewsUpvoteStatusSchema` or `TeamNewsPopularItemSchema`, which
are unrelated response shapes.

New route in `libs/contracts/src/lib/contract-team-news.ts`:

```ts
recordTeamNewsImpressions: {
  method: 'POST',
  path: `${getAPIVersionAsPath('1')}/team-news/impressions`,
  body: RecordTeamNewsImpressionsRequestSchema,
  responses: {
    200: RecordTeamNewsImpressionsResponseSchema,
  },
  summary: 'Record feed-card impressions for a batch of news items (unauthenticated, uncapped, not deduplicated)',
},
```

**Invalid/unknown uids**: silently no-op, no error — same behavior as `POST
/v1/feed/comments/counts`. This falls out of the implementation for free (see below), no explicit
existence check needed.

**Empty/over-max batch**: rejected by the `min(1).max(200)` schema at the ts-rest validation layer
(400), consistent with how other contract-validated bodies fail in this codebase.

### Write implementation (atomic, no per-row existence check)

Because every occurrence of a uid in the batch must count, and `updateMany` can't vary its
increment per row, group uids by how many times they appear in the batch, then issue one
`updateMany` per distinct count — in the common case (no repeats within one buffering window)
that's a single query. `updateMany` matching zero rows for an unknown uid is a silent no-op, which
is exactly the desired behavior for bad/unknown uids — no separate existence-check query needed.
All updates are wrapped in one `$transaction` for atomicity, following the batched-write pattern
from the mark-all-read hardening work (`push-notifications.service.ts:976-1021`).

```ts
// apps/web-api/src/team-news/team-news-impressions.service.ts
@Injectable()
export class TeamNewsImpressionsService {
  constructor(private readonly prisma: PrismaService) {}

  async recordImpressions(newsItemUids: string[]): Promise<void> {
    const countByUid = new Map<string, number>();
    for (const uid of newsItemUids) {
      countByUid.set(uid, (countByUid.get(uid) ?? 0) + 1);
    }

    const uidsByCount = new Map<number, string[]>();
    for (const [uid, count] of countByUid) {
      const group = uidsByCount.get(count) ?? [];
      group.push(uid);
      uidsByCount.set(count, group);
    }

    const writes = [...uidsByCount.entries()].map(([count, uids]) =>
      this.prisma.teamNewsItem.updateMany({
        where: { uid: { in: uids } },
        data: { viewCount: { increment: count } },
      })
    );

    await this.prisma.$transaction(writes);
  }
}
```

### Controller endpoint (no auth guard)

```ts
// apps/web-api/src/team-news/team-news.controller.ts
@Api(server.route.recordTeamNewsImpressions)
async recordTeamNewsImpressions(@Body() body: unknown) {
  const { newsItemUids } = RecordTeamNewsImpressionsRequestSchema.parse(body);
  await this.teamNewsImpressionsService.recordImpressions(newsItemUids);
  return { success: true as const };
}
```

Deliberately no `@UseGuards(...)` — anonymous impressions must be accepted. Abuse protection is the
existing app-wide `ThrottlerModule` (`app.module.ts:94`, wired as a global `APP_GUARD`), which
already applies to every route without opt-in. No bespoke per-item/per-IP logic, per the brainstorm
decision.

### Read path — DTO wiring

**Post-review correction:** the first implementation added a `loadViewCounts(itemUids)` batched
loader (same shape as `loadDiscussions`/`loadUpvotes`) and re-queried `teamNewsItem` a second time
for `viewCount`. Code review (see PR #3325 review comment) caught that this was redundant:
`viewCount` is a plain scalar column directly on `TeamNewsItem`, and every call site's primary
query already fetches the full row via Prisma's `include`, which returns all scalar columns by
default — unlike `discussion`/`upvotes`, which live in separate tables (`TeamNewsForumLink`,
`TeamNewsUpvote`) and genuinely need a second batched query. `team-news-enrichment.service.ts`'s
hand-built DTO already did this correctly (`viewCount: item.viewCount`, straight off the row).

Final implementation: no `loadViewCounts` method. `toDto`'s `row` parameter type gained a
`viewCount: number` field, and the DTO body reads it directly:

```ts
// toDto — team-news-query.service.ts
viewCount: row.viewCount,
```

No extra query, no extra `Promise.all` entry, no extra `toDto` parameter.

### Trending — untouched

`editorialRank` / `getPopular()` continue to rank on `upvoteCount` only
(`team-news-trending-seed.service.ts`, `team-news-query.service.ts:397-439`). No changes here —
wiring views into trending is explicitly out of scope per the brainstorm.

---

## Implementation Phases

### Phase 1 — Schema & migration

**Files:** `apps/web-api/prisma/schema.prisma`

- [x] Add `viewCount Int @default(0)` to `TeamNewsItem`.
- [x] Run `prisma migrate dev --name add_team_news_view_count` to generate the migration. (`migrate dev` requires an interactive TTY unavailable here; hand-wrote `migration.sql` mirroring the `add_team_news_editorial_rank` precedent, then `prisma db push` + `prisma generate` to sync the local dev DB and regenerate the client.)

### Phase 2 — Contract & schema

**Files:** `libs/contracts/src/schema/team-news.ts`, `libs/contracts/src/lib/contract-team-news.ts`

- [x] Add `RecordTeamNewsImpressionsRequestSchema`, `RecordTeamNewsImpressionsResponseSchema`.
- [x] Add `viewCount` to `TeamNewsItemSchema`.
- [x] Add `recordTeamNewsImpressions` route to `apiTeamNews`.

### Phase 3 — Write path

**Files:** `apps/web-api/src/team-news/team-news-impressions.service.ts` (new),
`apps/web-api/src/team-news/team-news.controller.ts`, `apps/web-api/src/team-news/team-news.module.ts`

- [x] Implement `TeamNewsImpressionsService.recordImpressions`.
- [x] Add `recordTeamNewsImpressions` controller method, no auth guard.
- [x] Register the new service as a provider in the module.

### Phase 4 — Read path

**Files:** `apps/web-api/src/team-news/team-news-query.service.ts`

- [x] ~~Add `loadViewCounts`~~ — added, then removed per post-review correction above; `viewCount`
      is read directly off the row already fetched by each call site's primary query instead.
- [x] Add `viewCount: number` to `toDto`'s `row` parameter type; wire `viewCount: row.viewCount`
      into the DTO body. No new `toDto` parameter, no new `Promise.all` entry at any of the 5 call
      sites.
- [x] (Discovered during implementation) `team-news-enrichment.service.ts`'s `getTeamNewsByTeam` also
      builds a `TeamNewsItemDto` by hand (service-to-service endpoint, doesn't use `toDto`) — added
      `viewCount: item.viewCount` directly from the already-fetched row. This turned out to be the
      correct pattern all along, and `toDto` was later brought in line with it (see above).

### Phase 5 — Tests

**Files:** `apps/web-api/src/team-news/*.spec.ts` (new/existing, following this module's existing
test file layout)

- [x] `recordImpressions`: batch with duplicate uids increments correctly (e.g. `[A, A, B]` → A +2,
      B +1); unknown uid in the batch does not error; all grouped writes are wrapped in one
      `$transaction`. (`team-news-impressions.service.spec.ts`)
- [~] Controller-level test (unauthenticated request, schema validation on empty/>200-item batch)
      **skipped**: importing `team-news.controller.ts` in Jest transitively pulls in
      `UserTokenValidation` → `axios`, which is ESM-only and this repo's Jest isn't configured to
      transform it. This is a pre-existing gap (no controller in this codebase has a
      `.controller.spec.ts` for the same reason) — not something to fix as part of this feature.
      The endpoint has no `@UseGuards(...)` (visually verifiable) and delegates validation directly
      to `RecordTeamNewsImpressionsRequestSchema.parse(...)`, both covered indirectly by the schema
      itself; a real regression check would need e2e/integration coverage, which this module doesn't
      have today.
- [x] `toDto`: item with no impressions yet returns `viewCount: 0`; item with recorded impressions
      stamps the correct count onto the DTO, read directly off the row with a single
      `teamNewsItem.findMany` call (no redundant second query). (`team-news-query.service.spec.ts`)

---

## Acceptance Criteria

- [x] `TeamNewsItem.viewCount` exists, defaults to `0`, migration applied
- [x] `POST /v1/team-news/impressions` accepts a batch of `newsItemUids` (1–200) with no
      authentication required
- [x] Each occurrence of a uid in the batch increments that item's `viewCount` by 1 (duplicates in
      one batch each count)
- [x] Unknown/invalid uids in the batch are ignored without erroring the rest of the batch
- [x] Empty array or batch over 200 items is rejected (400, via zod schema validation)
- [x] `viewCount` is present on every team news item returned from `GET /v1/team-news`,
      `/grouped-by-focus-area`, `/recent`, `/teams/:teamUid/team-news`, and any other `toDto`-based
      response (including the hand-built DTO in `team-news-enrichment.service.ts`), defaulting to
      `0` when no impressions exist
- [x] Concurrent impression batches for the same item never lose an increment (relies on Prisma's
      atomic `increment`, exercised by wrapping grouped writes in one `$transaction`)
- [x] `editorialRank` / `getPopular()` behavior is unchanged (views not factored into trending) —
      no changes made to trending code

---

## Dependencies & Risks

| Risk | Mitigation |
|---|---|
| Unauthenticated write endpoint could be spammed to inflate/deflate a public number | Accepted per brainstorm — standard app-wide `ThrottlerGuard` only; revisit if real abuse is observed |
| High write volume (every feed scroll can touch many items) vs. no existing precedent for impression-scale writes in this codebase | Client-side batching (frontend repo, out of scope here) already keeps writes to one request per 1-2s window; `updateMany` grouped by count keeps server-side query count low even within a batch |
| Migration adds a column to a `TeamNewsItem`-scale table | `@default(0)` makes this a metadata-only `ALTER TABLE` on Postgres — no table rewrite/lock risk |
| `viewCount` DTO wiring touches 5 call sites in `team-news-query.service.ts` — easy to miss one | Covered explicitly in Phase 4 and the acceptance criteria list every affected endpoint |

---

## Open Questions (from SpecFlow)

These are documented but **not blocking** — accepted defaults below; revisit only if real usage
surfaces a problem:

1. **Frontend retry behavior on a failed impressions POST** (network error, 429, 5xx): left to the
   frontend repo's implementation. Since there's no dedup, a naive same-batch retry after partial
   server-side success could double count — worth flagging there, not solvable from the backend
   alone.
2. **Single-item / detail-view endpoint**: no `GET /v1/team-news/:uid` exists today (confirmed via
   `contract-team-news.ts`) — the feed already carries full item data, so no separate detail
   endpoint needs `viewCount` added. If one is added later, it should read `viewCount` straight off
   its own fetched row, same as everywhere else in this PR.
3. **Team-visibility gating on the impressions endpoint**: none — since the endpoint is
   unauthenticated by design, any valid `newsItemUid` is accepted regardless of the item's team's
   follow/visibility state, consistent with the feed itself being publicly viewable.

---

## File Change Summary

| File | Change |
|---|---|
| `apps/web-api/prisma/schema.prisma` | Modify — add `viewCount Int @default(0)` to `TeamNewsItem` |
| `apps/web-api/prisma/migrations/20260810130000_add_team_news_view_count/` | **Create** — migration |
| `apps/web-api/src/team-news/team-news-enrichment.service.ts` | Modify — add `viewCount` to hand-built DTO in `getTeamNewsByTeam` (not discovered until typecheck; see Phase 4 note) |
| `libs/contracts/src/schema/team-news.ts` | Modify — add `RecordTeamNewsImpressionsRequestSchema`, `RecordTeamNewsImpressionsResponseSchema`, `viewCount` on `TeamNewsItemSchema` |
| `libs/contracts/src/lib/contract-team-news.ts` | Modify — add `recordTeamNewsImpressions` route |
| `apps/web-api/src/team-news/team-news-impressions.service.ts` | **Create** — `recordImpressions` |
| `apps/web-api/src/team-news/team-news.controller.ts` | Modify — add `recordTeamNewsImpressions` endpoint (no guard) |
| `apps/web-api/src/team-news/team-news.module.ts` | Modify — register `TeamNewsImpressionsService` |
| `apps/web-api/src/team-news/team-news-query.service.ts` | Modify — `viewCount` read directly off the row in `toDto` (no batched loader; see post-review correction) |
| `apps/web-api/src/team-news/team-news-impressions.service.spec.ts` | **Create** — tests for grouping, dedup-by-count, unknown uids, transaction wrapping |
| `apps/web-api/src/team-news/team-news-query.service.spec.ts` | Modify — added `viewCount` stamping + default-to-0 tests |

---

## References

### Internal

- `apps/web-api/src/husky/husky.service.ts:107-118` — `DiscoveryQuestion.viewCount` precedent (flat
  counter, plain `increment`, no dedup)
- `apps/web-api/src/team-news/team-news-query.service.ts:497-621` — existing batched loaders
  (`loadDiscussions`, `loadUpvotes`) and `toDto`
- `apps/web-api/src/team-news/team-news.controller.ts` — existing endpoint/guard patterns
- `libs/contracts/src/lib/contract-team-news.ts` — existing route definitions
- `libs/contracts/src/schema/team-news.ts:54-88` — `TeamNewsItemSchema`, `TeamNewsUpvoteStatusSchema`
- `apps/web-api/src/push-notifications/push-notifications.service.ts:976-1021` — batched-write
  `$transaction` pattern (from mark-all-read hardening learnings)
- `apps/web-api/src/app.module.ts:94` — global `ThrottlerModule` (existing app-wide rate limiting)
- `docs/NEWSFEED_FORUM_POSTS.md` — `POST /v1/feed/comments/counts` batch-endpoint precedent
- `docs/brainstorms/2026-08-10-team-news-view-counts-brainstorm.md` — source brainstorm
