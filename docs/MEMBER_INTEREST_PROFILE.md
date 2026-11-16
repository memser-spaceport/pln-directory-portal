# Member interest profile

A stored, per-member profile of topics, entities and expertise (LAB-3122), built daily from the member signal log
([MEMBER_SIGNALS.md](./MEMBER_SIGNALS.md)) and the interests members declare. v0 only collects: **no member-facing
endpoint returns it, and one feature reads it, behind a flag that is off by default**
([News starting tags](#news-starting-tags)), until the LAB-3124 pilot passes. Spec: `openspec/specs/member-interest-profile`.

Code: `apps/web-api/src/member-interest-profile/`. All tunables are in `member-interest-profile.constants.ts`; all
scoring rules are in the pure `build-profile.ts`.

## Storage

`MemberInterestProfileEntry`: one row per member, `kind` and `key`, with a `score`.

| `kind`      | `key`                                                           |
| ----------- | --------------------------------------------------------------- |
| `TOPIC`     | focus-area slug (`slugify(FocusArea.title)`, same as news tags) |
| `ENTITY`    | `TEAM:<uid>`, `MEMBER:<uid>`, `PROJECT:<uid>`                   |
| `EXPERTISE` | focus-area slug                                                 |

`MemberInterestProfileRun` records each rebuild (trigger, status, counts, error) and serializes rebuilds across API
instances.

## Sources

- **Signal log rows** (follows, news upvotes/likes/comments, job interest, saved jobs, team interest, office hours
  booking intents, views and clicks). Weights: `SIGNAL_WEIGHTS`.
- **Team roles**: the current team adds its focus areas at a fixed low weight and is never an entity; a past team
  (role `endDate` passed) is a weak interest, aging from the end date.
- **Held office hours meetings**: `SCHEDULE_MEETING` interactions whose follow-ups carry feedback.
- **IRL attendance**: `PLEventGuest.topics` that match a focus area.
- **Job referrals** made by the member: the referred member and the job's team.
- **Declared**: skills, custom skills and office hours interests that match a focus area (no decay).
- **Saved news tags** (`preferences.newsTags`): read only, never changed (no decay).
- **Expertise**: the member's own news posts, and their comments on own-team news.

## Rules

- Weight × 0.5^(age / half-life). Half-life: `MEMBER_INTEREST_HALF_LIFE_DAYS`, default 90. No action is dropped.
- The n-th repeat of the same action on the same item adds 0.5^n of the first; different items count in full.
- A removal row (`unfollow`, `news-like-removed`, ...) cancels earlier rows of the action it removes on that item.
- Rows marked `own` (own profile, own teams, own team's news, jobs and projects) add nothing to interests.
- News: its focus-area tags as topics, and half its weight to the news team as an entity.
- A member entity adds half its weight to the focus areas of that member's current teams.
- Trending-seed bots and test accounts (`isExcludedMember`) get no profile and add nothing to others.

## Rebuild

- Cron `MEMBER_INTEREST_PROFILE_CRON`, default `0 4 * * *` UTC. One instance wins the claim (advisory lock + the run
  table); a cron run is skipped when a cron rebuild already finished that UTC day. A RUNNING row older than 3 hours is
  treated as crashed.
- Members are processed in uid order, 500 per batch; each batch's rows are replaced in one transaction. Rows of
  members that were deleted or became excluded are removed at the end.
- Each finished run sends `member-interest-profile-computed` (`membersCount`, `nonEmptyCount`, `durationMs`).

## News starting tags

A member with no saved news tags gets starting tags. That is a member who never saved a list, and a member who saved
an empty one (removed every tag). With `NEWS_PROFILE_STARTING_TAGS_ENABLED=true` the starting tags come from their
profile: the `TOPIC` entries with a positive score that are news tags, the 5 with the highest scores (ties by slug).
A member with no such entry gets the focus areas of their teams, as with the flag off. The profile already holds the
current team's focus areas at a low weight, so they compete for those 5 places with everything else.

- Starting tags are what News preferences shows as selected (`newsTagsSeeded: true`), and what For You and the digest
  tag picks (`NEWS_TAG_PICKS_ENABLED`) match on. They are never stored.
- A saved list with 1 or more tags always wins: the profile is not read for that member.
- A saved empty list stays stored as `[]`, and the member gets starting tags again on every read. A member cannot keep
  "no tags".
- Saved tags feed the profile as declared topics (see Sources); starting tags do not.
- The flag is read on every call; anything but `true` is off, and then the profile table is not queried. It stays off
  in an environment until the LAB-3124 pilot passes.

Code: `NewsTagVocabularyService.seedTagsForMembers` in `apps/web-api/src/team-news/news-tag-vocabulary.service.ts`.

## Admin API (`AdminAuthGuard`, `DIRECTORY_FULL`)

```http
GET  /v1/admin/member-interest-profiles?memberUids=uid1,uid2&top=5&page=1&limit=20
POST /v1/admin/member-interest-profiles/rebuild      → 202 { runId } | 409 while a rebuild runs
```

The read returns `{ page, limit, total, items }`; each item has `memberUid`, `name`, and the `top` highest `topics`
(`slug`, `score`), `entities` (`type`, `uid`, `name`, `score`) and `expertise`. At most 100 members per request; `top`
1–50 (default 5). A member with no profile comes back with empty lists.
