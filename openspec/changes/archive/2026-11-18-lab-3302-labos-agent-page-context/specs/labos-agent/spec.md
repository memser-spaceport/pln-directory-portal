## ADDED Requirements

### Requirement: Page context for member, team, job and profile pages

When `context.page` is `member`, `team` or `job` with a `jobUid`, the system SHALL look up the page before the stream starts, after the pilot gate. A member outside the gate SHALL get HTTP 403 `AGENT_NOT_ENABLED` and no lookup SHALL run. The `member` page SHALL use a member with no `deletedAt`; else HTTP 404 `MEMBER_NOT_FOUND`. The `team` page SHALL use the rule of `GET /v1/teams/:uid` (`TeamsService.assertTeamVisibleToViewer`); every case that hides the page (unknown, `INACTIVE` for a member who is not a directory admin, L0 for a member who is not a lead or admin) SHALL get HTTP 404 `TEAM_NOT_FOUND`, also where the GET gives 403. The `job` page SHALL use the rule of `GET /v1/job-openings/:uid` (`JobOpeningsQueryService.getJobOpening`); an unknown job, a hidden status or a job with no team SHALL get HTTP 404 `JOB_NOT_FOUND`. A job of an `INACTIVE` team SHALL show, as on the GET. `job` with no `jobUid` (the job board) and `profile` SHALL make no lookup. A `member` page with the session member's own uid SHALL be the `profile` page. The 404 body SHALL be `{ statusCode, code, message }`, and no model call SHALL run.

#### Scenario: Deleted member page

- **GIVEN** a `memberUid` of a member with `deletedAt` set
- **WHEN** the member asks on that page
- **THEN** the response is HTTP 404 with code `MEMBER_NOT_FOUND`
- **AND** no stream starts

#### Scenario: L0 team for a member who is not a lead

- **GIVEN** a team with access level L0 and a member who is not its lead or an admin
- **WHEN** the member asks on the team page
- **THEN** the response is HTTP 404 with code `TEAM_NOT_FOUND`, not 403

#### Scenario: Hidden job

- **GIVEN** a job with status `STALE`, or a job with no team
- **WHEN** the member asks on the job page
- **THEN** the response is HTTP 404 with code `JOB_NOT_FOUND`

#### Scenario: Own member page

- **GIVEN** a `member` page with the session member's own uid
- **WHEN** the member asks
- **THEN** the turn gets the `profile` context and no lookup runs

### Requirement: Public fields only in the page context

The page context SHALL hold one plain sentence and the JSON of the row, from the database and not from the body. The `member` context SHALL have only `uid`, `name`, `bio` (plain text, HTML removed, up to 1000 characters), `teams` (`uid`, `name`, `role` for each current role on a team that is not `INACTIVE`) and `skills` (names). The `team` context SHALL have `uid`, `name` and `shortDescription`. The `job` context SHALL have `uid`, `roleTitle`, `team` (`uid`, `name`), `roleCategory`, `seniority`, `location`, `workMode`, `department`, `postedDate`, `pay` (when present), `applyUrl` and `description` (plain text, up to 2000 characters). The job board context SHALL say to use `getJobOpenings`. The `profile` context SHALL have only the session member's `uid` and the hint to call `get_my_profile`. No context SHALL have an email, a phone, a social handle, Telegram, an office hours link, `jobReferEmail`, `interestedCount`, `viewerIsInterested` or a viewer-gated field.

#### Scenario: Member page with private fields

- **GIVEN** a member with an email, a Telegram handle and a Twitter handle
- **WHEN** another member asks on their page
- **THEN** the page context has none of these values

### Requirement: Intro target on member and team pages

On a `member` or `team` page, the page target SHALL also be the intro target of the turn, with the name from the agent target lookup (`IntroRequestsService.findAgentTargetName`). If the lookup gives no name (for example, a directory admin on an `INACTIVE` team), the turn SHALL have no intro target and no error. `draft_intro` SHALL keep all S3 steps. The `profile`, `job` and `home` pages SHALL have no intro target.

#### Scenario: Draft on a team page

- **GIVEN** an eligible member on the page of team T
- **WHEN** the model calls `draft_intro` for T
- **THEN** the body has one draft with the target T
- **AND** a call for another uid gives `drafts: []`

## MODIFIED Requirements

### Requirement: Validate the chat body

The chat body SHALL have `threadId` and `chatId` (1 to 64 characters), `message` (1 to 2000 characters after trim) and an optional `context`. `context.page` SHALL be `news-story`, `home`, `intro`, `member`, `team`, `job` or `profile`. `context.newsUid` SHALL be present when `page` is `news-story`. `context.introTarget` (`type` `member` or `team`, `uid` 1 to 64 characters) SHALL be present when `page` is `intro`, and SHALL NOT be present for other pages. `context.memberUid` (1 to 64 characters) SHALL be present when `page` is `member` and SHALL NOT be present for other pages. `context.teamUid` (1 to 64 characters) SHALL be present when `page` is `team` and SHALL NOT be present for other pages. `context.jobUid` (1 to 64 characters) is optional when `page` is `job` and SHALL NOT be present for other pages. `profile` has no id field. A body that fails these rules SHALL get HTTP 400 with code `VALIDATION_ERROR` before the stream starts.

#### Scenario: Blank message

- **GIVEN** a message of only spaces
- **WHEN** the member posts it
- **THEN** the response is HTTP 400 with code `VALIDATION_ERROR`

#### Scenario: Member page with no uid

- **GIVEN** `context.page` `member` with no `memberUid`
- **WHEN** the member posts it
- **THEN** the response is HTTP 400 with code `VALIDATION_ERROR` and the path `context.memberUid`
