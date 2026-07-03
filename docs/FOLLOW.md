# Follow (Teams)

> Status: **Shipped — teams only.** The storage model and contracts are designed to extend to other followable entities (members) without a schema change.

Lets a member **follow** and **unfollow** teams, see the **teams they follow**, and (for a team's own members and directory admins) see **who follows a team**. Following also personalizes the rest of the directory: the teams list and the team-news feed expose an `isFollowed` flag, followed-team news is surfaced first, and the `TEAM_NEWS` push notification names the teams a member actually follows.

The follow relationship lives in a single **polymorphic `Follow` table** (`memberUid` → `entityType` + `entityUid`). Today only `entityType = TEAM` rows exist; member-follows-member is added later by writing `entityType = MEMBER` rows — no migration to the table shape required.

## Data model

```prisma
enum FollowEntityType {
  TEAM
  MEMBER
}

model Follow {
  id         Int              @id @default(autoincrement())
  uid        String           @unique @default(cuid())
  member     Member           @relation("MemberFollowing", fields: [memberUid], references: [uid], onDelete: Cascade)
  memberUid  String
  entityType FollowEntityType @default(TEAM)
  entityUid  String
  createdAt  DateTime         @default(now())
  updatedAt  DateTime         @updatedAt

  @@unique([memberUid, entityType, entityUid])
  @@index([entityType, entityUid])
  @@index([memberUid, entityType])
}
```

- **`memberUid`** is the follower. It is a real FK to `Member.uid` with `onDelete: Cascade`, so deleting a member removes all of their follows.
- **`entityType` + `entityUid`** is the followed thing. `entityUid` is **intentionally not a hard FK** — it references different tables per `entityType` (`Team.uid` for `TEAM`, `Member.uid` for `MEMBER` later). Cleanup of a deleted followed entity is handled in the service layer / by that entity's own cascades.
- **`@@unique([memberUid, entityType, entityUid])`** makes follow/unfollow idempotent and prevents duplicate edges.
- The two indexes serve the two read directions: `(entityType, entityUid)` for "who follows this entity" and `(memberUid, entityType)` for "what does this member follow".

Migration: `apps/web-api/prisma/migrations/20260629120000_add_follow/`.

## Endpoints

| Method | Path                                  | Auth                             | Notes                                                                                                   |
| ------ | ------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| POST   | `/v1/teams/:teamUid/follow`           | `UserTokenValidation` (required) | Follow a team. Idempotent.                                                                              |
| DELETE | `/v1/teams/:teamUid/follow`           | `UserTokenValidation` (required) | Unfollow a team. Idempotent.                                                                            |
| GET    | `/v1/members/me/following/teams`      | `UserTokenValidation` (required) | Teams the caller follows, paginated, most-recent-follow first.                                          |
| GET    | `/v1/teams/:teamUid/followers`        | `UserTokenValidation` (required) | A team's followers. **403** unless caller is a member of the team or a directory admin.                 |
| GET    | `/v1/teams`                           | `UserTokenCheckGuard` (optional) | Existing endpoint; each team now carries `isFollowed`.                                                  |
| GET    | `/v1/teams-search`                    | `UserTokenCheckGuard` (optional) | Advanced team search; supports `followingOnly`, returns `followingTotal`, stamps `isFollowed` per team. |
| GET    | `/v1/teams/:uid`                      | `UserTokenCheckGuard` (optional) | Team detail; carries `isFollowed` for the authenticated caller.                                         |
| GET    | `/v1/team-news`                       | `UserTokenCheckGuard` (optional) | Existing endpoint; items carry `isFollowed`; followed-team news ordered first.                          |
| GET    | `/v1/team-news/grouped-by-focus-area` | `UserTokenCheckGuard` (optional) | Existing endpoint; `isFollowed` + followed-first within each group.                                     |
| GET    | `/v1/teams/:teamUid/team-news`        | `UserTokenCheckGuard` (optional) | Existing endpoint; items carry `isFollowed`.                                                            |

Endpoints requiring auth use `UserTokenValidation` (rejects with **401** when no/invalid token). The read endpoints above that use the **optional** `UserTokenCheckGuard` remain public: an anonymous caller gets `isFollowed: false` everywhere, `followingTotal: 0`, and an empty list when `followingOnly=true`.

Contracts: `libs/contracts/src/lib/contract-follow.ts` + `libs/contracts/src/schema/follow.ts`. Implementation: `apps/web-api/src/follows/`.

Examples below use a member access token (`-H "Authorization: Bearer $TOKEN"`) and the seeded local data where the **Directory Admin** member follows _Murazik, Leannon and Cremin_, _Ernser, Borer and Zboncak_, and _Beer - Stamm_.

### Follow a team

`POST /v1/teams/:teamUid/follow`

Idempotent — following an already-followed team returns `201` with the same state. The response reflects the resulting follow state and the team's current follower count, so a UI can toggle off a single field.

```bash
curl -X POST "http://localhost:3000/v1/teams/uid-murazik-leannon-and-cremin/follow" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "following": true,
  "entityType": "TEAM",
  "entityUid": "uid-murazik-leannon-and-cremin",
  "followerCount": 1
}
```

`404` if the team does not exist; `401` if unauthenticated.

### Unfollow a team

`DELETE /v1/teams/:teamUid/follow`

Idempotent — unfollowing a team you don't follow returns `200` with `following: false`.

```bash
curl -X DELETE "http://localhost:3000/v1/teams/uid-murazik-leannon-and-cremin/follow" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "following": false,
  "entityType": "TEAM",
  "entityUid": "uid-murazik-leannon-and-cremin",
  "followerCount": 0
}
```

### List teams I follow

`GET /v1/members/me/following/teams?page=1&limit=50`

Paginated, most-recently-followed first. `page` defaults to `1`, `limit` defaults to `50` (max `200`). A followed team that no longer exists is dropped from the list.

```bash
curl "http://localhost:3000/v1/members/me/following/teams?page=1&limit=50" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "page": 1,
  "limit": 50,
  "total": 3,
  "items": [
    {
      "uid": "uid-murazik-leannon-and-cremin",
      "name": "Murazik, Leannon and Cremin",
      "logoUrl": "https://loremflickr.com/640/480/animals",
      "followedAt": "2026-06-28T17:32:42.747Z",
      "followerCount": 1
    },
    {
      "uid": "uid-ernser-borer-and-zboncak",
      "name": "Ernser, Borer and Zboncak",
      "logoUrl": "https://loremflickr.com/640/480/animals",
      "followedAt": "2026-06-27T17:32:42.747Z",
      "followerCount": 1
    },
    {
      "uid": "uid-beer---stamm",
      "name": "Beer - Stamm",
      "logoUrl": "https://loremflickr.com/640/480/animals",
      "followedAt": "2026-06-26T17:32:42.747Z",
      "followerCount": 3
    }
  ]
}
```

### List a team's followers

`GET /v1/teams/:teamUid/followers?page=1&limit=50`

Restricted: the caller must be a **member of the team** or a **directory admin**, otherwise the endpoint returns `403`. Followers are returned most-recent-follow first, paginated.

```bash
# Called by the Directory Admin (admins can view any team's followers;
# team members can view their own team's)
curl "http://localhost:3000/v1/teams/uid-beer---stamm/followers?page=1&limit=50" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "teamUid": "uid-beer---stamm",
  "teamName": "Beer - Stamm",
  "page": 1,
  "limit": 50,
  "total": 3,
  "items": [
    { "uid": "uid-bud", "name": "Bud", "imageUrl": null, "followedAt": "2026-06-29T12:51:35.053Z" },
    { "uid": "uid-coby", "name": "Coby", "imageUrl": null, "followedAt": "2026-06-28T16:51:35.053Z" },
    {
      "uid": "uid-directoryadmin",
      "name": "Directory Admin",
      "imageUrl": null,
      "followedAt": "2026-06-26T17:32:42.747Z"
    }
  ]
}
```

A caller who is neither a member of the team nor a directory admin:

```json
{ "statusCode": 403, "message": "Only members of this team can view its followers" }
```

`404` if the team does not exist.

## Integrations with existing endpoints

### `isFollowed` on the teams list

`GET /v1/teams` resolves the caller's followed-team set once per request and stamps an `isFollowed` boolean onto every team in the response (no per-row query). Anonymous callers get `false` for all teams.

```bash
curl "http://localhost:3000/v1/teams?limit=3" -H "Authorization: Bearer $TOKEN"
```

```jsonc
{
  "count": 160,
  "teams": [
    {
      "uid": "uid-murazik-leannon-and-cremin",
      "name": "Murazik, Leannon and Cremin",
      "isFollowed": true,
      "...": "..."
    },
    { "uid": "uid-kuhn-group", "name": "Kuhn Group", "isFollowed": false, "...": "..." }
  ]
}
```

### `followingOnly` + `followingTotal` on team search

`GET /v1/teams-search` is the endpoint used by the `/teams` page. It accepts all existing filter params plus:

- **`followingOnly=true`** — return only teams the caller follows, intersected with the other active filters. Anonymous callers get an empty list (`total: 0`).
- **`followingTotal`** — in the response, the count of followed teams matching the current filters (for a "Following (N)" tab badge). `0` when anonymous.

Each team in `teams` also carries `isFollowed` (same stamping as `GET /v1/teams`).

```bash
curl "http://localhost:3000/v1/teams-search?followingOnly=true&page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

```jsonc
{
  "teams": [
    { "uid": "uid-murazik-leannon-and-cremin", "name": "Murazik, Leannon and Cremin", "isFollowed": true, "...": "..." }
  ],
  "total": 1,
  "followingTotal": 1,
  "page": 1,
  "hasMore": false
}
```

When `followingOnly` is absent, `total` is the full filtered count and `followingTotal` is the followed subset.

### `isFollowed` on team detail

`GET /v1/teams/:uid` stamps `isFollowed` on the team payload for the authenticated caller. Anonymous callers get `isFollowed: false`. Follow/unfollow mutations remain on `POST`/`DELETE /v1/teams/:teamUid/follow`.

### `isFollowed` + followed-first ordering on team news

`GET /v1/team-news`, `GET /v1/team-news/grouped-by-focus-area`, and `GET /v1/teams/:teamUid/team-news` each stamp `isFollowed` on every item. On the flat list and within each focus-area group, **news from followed teams is ordered ahead of the rest** (preserving `eventDate desc` within each segment). The flat list paginates across two ordered segments (followed teams, then everyone else) so the global ordering stays stable across pages.

```bash
curl "http://localhost:3000/v1/team-news?limit=5&windowDays=365" -H "Authorization: Bearer $TOKEN"
```

```jsonc
{
  "page": 1,
  "limit": 5,
  "total": 17,
  "items": [
    { "teamName": "Murazik, Leannon and Cremin", "isFollowed": true, "...": "..." },
    { "teamName": "Ernser, Borer and Zboncak", "isFollowed": true, "...": "..." },
    { "teamName": "Kuhn Group", "isFollowed": false, "...": "..." }
  ]
}
```

### Personalized `TEAM_NEWS` notification copy

`TEAM_NEWS` is a single **public broadcast** row — one copy is stored at ingest time naming the run's most-recent teams. When a member fetches their notifications (`getForUser`), the copy is **rewritten per-recipient**: teams the member follows are floated to the front and named, so the description reads e.g. _"New updates from companies like Lido Finance, Lava Network + 40 more"_ with the member's followed teams first. When the member follows none of the run's teams, the stored most-recent copy is shown unchanged. The rewrite is in-memory only (never persisted), and the reordered `teamUids` plus a `followedTeamUids` list are added to the returned notification's `metadata` for the client.

See also [PUSH_NOTIFICATIONS.md](./PUSH_NOTIFICATIONS.md) and the team-news feature notes.

## Extending to members (future)

The model and surface were built so that "follow a member" is additive:

1. Write `Follow` rows with `entityType = MEMBER` and `entityUid = <Member.uid>` — no migration to the `Follow` table.
2. Add member-scoped routes mirroring the team ones, e.g. `POST /v1/members/:memberUid/follow` and `GET /v1/members/me/following/members`.
3. Reuse the existing service methods by parameterizing them on `FollowEntityType` (the team methods are thin wrappers over the same queries).

The `(entityType, entityUid)` and `(memberUid, entityType)` indexes already cover both read directions for any entity type.
