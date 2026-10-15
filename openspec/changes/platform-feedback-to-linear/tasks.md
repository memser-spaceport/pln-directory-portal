# Tasks

Build on task branch `feat/LAB-2871-platform-feedback-to-linear` off `lab-2701`. Run single suites with `yarn nx run web-api:test --testFile=<path>`. The full web-api lint/test suite is red on develop, so verify the touched suites only.

## 1. Data model

- [x] 1.1 Add the `FeedbackLinearSource` (`CONTACT_SUPPORT`, `AI_APP_FEEDBACK`) and `FeedbackLinearStatus` (`PENDING`, `SYNCED`, `FAILED`) enums and the `FeedbackLinearIssue` model (design D3) to `apps/web-api/prisma/schema.prisma`. Add a new additive migration folder: no DROP, RENAME, ALTER TYPE or data UPDATE. Verify `npx prisma migrate dev` applies cleanly on the local DB and `prisma generate` succeeds.
- [x] 1.2 Add the table and enums to `docs/DATABASE_SCHEMA.md`. Verify the section names every column from 1.1.

## 2. Config and Linear client

- [x] 2.1 Create `apps/web-api/src/feedback-linear/feedback-linear.config.ts`:
  - Parse the D11 env vars, with `isConfigured()` (client id + secret + platform team + state).
  - The image host allowlist defaults to the image-bucket host (`<AWS_S3_IMAGE_BUCKET_NAME>.s3.<AWS_REGION>.amazonaws.com`) plus the `AWS_S3_DOMAIN` and `WORKER_IMAGE_URL` hosts when set.
  - Add the var names with empty placeholders to the root `.env.example`.
  - Verify with a spec for configured/unconfigured, allowlist default and override, and the cron/max-attempts defaults.
- [x] 2.2 Create `linear.client.ts` (D1, D2):
  - Client-credentials token fetch, cached with a 5-minute early refresh; one refetch on 401.
  - `graphql(query, variables)` mapping HTTP status and GraphQL errors to `LinearApiError { status, code, retryable, retryAfterMs? }`.
  - Typed helpers `issueCreate`, `issueById`, `teamLabels`, `fileUpload`.
  - Verify with a spec on a mocked axios: token caching and refresh, 401 retry, 429 `Retry-After`, 5xx retryable, 400 not retryable, and no token or secret in error messages.

## 3. Outbox and worker

- [x] 3.1 Create `feedback-linear-outbox.service.ts`:
  - `enqueue({ sourceType, sourceUid, teamId, projectId })` generates `linearIssueId` (UUID v4) and ignores unique conflicts on `(sourceType, sourceUid)`.
  - `claimDue(limit)`: conditional `updateMany` per row with a 2-minute lease, as in D4.
  - `markSynced`, `markFailedAttempt` (D6 backoff, `FAILED` at max attempts, `lastError` truncated to 1000 chars).
  - Verify with a spec using a mocked Prisma: a lost claim (`count 0`) is skipped, backoff values for attempts 1–8, the cap at 1 h, `FAILED` after max, and a `Retry-After` later than backoff wins.
- [x] 3.2 Create `feedback-linear.worker.ts`:
  - `@Cron(process.env.FEEDBACK_LINEAR_SYNC_CRON || '*/15 * * * * *', { name: 'feedback-linear-sync' })`.
  - No-op when unconfigured or already running in-process.
  - Dispatches each claimed row to a handler registered for its `sourceType`; an unknown type fails the attempt with a clear error.
  - Idempotency (D5): when `attempts > 0`, query `issueById` first and mark synced if found; treat an "already exists" create error the same way.
  - Verify with a spec: unconfigured tick does nothing; overlapping ticks run once; timeout-then-retry produces exactly one `issueCreate` call and ends `SYNCED`.
- [x] 3.3 Track `feedback-linear-pushed` and `feedback-linear-failed` (on transition to `FAILED`) through `AnalyticsService.trackEvent`. Properties: `sourceType`, `attempts`, `teamId`; no email and no feedback text. Verify with a spec asserting the event names and that the properties have no `email` or `text` keys.
- [x] 3.4 Create `FeedbackLinearModule` exporting the outbox service and handler registry, and register it in `app.module.ts`. Verify `yarn build:api` succeeds and the API boots locally with no `FEEDBACK_LINEAR_*` vars set.

## 4. Issue content for contact-support

- [x] 4.1 Add `toLinearMarkdown(html)` (and a plain-text helper for titles) to `contact-support/contact-support-html.ts` (D8). It returns `{ markdown, images: [{ src, flatSrc? }] }`, reusing the existing tokenizer, `SAFE_HREF` and entity decoding. Verify in `contact-support-html.spec.ts`:
  - bold, italic, links, headings, lists, line breaks
  - a `javascript:` href is dropped
  - markdown control characters are escaped
  - `data-flat-src` is captured
  - a plain-text message passes through
- [x] 4.2 Create `linear-images.ts` (D9):
  - The allowlist check (https only, exact hostname match).
  - Fetch with 10 MB / 10 s / no redirects / `image/*` check.
  - `fileUpload` then PUT, returning the `assetUrl`; any failure falls back to a link.
  - Verify with a spec: a disallowed host or IP makes zero HTTP calls; oversize, timeout, non-image and failed PUT each produce a link; `flatSrc` is preferred over `src`.
- [x] 4.3 Create `contact-support-linear.handler.ts`, building the issue from the saved request:
  - Title per spec; body sections in spec order with the reporter line `Reported by [<member name>](<WEB_UI_BASE_URL>/members/<uid>)`; the environment from `ENVIRONMENT`.
  - Labels: `FEEDBACK_LINEAR_LABEL_ID` plus the Type resolved by name under the `Type` group with a 1-hour per-team cache (D10).
  - Priority mapping; `stateId`; `projectId` only for `AI Apps Feedback`; `createAsUser` = member name; no assignee.
  - Verify with a spec covering every spec scenario under Issue title, Issue body layout, Reporter privacy (the email string never appears), Labels and priority, and the project rule.

## 5. Enqueue from contact-support

- [x] 5.1 In `ContactSupportService.createSupportRequest`, after the save and alongside the Telegram call, enqueue when all of these hold, with errors logged and swallowed:
  - `isConfigured()`
  - the topic is in {`Give feedback`, `Share an idea`, `Report a bug`, `AI Apps Feedback`}
  - `metadata.uid` resolves to a `Member` whose email matches case-insensitively (D7)

  Import `FeedbackLinearModule` in `ContactSupportModule`. Verify with a spec:
  - each pushable topic enqueues once
  - `Contact support` / `Ask a question` / unknown topics don't
  - a mismatched or missing uid doesn't
  - unconfigured doesn't
  - an enqueue failure still returns `{ uid }`, and Telegram is still called
- [x] 5.2 Write `docs/FEEDBACK_LINEAR.md`:
  - what is pushed and where
  - the env var table
  - the privacy rule
  - worker and retry behavior
  - the SQL to re-queue `FAILED` rows (`UPDATE "FeedbackLinearIssue" SET status='PENDING', attempts=0, "nextAttemptAt"=now() WHERE …`)
  - how LAB-2873 adds a source

  Add the env vars to the `contact-support` area of any existing env docs. Verify the doc's var names match `feedback-linear.config.ts`.

## 6. Integration check

- [x] 6.1 Run the touched suites (`feedback-linear/**`, `contact-support/**`) and `yarn build:api`, and confirm all pass.
- [ ] 6.2 Once LAB-2870 provides dev credentials pointing at a test team, submit `Report a bug` with an annotated screenshot and `AI Apps Feedback` from the drawer on the `lab-2701` feature env (or dev). Confirm in Linear:
  - one issue each, in the intake state
  - labels and project correct
  - the flattened image is embedded
  - no email in the issue
  - the `FeedbackLinearIssue` rows are `SYNCED`
