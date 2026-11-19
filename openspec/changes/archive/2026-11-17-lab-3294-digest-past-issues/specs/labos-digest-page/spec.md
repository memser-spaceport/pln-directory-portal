## ADDED Requirements

### Requirement: Recording sent issues

`POST v1/service/labos-digest/issues` with the service key SHALL record each member's issue as sent: member, frequency, send time, news item uids in email order, top story and forum topic ids (the link token's fields). An issue already recorded for the same member, frequency and send time SHALL be skipped. Issues of members that don't exist SHALL be left out. A top story that isn't among the stories SHALL be stored as none. The response SHALL say how many were recorded.

#### Scenario: Recorded twice

- **GIVEN** the notification service records member M's weekly issue sent at 2026-11-09 11:00 UTC
- **WHEN** it records the same issue again
- **THEN** the second call records 0 and the issue is stored once

### Requirement: Past issues on the page read

The page read SHALL return `issues`: the token member's latest recorded issues, newest first, at most 8, each with `sentAt`, `frequency`, `title` (the top story's title, else the first story's, null when that story is gone) and `isLinkIssue`. The token's own issue SHALL always be listed, even when it was not recorded; when that makes nine, the oldest other issue is left out. With `issue` (a send time) the read SHALL return that recorded issue of the same member, with its own stories, top story, forum posts, frequency and `sentAt`; another member's issue or an unknown one SHALL be not found. `issue` equal to the token's send time SHALL read the token's issue. More and Less with `issue` SHALL accept only stories of that issue.

#### Scenario: Open a past issue

- **GIVEN** member M's link for the 16 November issue, and M's recorded issue of 9 November with stories Y, X and top story X
- **WHEN** the page is read with `issue` = 9 November
- **THEN** it returns stories Y, X with X as the top story and `sentAt` 9 November

#### Scenario: Link sent before recording

- **GIVEN** M's link issue was not recorded and M has two recorded issues
- **WHEN** the page is read
- **THEN** `issues` lists all three newest first, and only the link's has `isLinkIssue: true`
