# Proposal

## Why

LabOS product feedback (the help-menu dialog and the AI Apps drawer's "LabOS - AI Apps" option) only reaches the team as a Telegram message and an email. Telegram shows at most one image preview, so screenshots are effectively lost, and nothing is tracked. The team triages and builds work in Linear, and Horizon AutoDev builds from Linear tickets. Feedback needs to land there as a ticket a person can triage and hand to the agent (LAB-2701, Task LAB-2871).

## What Changes

- Each request to `POST /v1/contact-support` with a product-feedback topic (`Give feedback`, `Share an idea`, `Report a bug`, `AI Apps Feedback`) from a verified LabOS member becomes exactly one Linear issue in the LAB team, in an intake state (Backlog). It never goes to Todo or a started state.
- The issue carries the message as markdown, the screenshots re-uploaded to Linear (a flattened copy when one exists), the page, the reporter's name and LabOS profile link (never their email), and an "Expected result" section for triage. It is labeled `User feedback` + a Type label.
- `AI Apps Feedback` issues also go into the AI Apps project.
- The push runs after the request is saved, from a retrying, idempotent outbox. Submit never waits on, or fails because of, Linear.
- `Contact support`, `Ask a question` and other topics are unchanged: Telegram + email only. Telegram and email keep working as today for every topic.
- New shared building blocks, reused by LAB-2873 (AI App feedback → owner team): a Linear GraphQL client using OAuth client credentials, and a generic `FeedbackLinearIssue` outbox table + worker keyed by source type.
- With no Linear configuration the API behaves exactly as today.

## Capabilities

### New Capabilities

- `feedback-linear-sync`: How LabOS feedback becomes Linear issues: which submissions are pushed and where, issue content and privacy, delivery guarantees (async, retried, at most one issue per item), and behavior when Linear is not configured. This change adds the platform-feedback source; LAB-2873 extends it with AI App feedback.

### Modified Capabilities

(none)

## Impact

- **Code:** `apps/web-api/src/contact-support/` (enqueue after save); a new module for the Linear client, outbox worker and issue builder; `app.module.ts` registration.
- **DB:** additive migration with the new table `FeedbackLinearIssue` and its enums. No change to `ContactSupportRequest`.
- **Config:** new env vars `FEEDBACK_LINEAR_*` (credentials, team/state/project/label IDs, image hosts, cron, max attempts). Names only in `.env.example`; values are set by LAB-2870 through `pl-infra-pipeline`.
- **External:** Linear GraphQL API and file upload storage. No new npm dependency (axios is already present).
- **Frontend:** none required. The backend reads `metadata.reportKind`, `metadata.priority` and `data-flat-src` when LAB-2872 sends them, and works without them.
- **Docs:** a new `docs/FEEDBACK_LINEAR.md`, and a pointer from AGENTS.md's directory map if it lists modules.
