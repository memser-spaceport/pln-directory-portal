# Design

## Context

- `ContactSupportService.createSupportRequest` (`apps/web-api/src/contact-support/`) saves a `ContactSupportRequest`. It then fires an SES email (if enabled) and a Telegram outbox message through `NotificationServiceClient`, and returns `{ uid }`.
  - The route is public: no auth guard, and v2's `/api/contact-support` proxy forwards no token. `metadata.uid`, `email` and `name` are client-supplied.
  - The global throttler (10 req/s per IP) sees the Next.js server's IP, so in practice it is one shared bucket.
- Both v2 dialogs upload pasted and captured images to `/v1/images` before submit, so the message holds `<img src="https://…">` URLs on the image storage host: the S3 object location `<bucket>.s3.<region>.amazonaws.com`, or `WORKER_IMAGE_URL` for IPFS, per `FILE_STORAGE`. Data URIs are already stripped server-side (`stripInlineDataImages`).
- `contact-support-html.ts` already has a tag tokenizer, href sanitizing and entity decoding for the Telegram rendering.
- `ScheduleModule.forRoot()` is registered. Jobs use `@Cron(process.env.X || '<default>', { name })` (see `ai-apps-session.service.ts`).
- web-api's Jest setup breaks on ESM packages (`@linear/sdk` is ESM); axios is available.
- LAB has no Triage state. Its backlog-type states are `Backlog` and `Review`.

## Goals / Non-Goals

**Goals:**
- A reusable Linear client and push outbox that LAB-2873 extends with a second source type, without schema changes to the outbox.
- Exactly-once issue creation in practice (idempotent create plus lease), safe across several API pods.
- The issue format is readable for the Horizon AutoDev gate once someone triages the issue into Todo.

**Non-Goals:**
- Linear → LabOS sync, webhooks, or any change to the contact-support response or UI.
- Putting the Linear issue link into the Telegram message (Telegram is sent synchronously before the issue exists).
- An admin UI or endpoint to list or retry failed pushes. Rows are inspectable in the DB.
- Backfilling requests created before deploy.

## Decisions

### D1. Plain GraphQL over axios, no Linear SDK
A small `LinearClient` posts to `https://api.linear.app/graphql` with a bearer token and maps errors to `LinearApiError { status, code, retryable }`.
- **Alternatives:** `@linear/sdk` is ESM and breaks Jest; the gain is typings we can hand-write for the ~6 operations used.

### D2. OAuth client credentials, token cached in memory
`POST https://api.linear.app/oauth/token` with `grant_type=client_credentials` and scopes `read,write,issues:create`. The token is cached with its `expires_in`, refreshed 5 minutes early, and invalidated and refetched once on a 401. Issues show the app as creator; `createAsUser` = the reporter's member name, so Linear displays "<name> (via LabOS Feedback)".
- **Alternatives:** a personal API key ties issues to a human account and a person's seat. Storing the token in the DB conflicts with the "no secrets in DB" rule.

### D3. One generic outbox table
```
FeedbackLinearIssue
  id, uid (cuid)
  sourceType     FeedbackLinearSource  (CONTACT_SUPPORT | AI_APP_FEEDBACK)
  sourceUid      String                -- no FK; @@unique([sourceType, sourceUid])
  teamId         String
  projectId      String?
  linearIssueId  String  @unique       -- UUID v4 we generate at enqueue
  status         FeedbackLinearStatus  (PENDING | SYNCED | FAILED)
  attempts       Int  @default(0)
  nextAttemptAt  DateTime @default(now())
  leaseUntil     DateTime?
  identifier     String?   url String?
  lastError      String?   -- truncated to 1000 chars, secrets never included
  createdAt, updatedAt
  @@index([status, nextAttemptAt])
```
The target team and project are frozen at enqueue, so a later config change doesn't move old items. `AI_APP_FEEDBACK` is declared now so LAB-2873 needs no enum migration.
- **Alternatives:** columns on `ContactSupportRequest` would need a second set on `AiAppFeedback`, plus duplicated workers.

### D4. Enqueue in the request, push in a worker
After `contactSupportRequest.create`, if the topic is pushable, Linear is configured and the reporter is verified (D7), insert the outbox row. An insert failure is logged and swallowed, like the Telegram call. Nothing calls Linear in the request path.

`FeedbackLinearWorker` runs `@Cron(FEEDBACK_LINEAR_SYNC_CRON || '*/15 * * * * *')` and is a no-op when unconfigured or when a previous tick is still running in this process. Each tick:
1. Select up to 10 ids with `status=PENDING AND nextAttemptAt<=now AND (leaseUntil IS NULL OR leaseUntil<now)`.
2. Claim each row with a conditional `updateMany` on that same predicate, setting `leaseUntil = now + 2 min`. Only rows with `count === 1` are processed, so pods never double-process.
3. Call the source handler, then write `SYNCED` (identifier, url, lease cleared) or the failure state.
- **Alternatives:** a Bull queue (Redis) adds a second source of truth, and jobs vanish on Redis flush. Postgres advisory locks don't map well onto per-row claims through Prisma.

### D5. Idempotent create
`issueCreate(input: { id: linearIssueId, … })` uses our own UUID. Before creating on a retry (`attempts > 0`), the worker queries `issue(id)`. If it exists, the row is marked `SYNCED` from it. An "already exists" error from create is handled the same way. This covers a timeout after Linear committed.

### D6. Backoff
`nextAttemptAt = now + min(30s · 2^(attempts-1), 1h)`. After `FEEDBACK_LINEAR_MAX_ATTEMPTS` (default 8, about 30 minutes of retries in total) the row becomes `FAILED`.
- **Non-retryable errors** (400 validation, unknown team/label/state) still count attempts, so a config fix plus a manual `UPDATE … SET status='PENDING', attempts=0` recovers them. The SQL goes in the docs.
- **Rate limits:** a 429 respects `Retry-After` if it is later than the backoff.

### D7. Reporter verification
Pushable only when `metadata.uid` resolves to a `Member` whose `email` equals the request email (lowercased). The member's DB `name` (not the client-sent `name`) is used for the reporter line and `createAsUser`. This keeps anonymous or spoofed posts out of the LAB backlog, because the public route's throttle is effectively global. All 12 feedback-topic requests in prod over the last 30 days were from signed-in users.
- **Alternatives:** pushing everything (spam risk into the backlog); requiring an auth token (needs a v2 proxy change and session plumbing for a public route).

### D8. HTML → markdown with the existing tokenizer
Add `toLinearMarkdown(html)` to `contact-support-html.ts`, next to `toSupportTelegramHtml`:
- Sanitize with DOMPurify first.
- Map the tags: `b`/`strong` → `**`, `i`/`em` → `_`, `a` → `[text](href)` with the existing `SAFE_HREF`, `h1-3` → `#`, `li` → `- `, block ends → newline.
- Collect `<img>` tags into a separate list (`{ src, flatSrc }`) rather than inlining them.
- Escape markdown control characters in text runs.

The title comes from the same plain-text pass.
- **Alternatives:** turndown or node-html-markdown would add a dependency for a format we already tokenize.

### D9. Images
For each collected image, the candidate URL is `flatSrc ?? src`. It is fetched only if it passes the host allowlist:
- **Allowlist:** `FEEDBACK_LINEAR_IMAGE_HOSTS`, comma-separated hostnames. When unset, it defaults to the hosts `/v1/images` returns: `<AWS_S3_IMAGE_BUCKET_NAME>.s3.<AWS_REGION>.amazonaws.com`, plus the hosts of `AWS_S3_DOMAIN` and `WORKER_IMAGE_URL` when set.
- **Fetch limits:** axios with `maxContentLength` 10 MB, 10 s timeout, `maxRedirects: 0`, and an `image/*` content-type check.
- **Upload:** `fileUpload(contentType, filename, size)`, then PUT to `uploadUrl` with the returned headers, then embed `assetUrl` as `![Screenshot n](assetUrl)`.
- **Failures:** each failure degrades to `[Screenshot n](original-url)`.

Uploads happen inside the claimed attempt. A retry re-uploads, which leaves orphaned Linear assets at worst, and that's acceptable.

### D10. Label, state and Type resolution
The `User feedback` label, intake state and project are explicit IDs from env (`FEEDBACK_LINEAR_LABEL_ID`, `FEEDBACK_LINEAR_PLATFORM_STATE_ID`, `FEEDBACK_LINEAR_AI_APPS_PROJECT_ID`), so a rename in Linear can't silently reroute.

The Type label is resolved by name (`Bug` / `Feature` / `Improvement`) among the team's labels whose parent group is named `Type`. The result is cached per team for 1 hour, and a missing label is skipped (spec: Labels and priority). The configured state is not validated against Todo at runtime: the ops Task (LAB-2870) owns choosing a backlog-type state, and the docs say so.

### D11. Config surface
| Var | Default | Meaning |
|---|---|---|
| `FEEDBACK_LINEAR_CLIENT_ID` / `_SECRET` | – | OAuth app credentials. Both required to be "configured". |
| `FEEDBACK_LINEAR_PLATFORM_TEAM_ID` | – | Required for the platform source |
| `FEEDBACK_LINEAR_PLATFORM_STATE_ID` | – | Intake state. Required. |
| `FEEDBACK_LINEAR_AI_APPS_PROJECT_ID` | – | Optional; when unset, `AI Apps Feedback` issues have no project |
| `FEEDBACK_LINEAR_LABEL_ID` | – | Optional; when unset, no `User feedback` label |
| `FEEDBACK_LINEAR_IMAGE_HOSTS` | image-bucket host + `AWS_S3_DOMAIN` / `WORKER_IMAGE_URL` hosts | Fetch allowlist |
| `FEEDBACK_LINEAR_SYNC_CRON` | `*/15 * * * * *` | Worker tick |
| `FEEDBACK_LINEAR_MAX_ATTEMPTS` | `8` | Give-up threshold |

The environment label in the body comes from `ENVIRONMENT`.

### D12. Module layout
`apps/web-api/src/feedback-linear/`:
- `linear.client.ts` (D1, D2)
- `feedback-linear.config.ts` (env parsing; `isConfigured()`)
- `feedback-linear-outbox.service.ts` (`enqueue`, claim/complete/fail)
- `feedback-linear.worker.ts` (cron, dispatch by `sourceType` to a handler registry)
- `contact-support-linear.handler.ts` (builds the issue for `CONTACT_SUPPORT`)
- `linear-images.ts` (D9)

`ContactSupportModule` imports `FeedbackLinearModule` and calls `outbox.enqueue(...)`. LAB-2873 adds an `AI_APP_FEEDBACK` handler.

## Risks / Trade-offs

- **[Spoofed identity]** The uid+email check can be passed by someone who knows a member's uid and email. → They could only file feedback "as" that member into Backlog, where a human triages it, and no email is exposed. Acceptable.
- **[Image storage URLs expire or move]** → Images are copied into Linear at push time, so the issue keeps them.
- **[Linear outage longer than ~30 min]** → Rows go `FAILED`. Recovery is the documented SQL reset. A PostHog event on failure (see tasks) makes it visible.
- **[Token scope too broad]** `write` lets the app modify any issue it can see. → The client only calls `issueCreate`, `fileUpload` and read queries, so the code surface is small. The scope is set by LAB-2870.
- **[Cron every 15 s on every pod]** → Each tick is one indexed query when the table is idle.
- **[Dev feedback polluting LAB]** → LAB-2870 points dev at a private test team or leaves dev unconfigured.

## Migration Plan

1. Merge with the additive migration. It deploys inert (no env vars), so the behavior is unchanged.
2. LAB-2870 sets the dev env vars to a test team, then verify end to end on the `lab-2701` feature env or dev.
3. Set the prod env vars; new feedback starts flowing.

**Rollback:** unset `FEEDBACK_LINEAR_CLIENT_ID` (the worker and enqueue stop). The table can stay.

## Open Questions

- Should `Review` (LAB's other backlog-type state) be used instead of `Backlog` if Vova prefers a dedicated intake column? This is only a config value (`FEEDBACK_LINEAR_PLATFORM_STATE_ID`).
