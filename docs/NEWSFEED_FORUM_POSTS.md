# Newsfeed: Forum Posts, Comments & Likes

> Status: **Shipped.** Forum posts are read-through from NodeBB (never stored locally); comments and likes are directory-native and never synced to NodeBB.

Lets the home newsfeed surface **forum/discussion posts** (NodeBB topics) alongside team news, and lets any signed-in member **comment on** and **like** feed items — both team news items and forum posts — inline, without leaving the feed.

Two things are easy to conflate and aren't the same:

- **Forum posts** (`GET /v1/feed/forum-posts`) are a **read-through view of NodeBB**. Nothing about a forum post is stored in Postgres; every request re-fetches the current topic list from NodeBB's own public API.
- **Comments and likes** are **100% directory-native**, stored only in this app's DB. A comment on a forum-post feed item is *not* a NodeBB reply, and a like is *not* a NodeBB upvote — NodeBB has no "like" concept at all, only upvote/downvote, and this feature doesn't touch that.

### Confirmed: no state sync with the real Forum page

This is a deliberate product decision, confirmed explicitly after review against the Home mockups (which show a forum-post card and the real Forum thread looking like the same post) — it's easy to look at those side by side and assume liking/commenting on Home should be the same state as `forum/topics/:cid/:tid` on the real Forum page. **It is not, and should not become that without a new, explicit decision:**

- Liking a post on Home writes to `FeedForumPostLike` only. It never calls NodeBB, so it does **not** register as an upvote on the real Forum page, and a real NodeBB upvote/downvote does **not** change what Home shows.
- Commenting on a forum-post card writes to `FeedComment` only. It never becomes a NodeBB reply, and NodeBB replies are never read back — `GET /v1/feed/forum-posts` only ever reads a topic's *original* post, never its replies.
- The `category` field is the raw NodeBB category name (`General`/`Launch`/`Talent`/`Intros`), passed straight through. If a mockup shows a fixed badge like "DISCUSSION" instead, that's a frontend display choice (hardcode the badge text for any forum-post card) — not something the backend derives or should change.
- Author "role" is NodeBB's `teamRole` only (e.g. "Founder"), with no team/company name attached (e.g. no "@ Lattice Compute" suffix) — also confirmed, not an oversight.

If a future task asks to make these numbers/threads match the real Forum page, that is a **materially larger change** — it would mean calling NodeBB's write API (member-authenticated, not the guest read used today) for likes/comments instead of `FeedForumPostLike`/`FeedComment`, and reading NodeBB's live vote/reply data on every fetch. Treat it as a new feature requiring its own product decision, not a bug fix.

## Why forum posts aren't stored locally

Forum content lives in Protocol Labs' NodeBB fork, not in this app's database. There's no indexer anywhere that copies NodeBB topics into Postgres (or into OpenSearch, despite a `forum_thread` index being *queried* elsewhere in this codebase — nothing writes to it). The one already-sanctioned way to read topic data without a NodeBB login is NodeBB's own public, unauthenticated REST surface, carved out specifically for this in NodeBB's `jwt-auth.js` (`PUBLIC_GET_ALLOWLIST`):

- `GET {FORUM_API_URL}/api/recent` — the endpoint this feature calls. Returns recent topics with title, category (`{cid, name, ...}`), and the topic-starter's user object already embedded — no per-topic follow-up request needed.
- `GET {FORUM_API_URL}/api/topic/:tid` — full topic detail (not currently called; recent-list data is sufficient).

Real, already-synced fields read off each topic (nothing here is invented — see `apps/web-api/src/forum/protosphere-api.client.ts`):

| Feed field | NodeBB source |
|---|---|
| `title` | `topic.titleRaw` (fallback `topic.title`) |
| `body` | `topic.teaser.content` (the topic's latest/main post snippet) |
| `category` | `topic.category.name` |
| `author.memberUid` | `topic.user.memberUid` — synced custom field, the join key back to `Member.uid` |
| `author.name` | `topic.user.displayname` (fallback `username`) |
| `author.avatarUrl` | `topic.user.picture` |
| `author.role` | `topic.user.teamRole` |
| `createdAt` | `topic.timestamp` |

`title`/`body` are run through `stripHtmlToPlainText` (`apps/web-api/src/utils/html-to-text.ts`) before being returned — NodeBB content can contain rendered HTML, and `sanitize-html` alone isn't enough (it re-escapes `&`/`<`/`>` in its output and inserts no whitespace at stripped block-tag boundaries), so this wraps it with an entity-decode pass and a block-boundary-to-space pass.

Forum posts have no `focusAreas` field — unlike team news items (which derive it from `Team.teamFocusAreas`), a NodeBB topic isn't tied to a team, and the real production NodeBB categories (`Intros`, `Talent`, `Launch`, `General`) are generic forum sections with no meaningful mapping onto the five news focus-area tab titles (`Digital Human Rights`, `Economies & Governance`, etc.). Don't add one back without a concrete, non-coincidental source for it — see the `category` field above for the one real per-topic classification NodeBB actually provides.

## Data model

Only comments and likes are persisted. Both follow the `Follow` model's polymorphic pattern (soft reference to the target, hard FK to the acting member):

```prisma
enum FeedItemType {
  NEWS
  FORUM_POST
}

model FeedComment {
  id        Int          @id @default(autoincrement())
  uid       String       @unique @default(cuid())
  itemType  FeedItemType
  itemUid   String
  text      String
  authorUid String
  author    Member       @relation("MemberFeedComments", fields: [authorUid], references: [uid], onDelete: Cascade)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  @@index([itemType, itemUid, createdAt])
  @@index([authorUid])
}

model FeedForumPostLike {
  id           Int      @id @default(autoincrement())
  uid          String   @unique @default(cuid())
  forumPostUid String
  memberUid    String
  member       Member   @relation("MemberFeedForumPostLikes", fields: [memberUid], references: [uid], onDelete: Cascade)
  createdAt    DateTime @default(now())

  @@unique([forumPostUid, memberUid])
  @@index([forumPostUid])
  @@index([memberUid])
}
```

- **`itemUid` / `forumPostUid`** are **intentionally not hard FKs** — `itemUid` references either a `TeamNewsItem.uid` (real row) or a synthetic `fp_<tid>` uid (no local row at all, since forum posts aren't stored). `itemType` is redundant with the `fp_` prefix but kept explicit for query clarity/indexing, same rationale as `Follow.entityType`.
- **`authorUid` / `memberUid`** ARE hard FKs — the actor is always a real directory member, so these cascade-delete with the member (same as `ArticleComment.authorUid`).
- **`fp_` uids are guaranteed collision-free** with `TeamNewsItem` cuids — the prefix is a hard invariant the frontend and backend both rely on to tell the two item types apart from the uid alone.
- **`@@unique([forumPostUid, memberUid])`** makes like/unlike idempotent, same as `TeamNewsUpvote`.

Migration: `apps/web-api/prisma/migrations/20260727120000_add_feed_comments_and_forum_likes/`.

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/v1/feed/forum-posts` | `UserTokenCheckGuard` (optional) | Live NodeBB topics. Returns `{ items: [] }` — not a 403 — for anonymous callers or signed-in members without `forum.read`. |
| POST | `/v1/feed/comments/counts` | none | Batch comment counts for a list of feed item uids (news or forum posts). |
| GET | `/v1/feed/comments` | `UserTokenCheckGuard` (optional) | Comments for one feed item; anonymous callers get `isOwn: false` on every comment. |
| POST | `/v1/feed/comments` | `UserTokenValidation` (required) | Any signed-in member — no forum-access requirement. |
| DELETE | `/v1/feed/comments/:commentUid` | `UserTokenValidation` (required) | Author-only; **403** for anyone else. |
| POST | `/v1/feed/forum-posts/:uid/like` | `UserTokenValidation` (required) | Any signed-in member — likes are our own surface, not forum-gated. Idempotent. |
| DELETE | `/v1/feed/forum-posts/:uid/like` | `UserTokenValidation` (required) | Idempotent. |

Contracts: `libs/contracts/src/lib/contract-feed.ts` + `libs/contracts/src/schema/feed.ts`. Implementation: `apps/web-api/src/feed/`.

Examples below use a member access token (`-H "Authorization: Bearer $TOKEN"`).

### List forum posts for the feed

`GET /v1/feed/forum-posts?limit=20&page=0`

`limit` defaults to `20` (max `100`); `page` defaults to `0` and is passed straight through to NodeBB's own paging. Requires the caller to hold the `forum.read` permission (`AccessControlV2Service`, same gate `search.controller.ts` uses elsewhere) — checked via the caller's email, catching any error and treating it as "no access" rather than throwing.

```bash
curl "http://localhost:3000/v1/feed/forum-posts?limit=5" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "items": [
    {
      "uid": "fp_188",
      "title": "Payy publishes deep-dive on React Native + Rust bridge for wallet math",
      "body": "Payy publishes deep-dive on React Native + Rust bridge for wallet math",
      "author": {
        "memberUid": "cmpxsx1l900r7n54fh7dxyd79",
        "name": "self registered 1",
        "avatarUrl": null,
        "role": "role 1"
      },
      "category": "General",
      "createdAt": "2026-07-07T09:51:35.910Z",
      "forumTopicUrl": "https://plnetwork.io/forum/topics/7/188",
      "commentCount": 0,
      "likeCount": 0,
      "viewerHasLiked": false
    }
  ]
}
```

A caller without `forum.read` (or an anonymous request):

```bash
curl "http://localhost:3000/v1/feed/forum-posts"
```

```json
{ "items": [] }
```

### Batch comment counts

`POST /v1/feed/comments/counts`

Accepts up to 200 uids at once (mix of news-item uids and `fp_`-prefixed forum-post uids). A uid with no comments is simply absent from `counts` — the frontend should default missing keys to `0`.

```bash
curl -X POST "http://localhost:3000/v1/feed/comments/counts" \
  -H "Content-Type: application/json" \
  -d '{"uids": ["fp_188", "cQjK2p0nzTeamNews1"]}'
```

```json
{ "counts": { "fp_188": 2 } }
```

### List comments for a feed item

`GET /v1/feed/comments?itemUid=fp_188`

Ordered oldest-first (thread reading order). `isOwn` is `true` only for the authenticated caller's own comments — always `false` for anonymous requests.

```bash
curl "http://localhost:3000/v1/feed/comments?itemUid=fp_188" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "items": [
    {
      "uid": "cm1a2b3c4d5e",
      "itemUid": "fp_188",
      "text": "Great deep-dive, thanks for sharing!",
      "author": {
        "uid": "cmpxsx1l900r7n54fh7dxyd79",
        "name": "self registered 1",
        "avatarUrl": null
      },
      "createdAt": "2026-07-08T10:15:00.000Z",
      "isOwn": true
    }
  ]
}
```

### Add a comment

`POST /v1/feed/comments`

Body: `{ itemUid: string, text: string (1-2000 chars) }`. `itemType` is inferred from the uid: any uid starting with `fp_` is treated as a forum post, everything else as a news item. For a news-item comment, the news item must exist (`404` otherwise); a forum-post uid is accepted as-is with no NodeBB round-trip, since forum posts are a soft reference by design.

```bash
curl -X POST "http://localhost:3000/v1/feed/comments" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"itemUid": "fp_188", "text": "Great deep-dive, thanks for sharing!"}'
```

```json
{
  "uid": "cm1a2b3c4d5e",
  "itemUid": "fp_188",
  "text": "Great deep-dive, thanks for sharing!",
  "author": {
    "uid": "cmpxsx1l900r7n54fh7dxyd79",
    "name": "self registered 1",
    "avatarUrl": null
  },
  "createdAt": "2026-07-08T10:15:00.000Z",
  "isOwn": true
}
```

`401` if unauthenticated; `404` if `itemUid` looks like a news-item uid that doesn't exist.

### Delete a comment

`DELETE /v1/feed/comments/:commentUid`

Author-only — there is no admin-override bypass (unlike NodeBB's own forum-comment permissions, which do allow Directory Admin to edit/delete any comment; this feed-comment surface currently doesn't mirror that).

```bash
curl -X DELETE "http://localhost:3000/v1/feed/comments/cm1a2b3c4d5e" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{ "uid": "cm1a2b3c4d5e", "deleted": true }
```

`404` if the comment doesn't exist; `403` if the caller isn't the author.

### Like / unlike a forum post

`POST` / `DELETE /v1/feed/forum-posts/:uid/like`

Idempotent both ways — liking an already-liked post, or unliking a never-liked one, both succeed and just return the current state. Not gated on `forum.read`: any signed-in member can like a post they can otherwise see.

```bash
curl -X POST "http://localhost:3000/v1/feed/forum-posts/fp_188/like" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{ "likeCount": 1, "viewerHasLiked": true }
```

```bash
curl -X DELETE "http://localhost:3000/v1/feed/forum-posts/fp_188/like" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{ "likeCount": 0, "viewerHasLiked": false }
```

## Batching pattern (no N+1)

`commentCount`/`likeCount`/`viewerHasLiked` are computed for a whole page of forum posts in two queries total, not one per item — the same `groupBy` + viewer-scoped-`findMany` pattern `TeamNewsQueryService.loadUpvotes` already uses for news-item upvotes:

```ts
const [grouped, viewerRows] = await Promise.all([
  prisma.feedForumPostLike.groupBy({ by: ['forumPostUid'], where: { forumPostUid: { in: uids } }, _count: { _all: true } }),
  viewerMemberUid
    ? prisma.feedForumPostLike.findMany({ where: { forumPostUid: { in: uids }, memberUid: viewerMemberUid }, select: { forumPostUid: true } })
    : Promise.resolve([]),
]);
```
reduced to a `Map<uid, count>` and a `Set<uid>` and looked up per item while building the response. `FeedCommentsService.loadCommentCounts` is the same shape and is reused directly by `FeedForumPostsService`, so the `groupBy` isn't duplicated between the two services.

## Extending to other feed item types (future)

The comment/like surface already generalizes past `NEWS`/`FORUM_POST`:

1. Add a new `FeedItemType` enum value.
2. Give the new item type's uid a distinct, collision-free prefix (mirroring `fp_`), or otherwise make `createComment`'s `itemType` inference unambiguous.
3. Reuse `FeedCommentsService`/`FeedLikesService` as-is — neither has any type-specific branching beyond the `NEWS` existence-check in `createComment`.
