# Spec Delta

## Purpose

Lets an AI App's owner receive the app's private feedback as Linear issues in a team they choose. LabOS review status stays reflected in Linear, and the feedback never reaches the LAB team or reporters' emails.

## ADDED Requirements

### Requirement: Owner or admin manages the app's Linear target
`GET` and `PUT /v1/ai-apps/:uid/linear-target` SHALL be allowed only for the app's creator or a directory admin. Anyone else SHALL get 403, and an unknown or deleted app SHALL get 404. The PUT body `{ teamId, projectId? }` SHALL replace the target, and `{ teamId: null }` SHALL clear it. Both SHALL return `{ teamId, projectId, setAt }`, with nulls when no target is set.

#### Scenario: Owner sets a target
- **WHEN** the app's creator PUTs `{ teamId: "T", projectId: "P" }` for a private team T that has project P
- **THEN** the response is `{ teamId: "T", projectId: "P", setAt: <now> }` and later GETs return the same

#### Scenario: Clearing
- **WHEN** a directory admin PUTs `{ teamId: null }`
- **THEN** the target is cleared and new feedback on the app creates no Linear issue

#### Scenario: Not a manager
- **WHEN** a member who is neither the creator nor a directory admin calls either route
- **THEN** the response is 403

### Requirement: Target validation
A PUT SHALL be rejected with 400 when the team is unknown to the Linear app or is not private, or when the project does not belong to the team. The message SHALL name the offending id. Both routes SHALL return 503 when the Linear credentials are not configured.

#### Scenario: Public team
- **WHEN** the PUT names a team that is not private
- **THEN** the response is 400 and nothing is saved

#### Scenario: Project outside the team
- **WHEN** the PUT names project P that belongs to a different team
- **THEN** the response is 400 naming P

#### Scenario: Not configured
- **WHEN** `FEEDBACK_LINEAR_CLIENT_ID` is unset and a manager calls `GET /v1/ai-apps/:uid/linear-target`
- **THEN** the response is 503

### Requirement: Saving a target re-queues failed pushes
A successful PUT that sets a team SHALL return the app's `FAILED` pushes to pending with attempts reset. They SHALL keep the team they were queued with.

#### Scenario: Retry after a fix
- **WHEN** an app has two `FAILED` pushes and its manager saves the target again
- **THEN** both pushes are pending with zero attempts and are retried on the next worker run

### Requirement: Team listing is limited to the requester's own private teams
`GET /v1/ai-apps/linear/teams` SHALL require AI Apps read access. It SHALL return `[{ id, key, name, projects: [{ id, name }] }]` for the private teams the requester belongs to in Linear, matched by their LabOS email. A directory admin SHALL get every private team the Linear app can reach. Public teams SHALL never be returned. A requester with no Linear account SHALL get an empty list. The route SHALL return 503 when Linear is not configured.

#### Scenario: Owner with a Linear account
- **WHEN** a member who belongs to private teams A and B and public team C calls the route
- **THEN** the response lists A and B with their projects, and not C

#### Scenario: No Linear account
- **WHEN** no active Linear user has the requester's email
- **THEN** the response is `[]`

#### Scenario: Directory admin
- **WHEN** a directory admin calls the route
- **THEN** every private team the Linear app can reach is listed

### Requirement: Which feedback items become issues
The system SHALL queue exactly one push for each `FEEDBACK` item submitted on an app that had a Linear target when the item was created. `COMMENT` items, items on apps without a target, and items created before the target was set SHALL never be pushed. Queueing SHALL never fail or delay the submission.

#### Scenario: Private feedback after the target was set
- **WHEN** a member submits a `FEEDBACK` item on an app with a target
- **THEN** exactly one push is queued for the app's target team and project

#### Scenario: Comment
- **WHEN** a member leaves a pinned `COMMENT` on the same app
- **THEN** nothing is queued

#### Scenario: Older feedback
- **WHEN** a target is set on an app that already has 20 feedback items
- **THEN** none of those 20 items is pushed

### Requirement: Issue content
Each issue SHALL be titled `[<app name>] <first line>`. `<first line>` is the item's first non-empty line as plain text, cut to 80 characters with an ellipsis when longer. The markdown body SHALL contain, in order:
- the reporter line, with name + LabOS profile link
- `## What they said`
- `## Screenshots` (the item's images and pin crops)
- `## Context`, when present

Pins appear as the item's text already lists them.
- `## Expected result` with the triage placeholder
- a LabOS link to the item

#### Scenario: Pinned feedback
- **WHEN** an item with two pins and one screenshot is pushed
- **THEN** the pin list written in the item's text appears under What they said, the screenshot and both pin crops appear under Screenshots, and the last line links to the item in LabOS

#### Scenario: Title
- **WHEN** the app is named `Ops Board` and the item starts with "Filters reset on refresh"
- **THEN** the title is `[Ops Board] Filters reset on refresh`

### Requirement: Reporter email never appears
The issue SHALL identify the reporter by member name and LabOS profile link. The reporter's email SHALL NOT appear: where the item's text contains it, it SHALL be replaced with `[email hidden]`.

#### Scenario: Email in the text
- **WHEN** the reporter wrote their own email address in the item
- **THEN** the issue body shows `[email hidden]` in its place

### Requirement: Images use the shared copy rules
Images and pin crops SHALL be copied into Linear under the same rules as platform feedback: a flattened copy is preferred, downloads come only from allowlisted https hosts with the 10 MB / 10 s limits, and anything else becomes a link.

#### Scenario: Disallowed host
- **WHEN** the item's HTML contains an image on a host outside the allowlist
- **THEN** that host is never fetched and the image appears as a link

### Requirement: Labels, priority and assignee
- **Labels:** the issue SHALL carry the team's `User feedback` label when one exists for that team. It SHALL carry a Type label when the item has a `reportKind` that maps to one the team has: `bug` → `Bug`, `request` → `Improvement`. Otherwise it SHALL carry no Type label.
- **Priority:** P0–P3 SHALL map to Urgent/High/Medium/Low, and there is no priority when the item has none.
- **Assignee:** the active Linear user whose email matches the app owner's email, otherwise unassigned.

#### Scenario: Bug with priority
- **WHEN** an item has `reportKind: bug` and `priority: P0`, and the team has `Bug` and `User feedback` labels
- **THEN** the issue has both labels and Urgent priority

#### Scenario: Owner without a Linear account
- **WHEN** no active Linear user has the owner's email
- **THEN** the issue is created unassigned

### Requirement: Issues land in the team's intake state
The system SHALL create each issue in the team's triage state when triage is enabled, and otherwise in the team's first backlog-type state by position. It SHALL never use an unstarted (Todo) or started state. A team with neither SHALL fail the push with an error naming the team.

#### Scenario: Team without triage
- **WHEN** the target team has triage off and backlog states `Backlog` (position 0) and `Icebox` (position 1)
- **THEN** the issue is created in `Backlog`

### Requirement: LabOS status changes are mirrored in Linear
For a pushed item, status changes from any route (LabOS, agent, MCP) SHALL update the Linear issue:
- `IMPLEMENTED` SHALL move it to the team's first completed state and post the closing note, when given, as a comment.
- Moving from `IMPLEMENTED` back to `NEW` or `VIEWED` SHALL return it to the intake state it was created in.
- A change between `NEW` and `VIEWED` SHALL change nothing.

The sync SHALL be asynchronous and retried, and SHALL apply even when the change happened before the issue was created.

#### Scenario: Implemented with a note
- **WHEN** the owner's agent marks a pushed item `IMPLEMENTED` with note "Fixed in v2"
- **THEN** the issue moves to the completed state and gets the comment "Fixed in v2"

#### Scenario: Reopened
- **WHEN** an `IMPLEMENTED` item is set back to `NEW` in LabOS
- **THEN** the issue returns to its intake state

#### Scenario: Viewed only
- **WHEN** a `NEW` item is set to `VIEWED`
- **THEN** no Linear call is made for it

#### Scenario: Change before creation
- **WHEN** an item is marked `IMPLEMENTED` while its push is still pending
- **THEN** the issue is created and then moved to the completed state

### Requirement: Deleting an item cancels its issue
Deleting a pushed item SHALL move its issue to the team's first canceled state. Deleting an item whose issue was never created SHALL create no issue, and the push SHALL end as `SKIPPED`.

#### Scenario: Delete after push
- **WHEN** an item with a synced issue is deleted
- **THEN** the issue moves to the canceled state

#### Scenario: Delete before push
- **WHEN** an item is deleted while its push is pending and no issue exists
- **THEN** no issue is created and the push is `SKIPPED`

### Requirement: Linear never blocks or changes LabOS
Submit, status change and delete SHALL succeed and respond as they do without Linear, whatever Linear does. Changes made in Linear SHALL never change LabOS data.

#### Scenario: Linear down during a status change
- **WHEN** Linear is unreachable and the owner marks an item `IMPLEMENTED`
- **THEN** the response is the normal success, and the issue update is retried later

### Requirement: Owners and admins see the Linear issue
Feedback rows returned to an app's creator or a directory admin SHALL carry `linearIssue: { status, identifier, url, lastError }`, or `null` when the item has no push. This covers the per-app list, the cross-app review list, the agent list and the MCP list. The reporter's own list (`/feedback/mine`) SHALL NOT include the field.

#### Scenario: Synced item in the owner list
- **WHEN** the owner lists an app's feedback and one item was pushed as `ABC-12`
- **THEN** that row's `linearIssue` is `{ status: "SYNCED", identifier: "ABC-12", url: <issue url>, lastError: null }`

#### Scenario: Reporter's own list
- **WHEN** the reporter lists their own feedback
- **THEN** no row has a `linearIssue` field
