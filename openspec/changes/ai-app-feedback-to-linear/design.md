# Design

## Context

- **Shared module from LAB-2871** (`apps/web-api/src/feedback-linear/`, change `platform-feedback-to-linear`): `LinearClient` (client credentials, GraphQL over axios), the `FeedbackLinearIssue` outbox with lease-claimed rows and a `linearIssueId` chosen at enqueue, `FeedbackLinearWorker`, a source handler registry, `LinearImageUploader` and `LinearTypeLabels`.
  - Rows only ever create an issue. There is no update step.
  - The worker no-ops unless the *platform* team is configured too.
- **AI App feedback** (`ai-apps.service.ts`):
  - `submitFeedback` creates the `AiAppFeedback` row; its HTML already carries a readable pin list with crop `<img>`s, written by v2's `appendPinsHtml`.
  - Status changes from all three routes go through `applyFeedbackStatus`. The agent/MCP closing note is created as an `AiAppFeedbackComment` (`CLOSING_NOTE`) right after it, in `updateAgentFeedbackStatus`.
  - `deleteFeedbackItem` hard-deletes; pins and comments cascade.
- **Linear team facts:** each team has `private`, `triageEnabled`, and `states` with `type` ∈ {triage, backlog, unstarted, started, completed, canceled} and a `position`. Labels can be team-level or workspace-level.

## Goals / Non-Goals

**Goals:**
- One outbox row per item carries both creation and later state changes, so ordering is correct, every Linear call is retried, and no LabOS request ever waits on Linear.
- Keep `ai-apps.service.ts` changes to small hooks; the Linear logic lives in its own files.

**Non-Goals:**
- Linear → LabOS sync (webhooks), mirroring text edits or replies other than the closing note, and backfilling older items.
- Any change to the platform (contact-support) behavior, beyond the shared module learning the update step.
- Any LabOS-visible surface (settings, routes, response fields), and an assignee: the owner may not be in the member-apps team, so they are named in the body instead.

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

The platform handler switches to it with no behavior change. The client gains `team(id)` (with states, labels and projects), `issueUpdate` and `commentCreate`.

### D5. One member-apps team from env, no LabOS surface
The target is `getFeedbackLinearMemberAppsTarget()`: `FEEDBACK_LINEAR_MEMBER_APPS_TEAM_ID` and an optional `FEEDBACK_LINEAR_MEMBER_APPS_PROJECT_ID`, frozen on each outbox row at enqueue. LabOS has no setting, route or response field for it.
- **Alternatives:**
  - A per-app, owner-chosen private team, with `GET /linear/teams`, `GET`/`PUT /:uid/linear-target`, `AiApp` columns and a LabOS modal plus issue chips (LAB-2874). It was built and removed on 2026-10-16, because the feature must not change the UI. Feedback stays as invisible as the Telegram copy of support requests.
  - Platform feedback only: it leaves owners without the member-app items.

### D6. Hooks in `AiAppsService`
Each hook calls an injected `AiAppFeedbackLinearSync` (in `ai-apps/`) whose methods catch and log every error, so no LabOS response changes.
- **`submitFeedback`:** after create, `sync.onSubmitted(feedback)`. It enqueues when the item is `FEEDBACK` and the credentials and member-apps team are configured. Team and project are frozen on the row.
- **`applyFeedbackStatus`:** after the update, `sync.onStatusChanged(feedbackUid, from, to)`. `to = IMPLEMENTED` gives COMPLETED; `from = IMPLEMENTED` with `to ∈ {NEW, VIEWED}` gives INTAKE; anything else is nothing.
- **`updateAgentFeedbackStatus`:** after the `CLOSING_NOTE` comment is created, `sync.onClosingNote(feedbackUid, comment.uid)`. This sets the pending comment (with a new UUID) and requests COMPLETED again (a no-op on state if already applied).
- **`deleteFeedbackItem`:** after delete, `sync.onDeleted(feedbackUid)` → CANCELED.

### D7. `AI_APP_FEEDBACK` handler
`AiAppFeedbackLinearHandler`, in `ai-apps/`, registered in `onModuleInit`.
- **Loads:** the item (missing → permanent), its app, the reporter `Member` and the owner `Member` (name + profile link in the reporter line).
- **Body:** `toLinearMarkdown` (shared from contact-support) and `LinearImageUploader.rehost`.
  - **Reporter line:** `Reported by [name](profile) · <app name> · <env from context or ENVIRONMENT>`
  - **Context:** a JSON block of `context`, truncated to 2000 characters
  - **Expected result:** the placeholder
  - **LabOS link:** `${AI_APPS_PORTAL_URL}${aiAppFeedbackPath(app.uid, item.uid, hasPins, 'FEEDBACK')}`
  - **Email:** the reporter email is hidden in the title and body, using the same helper as the platform handler, moved to a shared util
- **Title:** `[<app name>] <first line ≤ 80>`, through the shared `feedbackIssueTitle(message, fallback, prefix)` (gains a prefix parameter).
- **Labels:** the team's `User feedback` label if present, and Type from `reportKind` (`bug` → Bug, `request` → Improvement, else none).
- **Priority:** mapped from `priority`.
- **Assignee:** none.
- **State:** `intakeStateId(team)`.
- **`createAsUser`:** the reporter name.
- **`buildComment`:** the `CLOSING_NOTE` comment's text as markdown, prefixed `Closing note from LabOS:`.

## Risks / Trade-offs

- **[The Linear app can't see the member-apps team]** Private teams are visible to the app only if it was given access. → Pushes fail permanently with "Linear team … not found or not shared with the Linear app" in `lastError`; LAB-2870 shares the team when it sets the env var.
- **[Owners don't see their feedback in Linear unless they are in the member-apps team]** → Accepted by decision: owners keep LabOS as their view, and the team is the triage place.
- **[Comment and state edits from Linear users are overwritten]** If someone moves the issue in Linear, a later LabOS status change moves it again. → Accepted: LabOS → Linear is one-way by decision, and only explicit LabOS transitions trigger an update.
- **[Version race]** A worker that finishes after a newer request leaves the row `PENDING`. → By design, the next tick converges.
- **[Linear `issueUpdate` on a deleted issue]** → It fails permanently after max attempts and is visible as `FAILED` with `lastError`. Acceptable.

## Migration Plan

1. One additive migration: `FeedbackLinearIssue` columns with defaults; `SKIPPED` added to `FeedbackLinearStatus` (`ALTER TYPE … ADD VALUE`, non-destructive). Existing platform rows get `targetState = INTAKE` and `appliedState = null`.
   - No backfill: LAB-2871 has not reached any deployed environment, so no `SYNCED` rows exist. The worker sets `appliedState = INTAKE` whenever it creates an issue.
2. Deploy is inert without credentials and `FEEDBACK_LINEAR_MEMBER_APPS_TEAM_ID`; LAB-2870 sets them per environment.

**Rollback:** unset `FEEDBACK_LINEAR_MEMBER_APPS_TEAM_ID` (member-app pushes stop), or the credentials (all pushes stop).

## Open Questions

(none)
