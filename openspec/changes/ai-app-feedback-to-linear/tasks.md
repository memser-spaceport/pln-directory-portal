# Tasks

Build on task branch `feat/LAB-2873-ai-app-feedback-to-linear` off `lab-2701` (after LAB-2871 / PR #3533 is merged into it). Run single suites with `yarn nx run web-api:test --testFile=<path>`. Mock `axios` and `analytics.service` with factories in specs (ESM).

## 1. Data model

- [x] 1.1 In `schema.prisma`:
  - add `AiApp.linearTeamId`, `linearProjectId`, `linearTargetSetAt` (nullable, documented)
  - add the `FeedbackLinearTargetState` enum (`INTAKE`, `COMPLETED`, `CANCELED`) and `SKIPPED` on `FeedbackLinearStatus`
  - add `FeedbackLinearIssue.targetState` (default `INTAKE`), `appliedState?`, `intakeStateId?`, `pendingCommentId?`, `pendingCommentUid?`, `version` (default 0)

  Write one additive migration folder (no data UPDATE). Verify that `prisma migrate diff` from the local DB matches the SQL, apply it locally, and confirm `prisma generate` succeeds.
- [x] 1.2 Update `docs/DATABASE_SCHEMA.md` (the new `AiApp` columns, the outbox columns, `SKIPPED`). Verify the section lists every new column.

## 2. Shared module: client, team metadata, config

- [x] 2.1 Split the config into `getFeedbackLinearCredentials()` (client id + secret) and the existing platform config. The worker and AI App routes gate on credentials only. Verify that the config spec covers credentials-only, and that platform-unset with credentials-set leaves the worker running.
- [x] 2.2 Add client operations:
  - `team(id)` (`id key name private triageEnabled`, states `{ id type position }`, team + workspace labels with parent name, projects)
  - `teams()` (private flag + projects)
  - `userByEmail(email)` (active only, `{ id, teamIds }`)
  - `issueUpdate(id, { stateId })`
  - `commentCreate({ id, issueId, body })`

  Verify each with mocked-axios specs, including no-user → null and a team not found → null.
- [x] 2.3 Replace `LinearTypeLabels` with `LinearTeamMeta` (D4): a 1-hour cache, `intakeStateId` (triage → first backlog by position → permanent error), `stateIdOfType`, `typeLabelId`, `labelId`. Switch the platform handler to it. Verify that the meta specs cover triage on/off, position ordering and a no-backlog error, and that the existing platform handler spec still passes unchanged in behavior.

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

  Verify with a spec: create-then-complete in one tick; a retry after a comment timeout reuses the comment id; delete-before-create → `SKIPPED`; reopen → intake state id; platform rows unaffected (the existing worker spec stays green).

## 4. AI App target routes

- [x] 4.1 Add `AiAppsLinearService` + DTO `UpdateAiAppLinearTargetDto` (`teamId: string | null`, `projectId?: string | null`). Add to the controller:
  - `GET linear/teams`, declared above the `:uid` routes
  - `GET :uid/linear-target` and `PUT :uid/linear-target` (`UserTokenCheckGuard` + `RbacGuard` READ, `@NoCache`, zod-dto pipe)

  Behavior per spec + D5: manager gate, 404/403/400/503, the own-teams vs admin listing, saving and clearing, re-queueing `FAILED` rows. Verify with a spec covering every spec scenario under target management, validation, re-queue and team listing.
- [x] 4.2 Document the routes, the target columns and the private-team / own-teams rule in `docs/AI_APPS.md` and the `ai-apps` skill (`.claude/skills/ai-apps/SKILL.md`, local). Verify the route paths in the doc match the controller.

## 5. Enqueue, status sync and handler

- [x] 5.1 Add `AiAppFeedbackLinearSync` (D6: `onSubmitted`, `onStatusChanged`, `onClosingNote`, `onDeleted`, `attach`; every method catches and logs) and wire the hooks into `submitFeedback`, `applyFeedbackStatus`, `updateAgentFeedbackStatus` and `deleteFeedbackItem`. Import `FeedbackLinearModule` in `AiAppsModule`. Verify with a spec:
  - FEEDBACK after the target enqueues once with the frozen team/project; COMMENT, no target, or an item older than the target do not
  - the status mapping table (NEW→VIEWED: none; →IMPLEMENTED: COMPLETED; IMPLEMENTED→NEW/VIEWED: INTAKE)
  - closing note → pending comment
  - delete → CANCELED
  - a thrown outbox error never changes the service result
- [x] 5.2 Add `AiAppFeedbackLinearHandler` (D7) and move `hideEmail` / `feedbackIssueTitle` (with a prefix parameter) to a shared util in `feedback-linear/`. Verify with a spec:
  - the title prefix `[<app name>]`
  - body order with the pin list from the text, and crops under Screenshots
  - context JSON, and the LabOS link via `aiAppFeedbackPath`
  - email hidden
  - labels (`User feedback` when the team has it; Type bug/request/none)
  - priority mapping; assignee matched or unassigned; intake state
  - `createAsUser`; `buildComment` text; a missing item → permanent error
- [x] 5.3 Attach `linearIssue` (D8) in `listFeedback` (and its `queryFeedback` path), `listAccessibleFeedback`, `listAgentFeedback` and `listFeedbackForMcp`. Verify with a spec that synced, pending and absent rows map correctly and that `listMyFeedback` rows have no `linearIssue` key.
- [x] 5.4 Update `docs/FEEDBACK_LINEAR.md` for the second source, the update step, `SKIPPED` and credentials-only gating. Update `docs/AI_APPS.md` → Feedback for the push, the status sync and `linearIssue`. Verify the docs name the same states and fields as the code.

## 6. Integration check

- [x] 6.1 Run `feedback-linear/**`, `contact-support/**` and the touched `ai-apps` feedback suites (`ai-apps-feedback*.spec.ts`, `ai-apps-agent-feedback.spec.ts`, the new specs) plus `yarn build:api`, ESLint on touched files, and a local boot with no Linear env. All pass.
- [ ] 6.2 With LAB-2870 credentials on the `lab-2701` feature env, set a test team on a test app, then submit pinned feedback. Confirm:
  - one issue in intake, assigned to the owner when matched
  - marking it IMPLEMENTED with an agent note completes it and adds the comment
  - reopening returns it to intake
  - deleting another item cancels its issue
  - the owner list shows `linearIssue`
