# Proposal

## Why

AI App owners get ~35 private feedback items a week (142 across 7 apps in the 30 days to 2026-10-15), but they only see them in LabOS, so they can't triage them alongside their own work. Most owners already plan in Linear. Horizon AutoDev only builds the LabOS repos, so member-app feedback must reach the app's owner, never the LAB team (LAB-2701, Task LAB-2873). The shared Linear client and outbox from LAB-2871 (`platform-feedback-to-linear`) make this an extension rather than a new pipeline.

## What Changes

- **Linear target per app:** an app's owner or a directory admin can set a Linear target (a private team, plus an optional project) for the app, and clear it. Off by default.
  - `GET /v1/ai-apps/linear/teams` lists the private teams the requester can pick: their own Linear teams, or every private team for a directory admin.
  - `GET` / `PUT /v1/ai-apps/:uid/linear-target` read and replace the target.
- **One issue per item:** each private `FEEDBACK` item submitted after the target is set becomes one issue in that team.
  - **Content:** title `[<app name>] <first line>`, reporter name + LabOS profile link (no email), text, screenshots and pin crops copied into Linear, pins, context, a LabOS link, and an "Expected result" placeholder.
  - **Labels and priority:** `User feedback` + Type when the team has those labels; priority from the item.
  - **Assignee:** the owner, when they have a Linear account.
  - **State:** the team's intake state, never Todo or a started state.
- **LabOS status → Linear:**
  - `IMPLEMENTED` completes the issue and posts the closing note as a comment.
  - Reopening returns the issue to its intake state.
  - Deleting the item cancels the issue.
  - Delivery is through the same retried outbox, so a status change or delete never fails because of Linear.
- **Responses:** owner/admin feedback responses carry `linearIssue: { status, identifier, url, lastError } | null`. The reporter's own list never does.
- **Shared module changes** (`feedback-linear`):
  - the outbox learns a desired Linear state and a pending comment
  - the worker runs on credentials alone, without needing the platform team
  - team metadata (labels, states) is cached per team

## Capabilities

### New Capabilities

- `ai-app-feedback-linear`: Routing private AI App feedback to the app owner's chosen Linear team. Covers target management and team listing, which items are pushed, issue content and privacy, and LabOS → Linear status sync.

### Modified Capabilities

(none: `feedback-linear-sync` is still an open change, `platform-feedback-to-linear`. This change keeps its behavior, and its spec is unchanged.)

## Impact

- **Code:**
  - `apps/web-api/src/ai-apps/`: a new Linear target service + routes, enqueue/status/delete hooks in `ai-apps.service.ts`, `linearIssue` on list responses, an `AI_APP_FEEDBACK` source handler
  - `apps/web-api/src/feedback-linear/`: outbox columns, worker update step, credentials-only config check, client queries (teams, users, states, `issueUpdate`, `commentCreate`)
- **DB:** one additive migration.
  - `AiApp.linearTeamId`, `linearProjectId`, `linearTargetSetAt`
  - `FeedbackLinearIssue` columns for the desired and applied state, intake state, pending comment and a version counter
  - new status value `SKIPPED`
- **API:** three new routes; one new nullable response field on the owner/admin feedback lists (agent and MCP lists included).
- **Config:** none new. It uses `FEEDBACK_LINEAR_CLIENT_ID` / `_SECRET` and `FEEDBACK_LINEAR_IMAGE_HOSTS` from LAB-2870.
- **Frontend:** consumed by LAB-2874. The response field is additive.
- **Docs:** `docs/AI_APPS.md`, `docs/FEEDBACK_LINEAR.md`, the `ai-apps` skill.
