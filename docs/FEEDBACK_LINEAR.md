# Feedback → Linear

## Overview

LabOS product feedback becomes a Linear issue that the team can triage and, once triaged, hand to Horizon AutoDev.
Code: `apps/web-api/src/feedback-linear/`. Spec: OpenSpec capability `feedback-linear-sync`.

Pushes are asynchronous. A submission saves its row and an outbox row, and returns. A background worker
creates the Linear issue later, retrying on failure. Submitting feedback never waits on Linear and never fails
because of it.

## What is pushed, and where

| Source | Which items | Linear team / state | Project |
|---|---|---|---|
| `POST /v1/contact-support` | Topics `Give feedback`, `Share an idea`, `Report a bug`, `AI Apps Feedback` (the AI Apps drawer's "LabOS - AI Apps" option) from a **verified member** | `FEEDBACK_LINEAR_PLATFORM_TEAM_ID`, state `FEEDBACK_LINEAR_PLATFORM_STATE_ID` | `FEEDBACK_LINEAR_AI_APPS_PROJECT_ID` for `AI Apps Feedback`, none otherwise |

- **Not pushed:** `Contact support`, `Ask a question` and any other topic. Telegram and email are sent for every
  topic, as before.
- **Verified member:** `metadata.uid` names a `Member` whose email equals the request email (case-insensitive).
  `/v1/contact-support` is public, so this check keeps anonymous posts out of the backlog.
- **Intake state:** issues land in the configured backlog-type state (LAB `Backlog` in prod). Never configure
  Todo or a started state. The AutoDev gate acts on Todo, and an issue must be triaged first.

## Issue content

- **Title:** `[Feedback] <first line of the message as plain text, ≤ 80 chars>`, or `[Feedback] <topic>` when the
  message is empty.
- **Body** (markdown), in order:
  1. `Reported by [<member name>](<WEB_UI_BASE_URL>/members/<uid>) · <topic> · <ENVIRONMENT>`
  2. `Page: <metadata.page>`, when it is an http(s) URL
  3. `## What they said`: the message converted from Quill HTML to markdown
  4. `## Screenshots`: images copied into Linear (see below)
  5. `## Context`: `metadata.context` as JSON, when present
  6. `## Expected result`: a placeholder to fill in during triage, before moving to Todo
  7. The `ContactSupportRequest` uid
- **Labels:** `FEEDBACK_LINEAR_LABEL_ID` (`User feedback`) plus one Type label, matched by name among the team's
  labels in the `Type` group:
  - `Report a bug`, or `metadata.reportKind = bug` → `Bug`
  - `Share an idea` → `Feature`
  - anything else → `Improvement`
  - A missing Type label is skipped.
- **Priority:** `metadata.priority` `P0`/`P1`/`P2`/`P3` → Urgent/High/Medium/Low; none otherwise.
- **No Scope, Department, Domain or agent labels, and no assignee.** Triage adds them.
- **Creator:** the Linear OAuth app, with `createAsUser` = the member's name.

### Privacy

The reporter is named and linked to their LabOS profile. **Their email never appears in the issue.** If they
typed it into the message, it is replaced with `[email hidden]`. Analytics events carry no email and no feedback
text.

### Images

- **Which copy:** each `<img>` in the message is copied into Linear's file storage and embedded. When the
  `<img>` has `data-flat-src` (a copy with the member's drawing merged in, sent by the AI Apps drawer), that
  copy is used.
- **Fetch limits:** the server downloads only over https, from hosts in `FEEDBACK_LINEAR_IMAGE_HOSTS`, at most
  10 MB, within 10 s, with no redirects, and only `image/*` responses.
- **Fallback:** any other image, or a failed copy, becomes a plain link.

## Delivery

- **Outbox:** table `FeedbackLinearIssue`, one row per item, unique on `(sourceType, sourceUid)` and with no FK to
  the source.
- **Fixed at enqueue:** the target team and project are frozen when the row is created. The Linear issue id
  (`linearIssueId`) is generated then too.
- **Worker:** `FeedbackLinearWorker` runs on `FEEDBACK_LINEAR_SYNC_CRON` (default every 15 s) and does nothing
  when Linear is not configured.
- **Claiming:** each tick claims up to 10 due rows with a conditional update plus a 2-minute lease, so several
  API instances never push the same row.
- **One issue per item:** the issue is created with our own `linearIssueId`. A retry first looks that id up,
  and "already exists" counts as success.
- **Backoff:** 30 s doubling, capped at 1 h. A Linear `Retry-After` wait that is longer is used instead.
- **Giving up:** after `FEEDBACK_LINEAR_MAX_ATTEMPTS` (default 8, about 30 minutes of retries) the row becomes
  `FAILED` with `lastError`. A missing source row or reporter fails it at once.
- **Analytics:** events `feedback-linear-pushed` and `feedback-linear-failed` carry `sourceType`, `attempts` and
  `teamId`.

### Re-queue failed pushes

After fixing the cause (for example, config), run this manually per environment:

```sql
UPDATE "FeedbackLinearIssue"
SET status = 'PENDING', attempts = 0, "nextAttemptAt" = now(), "leaseUntil" = NULL
WHERE status = 'FAILED'
  AND "createdAt" > now() - interval '7 days';   -- narrow as needed
```

## Configuration

Linear is **off** unless the client id and secret, the platform team and the intake state are all set. With
nothing set, the API boots and contact-support behaves exactly as without this feature.

| Variable | Default | Meaning |
|---|---|---|
| `FEEDBACK_LINEAR_CLIENT_ID` / `FEEDBACK_LINEAR_CLIENT_SECRET` | – | Linear OAuth app with the client-credentials grant (scopes `read,write`). The token is kept in memory only. |
| `FEEDBACK_LINEAR_PLATFORM_TEAM_ID` | – | Team for platform feedback (LAB in prod; a private test team in dev) |
| `FEEDBACK_LINEAR_PLATFORM_STATE_ID` | – | Intake state, a backlog-type state of that team |
| `FEEDBACK_LINEAR_AI_APPS_PROJECT_ID` | none | Project for `AI Apps Feedback` issues |
| `FEEDBACK_LINEAR_LABEL_ID` | none | The `User feedback` label |
| `FEEDBACK_LINEAR_IMAGE_HOSTS` | `<AWS_S3_IMAGE_BUCKET_NAME>.s3.<AWS_REGION>.amazonaws.com`, plus the `AWS_S3_DOMAIN` and `WORKER_IMAGE_URL` hosts | Comma-separated hosts images may be downloaded from |
| `FEEDBACK_LINEAR_SYNC_CRON` | `*/15 * * * * *` | Worker schedule (6-field cron) |
| `FEEDBACK_LINEAR_MAX_ATTEMPTS` | `8` | Attempts before `FAILED` |

Secrets are set through `pl-infra-pipeline`, never committed.

## Adding a source

1. Add a value to the `FeedbackLinearSource` enum, with a migration.
2. Implement `FeedbackLinearSourceHandler` (`buildIssue(row)` returns the issue without its id) and register it
   with `FeedbackLinearHandlerRegistry` in `onModuleInit`.
   - Throw `FeedbackLinearPermanentError` for failures a retry can't fix.
3. Call `FeedbackLinearOutboxService.enqueue(...)` after the source row is saved, catching errors so the
   source's own request never fails.

`AI_APP_FEEDBACK` is already in the enum. Its handler is added by LAB-2873.
