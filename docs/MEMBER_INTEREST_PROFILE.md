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
an empty one (removed every tag). The starting tags come from the first source that has a news tag:

1. With `NEWS_PROFILE_STARTING_TAGS_ENABLED=true`, the member's profile: the `TOPIC` entries with a positive score
   that are news tags, the 5 with the highest scores (ties by slug). The profile already holds the current team's
   focus areas at a low weight, so they compete for those 5 places with everything else.
2. The member's stored AI news tags (see [AI news tags](#ai-news-tags)).
3. The focus areas of their teams.

- Starting tags are what News preferences shows as selected (`newsTagsSeeded: true`), and what For You and the digest
  tag picks (`NEWS_TAG_PICKS_ENABLED`) match on. Reading them stores nothing.
- A saved list with 1 or more tags always wins: the profile is not read for that member.
- A saved empty list stays stored as `[]`, and the member gets starting tags again on every read. A member cannot keep
  "no tags".
- Saved tags feed the profile as declared topics (see Sources); starting tags do not.
- The flag is read on every call; anything but `true` is off, and then the profile table is not queried. It stays off
  in an environment until the LAB-3124 pilot passes.

Code: `NewsTagVocabularyService.startingTagsForMembers` in `apps/web-api/src/team-news/news-tag-vocabulary.service.ts`.

## AI news tags

A member with no saved news tags and no usable profile topic gets news tags picked by a language model, stored in
`MemberNewsTagSuggestion` (one row per member). They are a starting-tags source, so For You and the digest use them
before the member approves anything. Building them never reads the interest profile.

**Generation.** An hourly job (`NewsDefaultTagsJob`, minute 20) runs where `NEWS_DEFAULT_TAGS_JOB_ENABLED=true`. The
API never calls the model.

- A member is due when they have no row, were last looked at 7 or more days ago, or had a failed generation 1 or more
  days ago. Deleted members, bots and test accounts are never due.
- One run looks at up to 200 due members and makes at most 50 model calls. Every member it looks at gets
  `lastAttemptAt = now`; that write is also the claim that keeps two API instances off the same member.
- No model call for a member with saved tags, with a usable profile topic (flag on), or with nothing to read.
- The model reads bio, skills, office hours topics, teams (role, description, focus areas) and projects. No email,
  handle or phone. Provider: `NEWS_DEFAULT_TAGS_AI_PROVIDER`, else the default provider.
- The reply is filtered by the news tag list. 3 to 6 tags are stored. Fewer than 3, or a failed call, stores no tags
  and keeps the earlier ones.
- Tags are made again only when a hash of the text sent to the model changed. The same text is tried at most 3
  times.

**Card API** (`UserTokenValidation`, the caller only).

```http
GET  /v1/team-news/default-tags          → { tags: [{ slug, title }], source, approved, approvedAt, generatedAt }
POST /v1/team-news/default-tags/approve  { tags?: string[] } → the same shape, after the call
```

`source` is `member-set` (a saved list of 1 or more tags), `interest-profile`, `ai` or `team`. `approved` is true for
a saved list, or once the member answered the card. The POST without `tags` only sets `approvedAt`; with `tags` it
saves them as the member's own news tags first (an unknown slug or an empty list is a 400, nothing stored). Approval
never changes which tags are in use, and a later refresh keeps it.

**Events.** `team-news-default-tags-generated` and `team-news-default-tags-generation-failed` (distinct id
`system:news-default-tags`; member uid, counts, model, duration, trigger `created` or `refreshed`, failure reason);
`team-news-default-tags-approved` and `team-news-default-tags-replaced` (the member; source, shown and saved counts).

Code: `apps/web-api/src/team-news/news-default-tags.service.ts`, `news-default-tags.job.ts`.

## Admin API (`AdminAuthGuard`, `DIRECTORY_FULL`)

```http
GET  /v1/admin/member-interest-profiles?memberUids=uid1,uid2&top=5&page=1&limit=20
POST /v1/admin/member-interest-profiles/rebuild      → 202 { runId } | 409 while a rebuild runs
```

The read returns `{ page, limit, total, items }`; each item has `memberUid`, `name`, and the `top` highest `topics`
(`slug`, `score`), `entities` (`type`, `uid`, `name`, `score`) and `expertise`. At most 100 members per request; `top`
1–50 (default 5). A member with no profile comes back with empty lists.
