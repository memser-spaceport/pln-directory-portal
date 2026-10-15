# Spec Delta

## Purpose

Turns feedback that LabOS members submit into Linear issues the team can triage and build from. Delivery is asynchronous and reliable, and it never exposes reporter email or blocks the submission itself.

## ADDED Requirements

### Requirement: Platform feedback topics create a LAB issue
The system SHALL create exactly one Linear issue for each contact-support request whose topic is `Give feedback`, `Share an idea`, `Report a bug` or `AI Apps Feedback`, when Linear is configured and the reporter is a verified member. The issue SHALL be created in the configured platform team.

#### Scenario: Feedback topic from a member
- **WHEN** a signed-in member submits the help-menu dialog with topic `Report a bug`
- **THEN** exactly one issue is created in the configured platform team

#### Scenario: Support topic
- **WHEN** a request arrives with topic `Contact support` or `Ask a question`
- **THEN** no Linear issue is created, and Telegram and email are sent as before

#### Scenario: Unknown topic
- **WHEN** a request arrives with any other topic string
- **THEN** no Linear issue is created

### Requirement: Only verified members' feedback is pushed
The system SHALL push a request only when `metadata.uid` names an existing member whose email equals the request email, case-insensitively. Other requests SHALL be saved and sent to Telegram and email as today, without a Linear issue.

#### Scenario: uid and email match
- **WHEN** `metadata.uid` is a member whose email matches the request email
- **THEN** the request is pushed to Linear

#### Scenario: Missing or mismatched identity
- **WHEN** `metadata.uid` is absent, unknown, or belongs to a member with a different email
- **THEN** no Linear issue is created and the response is unchanged

### Requirement: Issues land in an intake state
The system SHALL create every issue in the configured intake state, which is a backlog-type state. It SHALL never use Todo or a started state, so the Horizon AutoDev gate does not act on an issue before a person triages it.

#### Scenario: Created in intake
- **WHEN** an issue is created
- **THEN** its state is the configured intake state (LAB `Backlog` in prod)

### Requirement: AI Apps platform feedback goes into the AI Apps project
The system SHALL put issues for topic `AI Apps Feedback` into the configured AI Apps project, and issues for other topics into no project.

#### Scenario: Drawer's LabOS option
- **WHEN** the topic is `AI Apps Feedback`
- **THEN** the issue's project is the configured AI Apps project

#### Scenario: Help-menu topic
- **WHEN** the topic is `Give feedback`
- **THEN** the issue has no project

### Requirement: Issue title
The system SHALL title each issue `[Feedback] <first line>`. `<first line>` is the first non-empty line of the message as plain text, cut to 80 characters with an ellipsis when longer. An empty message yields `[Feedback] <topic>`.

#### Scenario: Long first line
- **WHEN** the message's first line is 120 characters of plain text
- **THEN** the title is `[Feedback] ` followed by the first 79 characters and `…`

#### Scenario: Rich text first line
- **WHEN** the message is `<p><strong>Search</strong> is slow</p>`
- **THEN** the title is `[Feedback] Search is slow`

### Requirement: Issue body layout
The system SHALL write the body as markdown, in this order: reporter line; topic and environment; page URL when `metadata.page` is an http(s) URL; `## What they said`; `## Screenshots` when there are images; `## Context` when `metadata.context` exists; `## Expected result` with a triage placeholder; the request uid.

#### Scenario: Full request
- **WHEN** a request has text, two images and a page URL
- **THEN** the body has the sections in that order, each image appears under Screenshots, and the last line names the request uid

#### Scenario: Expected result placeholder
- **WHEN** any issue is created
- **THEN** the body contains `## Expected result` followed by `_Fill in during triage before moving to Todo._`

### Requirement: Reporter privacy
The body SHALL identify the reporter by member name and a link to their LabOS profile (`<WEB_UI_BASE_URL>/members/<uid>`). The reporter's email SHALL NOT appear in the issue: where the message itself contains it, it SHALL be replaced with `[email hidden]`.

#### Scenario: No email
- **WHEN** an issue is created for a member with email `a@b.co`
- **THEN** the string `a@b.co` does not occur in the issue title or body

#### Scenario: Email typed into the message
- **WHEN** the member writes "reach me at A@b.co" in the message
- **THEN** the issue says "reach me at [email hidden]"

#### Scenario: Profile link
- **WHEN** the reporter is member `m1` named `Ada`
- **THEN** the body says `Reported by [Ada](<WEB_UI_BASE_URL>/members/m1)`

### Requirement: Message converted to markdown
The system SHALL convert the message's sanitized HTML to markdown, keeping bold, italic, links (http, https and mailto only), headings, lists and line breaks. Other markup SHALL be dropped as plain text. A plain-text message SHALL be kept as is.

#### Scenario: Unsafe link dropped
- **WHEN** the message contains `<a href="javascript:alert(1)">x</a>`
- **THEN** the body contains `x` and no `javascript:` link

### Requirement: Screenshots re-uploaded to Linear
For each image in the message, the system SHALL re-upload the image to Linear's file storage and embed the uploaded copy. When an image has `data-flat-src`, it SHALL use that URL instead of `src`. When one upload fails, the body SHALL contain a plain link to the original URL for that image, and the issue SHALL still be created.

#### Scenario: Annotated screenshot
- **WHEN** an `<img>` has `src="https://h/raw.png"` and `data-flat-src="https://h/flat.png"`
- **THEN** the issue embeds a Linear-hosted copy of `flat.png`

#### Scenario: Upload failure
- **WHEN** downloading or uploading one image fails
- **THEN** the issue is created and that image appears as a link to its original URL

### Requirement: Image fetches restricted to allowed hosts
The system SHALL download an image only over https, from a host in the configured allowlist, at most 10 MB, within 10 seconds, and only when the response is an image content type. Any other image URL SHALL appear as a plain link and SHALL never be fetched by the server.

#### Scenario: Host not allowed
- **WHEN** a message contains `<img src="https://169.254.169.254/x.png">`
- **THEN** the server makes no request to that host and the body links the URL as text

#### Scenario: Too large
- **WHEN** an allowed image is larger than 10 MB
- **THEN** it is not uploaded and appears as a link

### Requirement: Labels and priority
Each issue SHALL carry the configured `User feedback` label and one Type label from the platform team. `Report a bug`, or `metadata.reportKind` = `bug`, maps to `Bug`; `Share an idea` maps to `Feature`; anything else maps to `Improvement`. `metadata.priority` P0/P1/P2/P3 SHALL map to Urgent/High/Medium/Low, otherwise no priority. Issues SHALL be unassigned and carry no Scope, Department, Domain or agent label.

#### Scenario: Drawer bug report
- **WHEN** topic is `AI Apps Feedback` with `metadata.reportKind = "bug"` and `metadata.priority = "P1"`
- **THEN** the issue has labels `User feedback` and `Bug`, and High priority

#### Scenario: Missing Type label
- **WHEN** the team has no label with the mapped Type name
- **THEN** the issue is created with only the `User feedback` label

### Requirement: Submission never depends on Linear
The system SHALL save the request and respond exactly as it does without Linear. It SHALL record the push for later delivery and SHALL NOT call Linear during the request. No Linear error SHALL change the contact-support response.

#### Scenario: Linear down
- **WHEN** Linear is unreachable and a member submits feedback
- **THEN** the response is `201 { uid }` as before and the push stays pending

### Requirement: Pushes are retried with backoff
A failed push SHALL be retried with exponential backoff: 30 seconds doubling, capped at 1 hour. After the configured maximum attempts (default 8), the push SHALL be marked failed with the last error kept. A push SHALL never be attempted by two workers at the same time.

#### Scenario: Transient failure
- **WHEN** the first attempt gets a Linear 5xx
- **THEN** the push stays pending and is retried no earlier than 30 seconds later

#### Scenario: Gives up
- **WHEN** the 8th attempt fails
- **THEN** the push is marked failed with that error and is not retried again

#### Scenario: Two API pods
- **WHEN** two instances run the worker at the same moment
- **THEN** each pending push is claimed by at most one of them

### Requirement: At most one issue per feedback item
The system SHALL create at most one Linear issue per contact-support request, including after retries, timeouts and restarts.

#### Scenario: Timeout after Linear created the issue
- **WHEN** Linear creates the issue but the response times out, and the push is retried
- **THEN** no second issue is created and the push is marked synced with the existing issue

### Requirement: No Linear configuration means no change
When the Linear credentials or the platform team are not configured, the API SHALL start normally. Contact-support SHALL behave exactly as before, no pushes SHALL be recorded, and the worker SHALL do nothing.

#### Scenario: Unconfigured environment
- **WHEN** the API starts with no `FEEDBACK_LINEAR_*` variables and a member submits `Report a bug`
- **THEN** the request is saved, Telegram and email are sent, and no push is recorded

### Requirement: Credentials are never persisted or logged
The system SHALL keep the Linear OAuth access token in memory only, refreshing it before expiry. It SHALL NOT write client secrets or tokens to the database, logs or stored error text.

#### Scenario: Auth error stored
- **WHEN** a push fails with a Linear authentication error
- **THEN** the stored last error describes the failure without containing the token or client secret
