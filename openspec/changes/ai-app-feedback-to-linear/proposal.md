# Proposal

## Why

AI App owners get ~35 private feedback items a week (142 across 7 apps in the 30 days to 2026-10-15), but they only see them in LabOS, so they can't be triaged alongside other work (LAB-2701, Task LAB-2873). Feedback should reach Linear the way support requests reach Telegram: silently, with no change to how members leave feedback. The shared Linear client and outbox from LAB-2871 (`platform-feedback-to-linear`) make this an extension rather than a new pipeline.

## What Changes

- **One central team:** every private `FEEDBACK` item on any member app becomes one issue in the team set by `FEEDBACK_LINEAR_MEMBER_APPS_TEAM_ID` (optional project `FEEDBACK_LINEAR_MEMBER_APPS_PROJECT_ID`). It is off while unset.
  - **Content:** title `[<app name>] <first line>`, reporter name + LabOS profile link (no email), the app and its owner, text, screenshots and pin crops copied into Linear, context, a LabOS link, and an "Expected result" placeholder.
  - **Labels and priority:** `User feedback` + Type when the team has those labels; priority from the item. Unassigned.
  - **State:** the team's intake state, never Todo or a started state.
- **LabOS status → Linear:**
  - `IMPLEMENTED` completes the issue and posts the closing note as a comment.
  - Reopening returns the issue to its intake state.
  - Deleting the item cancels the issue.
  - Delivery is through the same retried outbox, so a status change or delete never fails because of Linear.
- **Invisible in LabOS:** no setting, no route and no response field. Feedback is left exactly as before.
- **Shared module changes** (`feedback-linear`):
  - the outbox learns a desired Linear state and a pending comment
  - the worker runs on credentials alone, without needing the platform team
  - team metadata (labels, states) is cached per team

A per-app team picker with owner/admin routes and a LabOS modal (LAB-2874) was built first and removed on 2026-10-16: the feature must add no visible UI.

## Capabilities

### New Capabilities

- `ai-app-feedback-linear`: Sending private AI App feedback to one Linear team in the background. Covers which items are pushed, issue content and privacy, and LabOS → Linear status sync.

### Modified Capabilities

(none: `feedback-linear-sync` is still an open change, `platform-feedback-to-linear`. This change keeps its behavior, and its spec is unchanged.)

## Impact

- **Code:**
  - `apps/web-api/src/ai-apps/`: enqueue/status/delete hooks in `ai-apps.service.ts` (`AiAppFeedbackLinearSync`) and an `AI_APP_FEEDBACK` source handler
  - `apps/web-api/src/feedback-linear/`: outbox columns, worker update step, credentials-only config check, member-apps target config, client queries (team details, `issueUpdate`, `commentCreate`)
- **DB:** one additive migration: `FeedbackLinearIssue` columns for the desired and applied state, intake state, pending comment and a version counter; new status value `SKIPPED`.
- **API:** none. No route or response field changes.
- **Config:** `FEEDBACK_LINEAR_MEMBER_APPS_TEAM_ID`, `FEEDBACK_LINEAR_MEMBER_APPS_PROJECT_ID` (set by LAB-2870), plus the existing credentials and `FEEDBACK_LINEAR_IMAGE_HOSTS`.
- **Frontend:** none.
- **Docs:** `docs/AI_APPS.md`, `docs/FEEDBACK_LINEAR.md`, the `ai-apps` skill.
