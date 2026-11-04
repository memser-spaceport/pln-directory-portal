# Member signals

The member signal log (`MemberSignal`) is an append-only history of what logged-in members do in the directory. The
member interest profile ([MEMBER_INTEREST_PROFILE.md](./MEMBER_INTEREST_PROFILE.md)) is built from it. Tickets:
LAB-3121 (stored actions + backfill), LAB-3123 (views and clicks). Spec: `openspec/specs/member-signals`.

Code: `apps/web-api/src/member-signals/`.

## Row shape

| Column       | Meaning                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------- |
| `memberUid`  | The acting member. Rows cascade when the member is deleted; nothing else deletes or updates.  |
| `action`     | One of `MEMBER_SIGNAL_ACTIONS` (`member-signals.constants.ts`). Text, so no migration needed. |
| `entityType` | `TEAM`, `MEMBER`, `PROJECT`, `NEWS_ITEM`, `JOB_OPENING`.                                      |
| `entityUid`  | Uid of the entity. Not checked for existence on the endpoint.                                 |
| `own`        | The entity is the member, one of their teams (current or past), or belongs to them / a team.  |
| `sourceKey`  | `backfill:<table>:<uid>` for backfilled rows; `null` for live rows.                           |
| `createdAt`  | Time of the action (source record time for backfilled rows).                                  |

## Stored actions (written by the owning services)

| Action                                  | Entity      | Written by                                                                              |
| --------------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| `follow` / `unfollow`                   | TEAM        | `FollowsService` (member follow: not built)                                             |
| `news-upvote` / `news-upvote-removed`   | NEWS_ITEM   | `TeamNewsUpvotesService`                                                                |
| `news-like` / `news-like-removed`       | NEWS_ITEM   | `FeedLikesService`                                                                      |
| `news-comment`                          | NEWS_ITEM   | `FeedCommentsService` (every comment; no row on delete)                                 |
| `job-interest` / `job-interest-removed` | JOB_OPENING | `JobOpeningsInterestService`                                                            |
| `job-saved` / `job-unsaved`             | JOB_OPENING | `JobOpeningsSavedService`                                                               |
| `team-interest`                         | TEAM        | `JobOpeningsInterestService` (one-way)                                                  |
| `office-hours-booking-intent`           | MEMBER      | `OfficeHoursService.createInteraction` (`SCHEDULE_MEETING` with a target, after commit) |

A row is added only when stored state changed: a repeat follow / upvote / like / save adds nothing, and a removal adds a
row only when something was deleted. Services call `void memberSignals.record(...)` after their own write succeeded;
`record` never throws, so a signal failure is logged and never reaches the member.

## Views and clicks: `POST /v1/member-signals`

Logged-in only (`UserTokenValidation`); the member comes from the session. Body `{ action, entityType, entityId }`,
schema `MemberSignalBodySchema` in `libs/contracts/src/schema/member-signal.ts`.

| Action                 | Allowed `entityType`        |
| ---------------------- | --------------------------- |
| `view`                 | `member`, `team`, `project` |
| `search-result-click`  | `member`, `team`, `project` |
| `contact-click`        | `member`                    |
| `contact-copy`         | `member`                    |
| `github-project-click` | `member`                    |
| `team-contact-click`   | `team`                      |
| `project-link-click`   | `project`                   |

Answers: `204` (also when the member is excluded or the view was already logged today), `400` for an unknown action /
entity type, a pair not in the table, an empty or > 64 character `entityId`, or extra fields; `401` without a valid
session or member. `view` is kept to one row per member, entity and UTC day; clicks and copies are never deduplicated.

## Exclusions

`isExcludedMember` (`member-exclusion.ts`): sign-up source `system-trending-seed` (news trending bots) or an email
domain in `TEST_ACCOUNT_EMAIL_DOMAINS` (`yopmail.com`). Excluded members add no rows and get no profile.

## Analytics

Each added row sends the server event `member-signal-recorded` (`distinctId` = member uid, properties `action`,
`entityType`, `own`). Deduplicated, excluded and backfilled rows send nothing.

## Backfill (once per environment)

Copies the current `Follow`, `TeamNewsUpvote`, `FeedNewsLike`, `FeedComment`, `JobOpeningInterest`, `SavedJobOpening`,
`TeamInterest` and `MemberInteraction` (`SCHEDULE_MEETING` with a target) records. Deleted records and repeat or removal
history cannot be recovered.

```bash
yarn api:backfill-member-signals                 # dry run: per-table counts, writes nothing
yarn api:backfill-member-signals --apply         # write
yarn api:backfill-member-signals --apply --batch=500
```

Re-runnable: rows are keyed by `sourceKey` and inserted with `skipDuplicates`. Records created at or after the first
live row of the same action are skipped, because the live writer already logged them.
