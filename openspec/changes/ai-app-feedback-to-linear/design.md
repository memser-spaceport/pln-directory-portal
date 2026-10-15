# Design

## Context

- **Shared module from LAB-2871** (`apps/web-api/src/feedback-linear/`, change `platform-feedback-to-linear`): `LinearClient` (client credentials, GraphQL over axios), the `FeedbackLinearIssue` outbox with lease-claimed rows and a `linearIssueId` chosen at enqueue, `FeedbackLinearWorker`, a source handler registry, `LinearImageUploader` and `LinearTypeLabels`.
  - Rows only ever create an issue. There is no update step.
  - The worker no-ops unless the *platform* team is configured too.
- **AI App feedback** (`ai-apps.service.ts`):
  - `submitFeedback` creates the `AiAppFeedback` row; its HTML already carries a readable pin list with crop `<img>`s, written by v2's `appendPinsHtml`.
  - Status changes from all three routes go through `applyFeedbackStatus`. The agent/MCP closing note is created as an `AiAppFeedbackComment` (`CLOSING_NOTE`) right after it, in `updateAgentFeedbackStatus`.
  - `deleteFeedbackItem` hard-deletes; pins and comments cascade.
- **Manage gate:** `findManageableApp` in `ai-apps-access.service.ts` is private; the same rule is `isCreatorOrDirectoryAdmin` on `AiAppsService`.
- **Feedback lists:**
  - for managers: `queryFeedback` (via `listFeedback`), `listAccessibleFeedback`, `listAgentFeedback`, `listFeedbackForMcp`
  - for the reporter: `listMyFeedback`
- **Linear team facts:** each team has `private`, `triageEnabled`, and `states` with `type` ∈ {triage, backlog, unstarted, started, completed, canceled} and a `position`. Labels can be team-level or workspace-level. Users can be filtered by email and have `teams`.

## Goals / Non-Goals

**Goals:**
- One outbox row per item carries both creation and later state changes, so ordering is correct, every Linear call is retried, and no LabOS request ever waits on Linear.
- Keep `ai-apps.service.ts` changes to small hooks; the Linear logic lives in its own files.

**Non-Goals:**
- Linear → LabOS sync (webhooks), mirroring text edits or replies other than the closing note, and backfilling older items.
- Any change to the platform (contact-support) behavior, beyond the shared module learning the update step.
- A Linear user picker for the assignee: it is matched by email only.

## Decisions

### D1. Desired-state columns on the outbox row, applied by the worker
Add to `FeedbackLinearIssue`:

```
targetState     FeedbackLinearTargetState @default(INTAKE)   -- INTAKE | COMPLETED | CANCELED
appliedState    FeedbackLinearTargetState?                    -- null until the issue exists
intakeStateId   String?                                       -- Linear state the issue was created in
pendingCommentId  String?                                     -- UUID sent as commentCreate input.id
pendingCommentUid String?                                     -- AiAppFeedbackComment.uid to post
version         Int @default(0)                               -- bumped on every change request
FeedbackLinearStatus += SKIPPED
```

`outbox.requestState(sourceType, sourceUid, targetState, comment?)` is one `updateMany`:
- set `targetState`, plus the comment fields when given
- `version += 1`, `status = PENDING`, `attempts = 0`, `nextAttemptAt = now`

It doesn't touch the lease, so a worker mid-push keeps it. With no row (the item was never pushed), it is a no-op.

Worker step for a claimed row:
1. **No issue yet** (`appliedState` null):
   - If `targetState = CANCELED`: check `issueById` when `attempts > 0`. If there's no issue, finish the row as `SKIPPED`; otherwise go to step 2.
   - Otherwise create the issue (the handler's draft decides the intake `stateId`) and store `appliedState = INTAKE` and `intakeStateId`.
2. **`targetState ≠ appliedState`:** `issueUpdate(id, { stateId })`, using `intakeStateId` for INTAKE and the team's first completed or canceled state by position. Store `appliedState`.
3. **`pendingCommentUid`:** the handler supplies the comment body, and `commentCreate({ id: pendingCommentId, issueId, body })` is idempotent by id. Then clear both fields.
4. Finish:
   - Progress fields (`identifier`, `url`, `appliedState`, `intakeStateId`, comment clears) are written unconditionally.
   - `status = SYNCED` is written with `updateMany where { id, version: row.version }`.
   - If a change request arrived mid-push, the row stays `PENDING`, and the next tick applies the newer target.

Failures use the existing `markFailedAttempt` (backoff, `FAILED`), also conditioned on `version`, so a newer request is never overwritten with a failure.
- **Alternatives:**
  - Synchronous `issueUpdate` in the request is lost when Linear is down or the issue isn't created yet, and it puts Linear latency on LabOS writes.
  - A second outbox row per change reorders badly, and needs its own idempotency.

### D2. Source handler contract grows by one optional method
`FeedbackLinearSourceHandler` gains `buildComment?(row, commentUid): Promise<string | null>`. A null return (the comment was deleted) drops the pending comment. The platform handler has no comments. State resolution (intake/completed/canceled) is Linear-generic and lives in the worker via `LinearTeamMeta` (D4).

### D3. Credentials-only "configured" for the worker
- Split `feedback-linear.config.ts`: `getFeedbackLinearCredentials()` (client id + secret) gates the worker and the AI App routes, and `getFeedbackLinearConfig()` stays the platform config.
- The platform handler throws a retryable "platform team not configured" error if a platform row exists without it. In practice that can't happen, because platform enqueue already requires it.

### D4. `LinearTeamMeta` replaces `LinearTypeLabels`
One 1-hour per-team cache of:
- `private`, `triageEnabled`
- states (`id`, `type`, `position`)
- labels: team labels plus workspace labels, by name, with the parent group name

Helpers:
- `intakeStateId(team)`: triage if enabled and present, else the first backlog-type state by position. Neither throws `FeedbackLinearPermanentError`.
- `stateIdOfType(team, 'completed' | 'canceled')`
- `typeLabelId(team, name)` (parent group `Type`)
- `labelId(team, 'User feedback')`

The platform handler switches to it with no behavior change. The client gains `team(id)` (with states, labels and projects), `teams()`, `userByEmail(email)` (active only, with team ids), `issueUpdate` and `commentCreate`.

### D5. Target routes in a new `AiAppsLinearService`
In `apps/web-api/src/ai-apps/ai-apps-linear.service.ts`:
- `GET /v1/ai-apps/linear/teams` (`UserTokenCheckGuard` + `RbacGuard` READ). It is declared above the `:uid` routes so `linear` is never read as a uid.
  - **Directory admin:** every private team.
  - **Otherwise:** `userByEmail(member.email)`, then the private teams among that user's teams. No member email or no Linear user gives `[]`.
  - Projects per team are capped at 250.
  - The 1-hour team-meta cache is not used here: the list must reflect new teams quickly, and it is only called from the settings modal.
- `GET` / `PUT /v1/ai-apps/:uid/linear-target` (same guards, `ZodValidationPipe` from `@abitia/zod-dto`):
  - manager gate = `isCreatorOrDirectoryAdmin`, with 404 for missing or `DELETED`
  - PUT validates through `team(id)`: missing → 400 "Linear team <id> not found", not private → 400, project not in the team → 400
  - it saves `linearTeamId`, `linearProjectId` and `linearTargetSetAt = now()`; clearing nulls all three
  - a set re-queues the app's `FAILED` rows: `updateMany` on `sourceType = AI_APP_FEEDBACK`, `sourceUid in <app's feedback uids>`, `status = FAILED`
- 503 = `ServiceUnavailableException` when credentials are missing.
- **Privacy note:** listing only the requester's own teams keeps one app owner from seeing every private team name in the workspace. That is tighter than the ticket's wording, by decision.

### D6. Hooks in `AiAppsService`
Each hook calls an injected `AiAppFeedbackLinearSync` (in `ai-apps/`) whose methods catch and log every error, so no LabOS response changes.
- **`submitFeedback`:** after create, `sync.onSubmitted(app, feedback)`. It enqueues when the item is `FEEDBACK`, credentials exist, `app.linearTeamId` is set and `feedback.createdAt >= app.linearTargetSetAt`. Team and project are frozen on the row.
- **`applyFeedbackStatus`:** after the update, `sync.onStatusChanged(feedbackUid, from, to)`. `to = IMPLEMENTED` gives COMPLETED; `from = IMPLEMENTED` with `to ∈ {NEW, VIEWED}` gives INTAKE; anything else is nothing.
- **`updateAgentFeedbackStatus`:** after the `CLOSING_NOTE` comment is created, `sync.onClosingNote(feedbackUid, comment.uid)`. This sets the pending comment (with a new UUID) and requests COMPLETED again (a no-op on state if already applied).
- **`deleteFeedbackItem`:** after delete, `sync.onDeleted(feedbackUid)` → CANCELED.

### D7. `AI_APP_FEEDBACK` handler
`AiAppFeedbackLinearHandler`, in `ai-apps/`, registered in `onModuleInit`.
- **Loads:** the item (missing → permanent), its app and the reporter `Member`, plus the owner `Member`'s email for the assignee lookup.
- **Body:** `toLinearMarkdown` (shared from contact-support) and `LinearImageUploader.rehost`.
  - **Reporter line:** `Reported by [name](profile) · <app name> · <env from context or ENVIRONMENT>`
  - **Context:** a JSON block of `context`, truncated to 2000 characters
  - **Expected result:** the placeholder
  - **LabOS link:** `${AI_APPS_PORTAL_URL}${aiAppFeedbackPath(app.uid, item.uid, hasPins, 'FEEDBACK')}`
  - **Email:** the reporter email is hidden in the title and body, using the same helper as the platform handler, moved to a shared util
- **Title:** `[<app name>] <first line ≤ 80>`, through the shared `feedbackIssueTitle(message, fallback, prefix)` (gains a prefix parameter).
- **Labels:** the team's `User feedback` label if present, and Type from `reportKind` (`bug` → Bug, `request` → Improvement, else none).
- **Priority:** mapped from `priority`.
- **Assignee:** `userByEmail(owner.email)?.id`.
- **State:** `intakeStateId(team)`.
- **`createAsUser`:** the reporter name.
- **`buildComment`:** the `CLOSING_NOTE` comment's text as markdown, prefixed `Closing note from LabOS:`.

### D8. `linearIssue` on manager responses
`AiAppFeedbackLinearSync.attach(rows)` runs one `findMany` on the outbox by `sourceUid in rows` (`sourceType = AI_APP_FEEDBACK`) and maps each row to `{ status, identifier, url, lastError }`, or `null`. It is applied to the return values of `listFeedback`, `listAccessibleFeedback`, `listAgentFeedback` and `listFeedbackForMcp`. `listMyFeedback` is untouched, so the field is absent there.

## Risks / Trade-offs

- **[The Linear app can't see the chosen private team]** Private teams are visible to the app only if it was given access. → `teams` returns only what the app can reach, so an owner who doesn't see their team must ask an admin to add the app (documented). PUT validation catches stale ids.
- **[Email match picks the wrong Linear user]** → It only sets the assignee, only matches active users, and Linear emails are unique per workspace.
- **[Comment and state edits from Linear users are overwritten]** If someone moves the issue in Linear, a later LabOS status change moves it again. → Accepted: LabOS → Linear is one-way by decision, and only explicit LabOS transitions trigger an update.
- **[Version race]** A worker that finishes after a newer request leaves the row `PENDING`. → By design, the next tick converges.
- **[Linear `issueUpdate` on a deleted issue]** → It fails permanently after max attempts and is visible as `FAILED` with `lastError`. Acceptable.

## Migration Plan

1. One additive migration: three `AiApp` columns; `FeedbackLinearIssue` columns with defaults; `SKIPPED` added to `FeedbackLinearStatus` (`ALTER TYPE … ADD VALUE`, non-destructive). Existing platform rows get `targetState = INTAKE` and `appliedState = null`.
   - No backfill: LAB-2871 has not reached any deployed environment, so no `SYNCED` rows exist. The worker sets `appliedState = INTAKE` whenever it creates an issue.
2. Deploy is inert without credentials. Owners opt in per app from LabOS (LAB-2874).

**Rollback:** clear app targets, or unset the credentials.

## Open Questions

(none)
