# Newsfeed: Feed Comments & Likes

> Status: **Shipped.** Forum posts are no longer proxied by this backend — see "Forum posts moved to the frontend" below. Comments and likes are directory-native, Feed-News-only, and never synced to NodeBB.

Lets any signed-in member **comment on** (with unlimited-depth replies) and **like** a **Feed News item** inline on the home newsfeed, without leaving the feed.

- **Comments and likes** are **100% directory-native**, stored only in this app's DB, and only ever attach to a `TeamNewsItem`. A comment is *not* a NodeBB reply, and a like is *not* a NodeBB upvote — NodeBB has no "like" concept at all, only upvote/downvote, and this feature doesn't touch that.
- There is no local comment/like feature on **forum posts** — see below for why, and where forum posts live now.

## Forum posts moved to the frontend

Forum/discussion post cards (NodeBB topics surfaced alongside team news on Home) used to be a read-through proxy in this backend (`GET /v1/feed/forum-posts`, backed by `ProtosphereApiClient.getRecentTopics()`). That endpoint has been **removed**. The frontend (`pln-directory-portal-v2`) now calls NodeBB directly for forum posts, using the same `FORUM_API_URL`/`CUSTOM_FORUM_AUTH_TOKEN` convention its existing `services/forum/hooks/*` already use for the standalone `/forum` pages — see `services/feed/feed.service.ts` there.

This backend has no forum-posts code left:
- `apps/web-api/src/feed/feed-forum-posts.service.ts` — deleted.
- `apps/web-api/src/forum/protosphere-api.client.ts` — stripped down to `isGroupMember()` only (used by the unrelated `GET /v1/forum/check-group-access` endpoint, which predates and is independent of forum posts — see `apps/web-api/src/forum/forum.controller.ts`).
- `libs/contracts/src/schema/feed.ts` / `contract-feed.ts` — the `FeedForumPost*` schemas and `getFeedForumPosts` route are gone.

Don't re-add a backend forum-posts proxy without a new product decision — the frontend already talks to NodeBB directly for the `/forum` pages, so a backend passthrough for the newsfeed cards was redundant.

### Why forum posts have no local comment/like feature

Earlier versions of this feature let `FeedComment`/`FeedForumPostLike` attach to either a news item or a synthetic `fp_<tid>` forum-post uid. That was reverted: **forum content belongs entirely to NodeBB's own DB, and this app's DB must never hold a shadow copy of it** — not the posts, and not comments/likes on them either. Writing a real comment/like on a forum post would mean writing through to NodeBB's own authenticated write API (e.g. `POST {FORUM_API_URL}/api/v3/topics/:tid` with `{ content, toPid? }`, forwarding the member's own bearer token) and reading its real reply thread (`GET {FORUM_API_URL}/api/topic/:tid`). That's a materially larger, separate integration and a new product decision — and as of now, the frontend reply/comment UI for this isn't built either, so it isn't attempted anywhere, backend or frontend.

## Data model

Only Feed News comments and likes are persisted, both with a real, hard FK to `TeamNewsItem` (no forum-post soft reference):

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
- **`newsItemUid` is a real, hard FK** to `TeamNewsItem` — there's only one item type these tables ever attach to, so the earlier `Follow`-style polymorphism (`itemType` enum + soft `itemUid`) was removed as dead weight.
- **`authorUid` / `memberUid`** are hard FKs — the actor is always a real directory member, so these cascade-delete with the member (same as `ArticleComment.authorUid`).
- **`FeedNewsLike` is distinct from `TeamNewsUpvote`** — the latter is an older, unrelated per-team "I'm interested" feature used elsewhere (see `docs/` for team-news); this is the Home-feed-native like.
- **`@@unique([newsItemUid, memberUid])`** makes like/unlike idempotent, same as `TeamNewsUpvote`.

Migration: `apps/web-api/prisma/migrations/20260729120000_feed_comments_and_likes_news_only/` (drops and recreates both tables — no data migration, since this predates any production rollout).

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/v1/feed/comments/counts` | none | Batch comment counts (including replies) for a list of news item uids. |
| GET | `/v1/feed/comments` | `UserTokenCheckGuard` (optional) | Threaded comments for one news item; anonymous callers get `isOwn: false` on every comment. |
| POST | `/v1/feed/comments` | `UserTokenValidation` (required) | Any signed-in member — no forum-access requirement. Pass `parentUid` to reply. |
| DELETE | `/v1/feed/comments/:commentUid` | `UserTokenValidation` (required) | Author-only; **403** for anyone else. Cascades to replies. |
| POST | `/v1/feed/news/:uid/like` | `UserTokenValidation` (required) | Any signed-in member — likes are our own surface, not forum-gated. Idempotent. |
| DELETE | `/v1/feed/news/:uid/like` | `UserTokenValidation` (required) | Idempotent. |

Contracts: `libs/contracts/src/lib/contract-feed.ts` + `libs/contracts/src/schema/feed.ts`. Implementation: `apps/web-api/src/feed/`.

Examples below use a member access token (`-H "Authorization: Bearer $TOKEN"`).

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
