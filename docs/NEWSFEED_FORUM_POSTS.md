# Newsfeed: Forum Posts, Comments & Likes

> Status: **Shipped.** Forum posts are read-through from NodeBB (never stored locally). Comments and likes are directory-native, Feed-News-only, and never synced to NodeBB.

Lets the home newsfeed surface **forum/discussion posts** (NodeBB topics) alongside team news, and lets any signed-in member **comment on** (with unlimited-depth replies) and **like** a **Feed News item** inline, without leaving the feed.

Two things are easy to conflate and aren't the same:

- **Forum posts** (`GET /v1/feed/forum-posts`) are a **read-through view of NodeBB**. Nothing about a forum post is stored in Postgres; every request re-fetches the current topic list from NodeBB's own public API. `commentCount`/`likeCount` on a forum-post card are NodeBB's own real numbers (`postcount`/`upvotes`) — there is no local comment or like feature on forum posts at all.
- **Comments and likes** are **100% directory-native**, stored only in this app's DB, and only ever attach to a `TeamNewsItem`. A comment is *not* a NodeBB reply, and a like is *not* a NodeBB upvote — NodeBB has no "like" concept at all, only upvote/downvote, and this feature doesn't touch that.

### Why forum posts have no local comment/like feature

Earlier versions of this feature let `FeedComment`/`FeedForumPostLike` attach to either a news item or a synthetic `fp_<tid>` forum-post uid. That was reverted: **forum content belongs entirely to NodeBB's own DB, and this app's DB must never hold a shadow copy of it** — not the posts, and not comments/likes on them either. A Home forum-post card and the real Forum thread (`forum/topics/:cid/:tid`) can look like the same post, which makes it tempting to add a comment or like feature that shows up on Home; **that would require writing through to NodeBB's own authenticated write API** (e.g. `POST {FORUM_API_URL}/api/v3/topics/:tid` with `{ content, toPid? }`, forwarding the member's own bearer token — NodeBB's JWT middleware logs them in automatically) and reading its real reply thread (`GET {FORUM_API_URL}/api/topic/:tid`). That's a materially larger, separate integration and a new product decision, not something this feature does.

- The `category` field is the raw NodeBB category name (`General`/`Launch`/`Talent`/`Intros`), passed straight through. If a mockup shows a fixed badge like "DISCUSSION" instead, that's a frontend display choice — not something the backend derives or should change.
- Author "role" is NodeBB's `teamRole` only (e.g. "Founder"), with no team/company name attached (e.g. no "@ Lattice Compute" suffix) — confirmed, not an oversight.

## Why forum posts aren't stored locally

Forum content lives in Protocol Labs' NodeBB fork, not in this app's database. There's no indexer anywhere that copies NodeBB topics into Postgres (or into OpenSearch, despite a `forum_thread` index being *queried* elsewhere in this codebase — nothing writes to it). The one already-sanctioned way to read topic data without a NodeBB login is NodeBB's own public, unauthenticated REST surface, carved out specifically for this in NodeBB's `jwt-auth.js` (`PUBLIC_GET_ALLOWLIST`):

- `GET {FORUM_API_URL}/api/recent` — the endpoint this feature calls. Returns recent topics with title, category (`{cid, name, ...}`), the topic-starter's user object, and topic-level counters (`postcount`, `upvotes`) already embedded — no per-topic follow-up request needed.
- `GET {FORUM_API_URL}/api/topic/:tid` — full topic detail, including the real reply thread with `toPid` parent chains (not currently called; a future NodeBB-write-proxy feature would use this to render real replies).

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
| `commentCount` | `topic.postcount - 1` (postcount includes the topic's own opening post) |
| `likeCount` | `topic.upvotes` |
| `viewerHasLiked` | always `false` — `/api/recent` is guest-level and carries no per-viewer vote state |

`title`/`body` are run through `stripHtmlToPlainText` (`apps/web-api/src/utils/html-to-text.ts`) before being returned — NodeBB content can contain rendered HTML, and `sanitize-html` alone isn't enough (it re-escapes `&`/`<`/`>` in its output and inserts no whitespace at stripped block-tag boundaries), so this wraps it with an entity-decode pass and a block-boundary-to-space pass.

Forum posts have no `focusAreas` field — unlike team news items (which derive it from `Team.teamFocusAreas`), a NodeBB topic isn't tied to a team, and the real production NodeBB categories (`Intros`, `Talent`, `Launch`, `General`) are generic forum sections with no meaningful mapping onto the five news focus-area tab titles (`Digital Human Rights`, `Economies & Governance`, etc.). Don't add one back without a concrete, non-coincidental source for it — see the `category` field above for the one real per-topic classification NodeBB actually provides.

## Data model

Only Feed News comments and likes are persisted, both with a real, hard FK to `TeamNewsItem` (no forum-post soft reference anymore):

```prisma
model FeedComment {
  id          Int           @id @default(autoincrement())
  uid         String        @unique @default(cuid())
  newsItemUid String
  newsItem    TeamNewsItem  @relation(fields: [newsItemUid], references: [uid], onDelete: Cascade)
  parentUid   String?
  parent      FeedComment?  @relation("FeedCommentReplies", fields: [parentUid], references: [uid], onDelete: Cascade)
  replies     FeedComment[] @relation("FeedCommentReplies")
  text        String
  authorUid   String
  author      Member        @relation("MemberFeedComments", fields: [authorUid], references: [uid], onDelete: Cascade)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([newsItemUid, createdAt])
  @@index([parentUid])
  @@index([authorUid])
}

model FeedNewsLike {
  id          Int          @id @default(autoincrement())
  uid         String       @unique @default(cuid())
  newsItemUid String
  newsItem    TeamNewsItem @relation(fields: [newsItemUid], references: [uid], onDelete: Cascade)
  memberUid   String
  member      Member       @relation("MemberFeedNewsLikes", fields: [memberUid], references: [uid], onDelete: Cascade)
  createdAt   DateTime     @default(now())

  @@unique([newsItemUid, memberUid])
  @@index([newsItemUid])
  @@index([memberUid])
}
```

- **Replies are unlimited-depth**, self-referencing via `parentUid` — same parent/child shape as `ArticleComment`/`ArticleCommentLike` (there's no configured cap there either, so this doesn't introduce one). Deleting a comment cascades to all of its replies at any depth (`onDelete: Cascade` on `parentUid`).
- **`newsItemUid` is a real, hard FK** to `TeamNewsItem` now (not a soft reference) — there's only one item type left, so the earlier `Follow`-style polymorphism (`itemType` enum + soft `itemUid`) was removed as dead weight.
- **`authorUid` / `memberUid`** are hard FKs — the actor is always a real directory member, so these cascade-delete with the member (same as `ArticleComment.authorUid`).
- **`FeedNewsLike` is distinct from `TeamNewsUpvote`** — the latter is an older, unrelated per-team "I'm interested" feature used elsewhere (see `docs/` for team-news); this is the Home-feed-native like.
- **`@@unique([newsItemUid, memberUid])`** makes like/unlike idempotent, same as `TeamNewsUpvote`.

Migration: `apps/web-api/prisma/migrations/20260729120000_feed_comments_and_likes_news_only/` (drops and recreates both tables — no data migration, since this predates any production rollout).

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/v1/feed/forum-posts` | `UserTokenCheckGuard` (optional) | Live NodeBB topics. Returns `{ items: [] }` — not a 403 — for anonymous callers or signed-in members without `forum.read`. |
| POST | `/v1/feed/comments/counts` | none | Batch comment counts (including replies) for a list of news item uids. |
| GET | `/v1/feed/comments` | `UserTokenCheckGuard` (optional) | Threaded comments for one news item; anonymous callers get `isOwn: false` on every comment. |
| POST | `/v1/feed/comments` | `UserTokenValidation` (required) | Any signed-in member — no forum-access requirement. Pass `parentUid` to reply. |
| DELETE | `/v1/feed/comments/:commentUid` | `UserTokenValidation` (required) | Author-only; **403** for anyone else. Cascades to replies. |
| POST | `/v1/feed/news/:uid/like` | `UserTokenValidation` (required) | Any signed-in member — likes are our own surface, not forum-gated. Idempotent. |
| DELETE | `/v1/feed/news/:uid/like` | `UserTokenValidation` (required) | Idempotent. |

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
      "commentCount": 4,
      "likeCount": 5,
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

Accepts up to 200 news-item uids at once. A count includes replies at any depth. A uid with no comments is simply absent from `counts` — the frontend should default missing keys to `0`.

```bash
curl -X POST "http://localhost:3000/v1/feed/comments/counts" \
  -H "Content-Type: application/json" \
  -d '{"uids": ["cQjK2p0nzTeamNews1"]}'
```

```json
{ "counts": { "cQjK2p0nzTeamNews1": 2 } }
```

### List comments for a news item

`GET /v1/feed/comments?newsItemUid=cQjK2p0nzTeamNews1`

Threaded: top-level comments in `items`, each with a `replies` array (unlimited depth, same shape recursively). Every level is ordered oldest-first. `isOwn` is `true` only for the authenticated caller's own comments — always `false` for anonymous requests.

```bash
curl "http://localhost:3000/v1/feed/comments?newsItemUid=cQjK2p0nzTeamNews1" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "items": [
    {
      "uid": "cm1a2b3c4d5e",
      "newsItemUid": "cQjK2p0nzTeamNews1",
      "parentUid": null,
      "text": "Great update, congrats!",
      "author": { "uid": "cmpxsx1l900r7n54fh7dxyd79", "name": "self registered 1", "avatarUrl": null },
      "createdAt": "2026-07-08T10:15:00.000Z",
      "isOwn": true,
      "replies": [
        {
          "uid": "cm2b3c4d5e6f",
          "newsItemUid": "cQjK2p0nzTeamNews1",
          "parentUid": "cm1a2b3c4d5e",
          "text": "Agreed, exciting stuff.",
          "author": { "uid": "cmzxy1l900r7n54fh7dxyd12", "name": "another member", "avatarUrl": null },
          "createdAt": "2026-07-08T11:00:00.000Z",
          "isOwn": false,
          "replies": []
        }
      ]
    }
  ]
}
```

### Add a comment or reply

`POST /v1/feed/comments`

Body: `{ newsItemUid: string, parentUid?: string, text: string (1-2000 chars) }`. The news item must exist (`404` otherwise). If `parentUid` is set, it must reference an existing comment on the *same* `newsItemUid` (`400` otherwise) — replying across news items isn't possible.

```bash
curl -X POST "http://localhost:3000/v1/feed/comments" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"newsItemUid": "cQjK2p0nzTeamNews1", "text": "Great update, congrats!"}'
```

A reply:

```bash
curl -X POST "http://localhost:3000/v1/feed/comments" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"newsItemUid": "cQjK2p0nzTeamNews1", "parentUid": "cm1a2b3c4d5e", "text": "Agreed, exciting stuff."}'
```

```json
{
  "uid": "cm2b3c4d5e6f",
  "newsItemUid": "cQjK2p0nzTeamNews1",
  "parentUid": "cm1a2b3c4d5e",
  "text": "Agreed, exciting stuff.",
  "author": { "uid": "cmzxy1l900r7n54fh7dxyd12", "name": "another member", "avatarUrl": null },
  "createdAt": "2026-07-08T11:00:00.000Z",
  "isOwn": true,
  "replies": []
}
```

`401` if unauthenticated; `404` if `newsItemUid` doesn't exist; `400` if `parentUid` doesn't exist on that news item.

### Delete a comment

`DELETE /v1/feed/comments/:commentUid`

Author-only — there is no admin-override bypass (unlike NodeBB's own forum-comment permissions, which do allow Directory Admin to edit/delete any comment; this feed-comment surface currently doesn't mirror that). Deleting a comment with replies deletes the whole subtree (cascade).

```bash
curl -X DELETE "http://localhost:3000/v1/feed/comments/cm1a2b3c4d5e" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{ "uid": "cm1a2b3c4d5e", "deleted": true }
```

`404` if the comment doesn't exist; `403` if the caller isn't the author.

### Like / unlike a Feed News item

`POST` / `DELETE /v1/feed/news/:uid/like`

Idempotent both ways — liking an already-liked item, or unliking a never-liked one, both succeed and just return the current state. Not gated on `forum.read`: any signed-in member can like a news item.

```bash
curl -X POST "http://localhost:3000/v1/feed/news/cQjK2p0nzTeamNews1/like" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{ "likeCount": 1, "viewerHasLiked": true }
```

```bash
curl -X DELETE "http://localhost:3000/v1/feed/news/cQjK2p0nzTeamNews1/like" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{ "likeCount": 0, "viewerHasLiked": false }
```

## Batching pattern (no N+1)

`loadCommentCounts` computes counts for a whole page of news items in one `groupBy`, not one query per item — the same pattern `TeamNewsQueryService.loadUpvotes` already uses for news-item upvotes:

```ts
const grouped = await prisma.feedComment.groupBy({
  by: ['newsItemUid'],
  where: { newsItemUid: { in: uids } },
  _count: { _all: true },
});
```

reduced to a `Map<uid, count>` and looked up per item while building the response.
