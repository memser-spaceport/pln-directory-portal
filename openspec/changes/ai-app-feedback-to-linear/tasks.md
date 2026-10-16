# Tasks

Built on `feat/LAB-2873-ai-app-feedback-to-linear` (PR #3537), then reworked on `fix/LAB-2873-central-linear-team` (2026-10-16): one central team, no LabOS surface. Both are off `lab-2701`. Run single suites with `yarn nx run web-api:test --testFile=<path>`. Mock `axios` and `analytics.service` with factories in specs (ESM).

## 1. Data model

- [x] 1.1 In `schema.prisma`, add:
  - the `FeedbackLinearTargetState` enum (`INTAKE`, `COMPLETED`, `CANCELED`) and `SKIPPED` on `FeedbackLinearStatus`
  - `FeedbackLinearIssue.targetState` (default `INTAKE`), `appliedState?`, `intakeStateId?`, `pendingCommentId?`, `pendingCommentUid?`, `version` (default 0)

  Write one additive migration folder (no data UPDATE). Verify that `prisma migrate diff` from the local DB matches the SQL, apply it locally, and confirm `prisma generate` succeeds.
- [x] 1.2 Update `docs/DATABASE_SCHEMA.md` (the outbox columns, `SKIPPED`). Verify the section lists every new column.

## 2. Shared module: client, team metadata, config

- [x] 2.1 Split the config:
  - `getFeedbackLinearCredentials()` (client id + secret)
  - `getFeedbackLinearMemberAppsTarget()` (`FEEDBACK_LINEAR_MEMBER_APPS_TEAM_ID` + optional `_PROJECT_ID`)
  - the existing platform config

  The worker gates on credentials only. Add the env var names to `.env.example`. Verify that the config spec covers credentials-only, the member-apps target, and that platform-unset with credentials-set leaves the worker running.
- [x] 2.2 Add client operations: `team(id)` (`id key name private triageEnabled`, states `{ id type position }`, team + workspace labels with parent name, projects), `issueUpdate(id, { stateId })` and `commentCreate({ id, issueId, body })`. Verify each with mocked-axios specs, including a team not found → null.
- [x] 2.3 Replace `LinearTypeLabels` with `LinearTeamMeta` (D4):
  - a 1-hour cache
  - `intakeStateId` (triage → first backlog by position → permanent error)
  - `stateIdOfType`, `typeLabelId`, `labelId`

  Switch the platform handler to it. Verify that the meta specs cover triage on/off, position ordering and a no-backlog error, and that the platform handler spec still passes unchanged in behavior.

## 3. Outbox update step

- [x] 3.1 Outbox service:
  - `requestState(sourceType, sourceUid, targetState, comment?)` as one `updateMany`: version++, `PENDING`, attempts 0, next attempt now, lease untouched; no row is a no-op
  - `markSynced`/`markFailedAttempt` gain the version condition plus unconditional progress fields (D1)
  - `markSkipped`

  Verify with a spec: a version mismatch leaves the status `PENDING` and still stores progress; a failure on a stale version doesn't overwrite.
- [x] 3.2 Worker (D1 steps 1–4):
  - create sets `appliedState = INTAKE` + `intakeStateId`
  - a `targetState` mismatch calls `issueUpdate` with the right state
  - a pending comment calls `commentCreate` with the stored id, using the handler's `buildComment`; a null drops it
  - CANCELED before creation ends `SKIPPED` (with the `issueById` check when attempts > 0)
  - the handler contract gains optional `buildComment`

  Verify with a spec: create-then-complete in one tick; a retry after a comment timeout reuses the comment id; delete-before-create → `SKIPPED`; reopen → intake state id; platform rows unaffected.

## 4. No LabOS surface

- [x] 4.1 Remove the per-app picker built first: `AiAppsLinearService` and its DTO, the `GET linear/teams` and `GET`/`PUT :uid/linear-target` routes, the `AiApp.linearTeamId`/`linearProjectId`/`linearTargetSetAt` columns (from the unreleased migration too), the client's `teams()`/`userByEmail()`, and `linearIssue` on feedback responses. Verify that the controller matches its pre-LAB-2873 state and that no route or response field mentions Linear.
- [x] 4.2 Document the central team and the "nothing visible in LabOS" rule in `docs/AI_APPS.md` and the `ai-apps` skill. Verify neither mentions the removed routes.

## 5. Enqueue, status sync and handler

- [x] 5.1 Add `AiAppFeedbackLinearSync` (D6: `onSubmitted`, `onStatusChanged`, `onClosingNote`, `onDeleted`; every method catches and logs) and wire the hooks into `submitFeedback`, `applyFeedbackStatus`, `updateAgentFeedbackStatus` and `deleteFeedbackItem`. Import `FeedbackLinearModule` in `AiAppsModule`. Verify with a spec:
  - FEEDBACK enqueues once for the member-apps team/project; COMMENT, no team or no credentials do not
  - the status mapping table (NEW→VIEWED: none; →IMPLEMENTED: COMPLETED; IMPLEMENTED→NEW/VIEWED: INTAKE)
  - closing note → pending comment
  - delete → CANCELED
  - a thrown outbox error never changes the service result
  - no feedback list carries a Linear field
- [x] 5.2 Add `AiAppFeedbackLinearHandler` (D7) and move `hideEmail` / `feedbackIssueTitle` (with a prefix parameter) to a shared util in `feedback-linear/`. Verify with a spec:
  - the title prefix `[<app name>]`
  - the reporter line naming the app owner; body order with the pin list from the text, and crops under Screenshots
  - context JSON, and the LabOS link via `aiAppFeedbackPath`
  - email hidden
  - labels (`User feedback` when the team has it; Type bug/request/none)
  - priority mapping; no assignee; intake state
  - `createAsUser`; `buildComment` text; a missing item → permanent error
- [x] 5.3 Update `docs/FEEDBACK_LINEAR.md` for the second source, the update step, `SKIPPED`, credentials-only gating and the member-apps team. Verify the docs name the same states, fields and env vars as the code.

## 6. Integration check

- [x] 6.1 Run `feedback-linear/**`, `contact-support/**` and all `ai-apps/**` suites, plus `yarn build:api`, ESLint on touched files, and a local boot with no Linear env. All pass.
- [ ] 6.2 With LAB-2870 credentials and a member-apps team on the `lab-2701` feature env, submit pinned feedback on a test app. Confirm:
  - one issue in intake, naming the app and owner
  - marking it IMPLEMENTED with an agent note completes it and adds the comment
  - reopening returns it to intake
  - deleting another item cancels its issue
  - LabOS shows nothing new anywhere
