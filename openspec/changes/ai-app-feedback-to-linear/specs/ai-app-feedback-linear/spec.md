# Spec Delta

## Purpose

Sends the private feedback members leave on AI Apps to one Linear team, in the background and invisibly to LabOS users. LabOS review status stays reflected in Linear, and reporter emails never reach Linear.

## ADDED Requirements

### Requirement: Member-app feedback goes to one configured team
The system SHALL queue exactly one push for each `FEEDBACK` item submitted on any member AI App, to the team named by `FEEDBACK_LINEAR_MEMBER_APPS_TEAM_ID` and the optional project named by `FEEDBACK_LINEAR_MEMBER_APPS_PROJECT_ID`. `COMMENT` items SHALL never be pushed. Without a member-apps team or without Linear credentials, nothing SHALL be queued.

#### Scenario: Private feedback
- **WHEN** a member submits a `FEEDBACK` item on an app and the member-apps team is configured
- **THEN** exactly one push is queued for that team and project

#### Scenario: Comment
- **WHEN** a member leaves a pinned `COMMENT` on the same app
- **THEN** nothing is queued

#### Scenario: Not configured
- **WHEN** `FEEDBACK_LINEAR_MEMBER_APPS_TEAM_ID` is unset
- **THEN** submitting feedback queues nothing and behaves as before

### Requirement: Nothing about Linear is visible in LabOS
Submitting, listing, updating and deleting feedback SHALL look and respond exactly as without Linear. No LabOS route, setting or response field SHALL expose the Linear push.

#### Scenario: Feedback lists
- **WHEN** an app's creator lists the app's feedback after items were pushed
- **THEN** the rows carry no Linear fields

### Requirement: Issue content
Each issue SHALL be titled `[<app name>] <first line>`. `<first line>` is the item's first non-empty line as plain text, cut to 80 characters with an ellipsis when longer.

The markdown body SHALL contain, in order:
- the reporter line: reporter name + LabOS profile link, the app name, the app owner's name + LabOS profile link, and the environment
- `## What they said`
- `## Screenshots` (the item's images and pin crops)
- `## Context`, when present
- `## Expected result` with the triage placeholder
- a LabOS link to the item

Pins SHALL appear as the item's text already lists them. The issue SHALL be unassigned.

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

### Requirement: Labels and priority
- **Labels:** the issue SHALL carry the team's `User feedback` label when one exists for that team. It SHALL carry a Type label when the item has a `reportKind` that maps to one the team has: `bug` → `Bug`, `request` → `Improvement`. Otherwise it SHALL carry no Type label.
- **Priority:** P0–P3 SHALL map to Urgent/High/Medium/Low, and there is no priority when the item has none.

#### Scenario: Bug with priority
- **WHEN** an item has `reportKind: bug` and `priority: P0`, and the team has `Bug` and `User feedback` labels
- **THEN** the issue has both labels and Urgent priority

### Requirement: Issues land in the team's intake state
The system SHALL create each issue in the team's triage state when triage is enabled, and otherwise in the team's first backlog-type state by position. It SHALL never use an unstarted (Todo) or started state. A team with neither SHALL fail the push with an error naming the team.

#### Scenario: Team without triage
- **WHEN** the team has triage off and backlog states `Backlog` (position 0) and `Icebox` (position 1)
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
