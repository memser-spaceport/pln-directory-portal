## ADDED Requirements

### Requirement: More from the network on the page read

The page read SHALL return `networkNews`: other press about network teams for the issue's week. An item counts when it was ingested, not posted by a member (`postedByMemberUid` is null), it was added in the 7 days before the issue's send time, it isn't one of the issue's stories, and its team isn't one the feed hides. At most 5, newest event first. Each row has the uid, title, source URL, outlet domain (from the URL when not stored), image, event date and team name. An empty list means the page shows no section.

#### Scenario: A story is not repeated

- **GIVEN** an issue whose stories include news item `a`
- **WHEN** the page reads it
- **THEN** `networkNews` does not contain `a`

#### Scenario: Member posts are left out

- **GIVEN** a news item a team member posted in the issue's week
- **WHEN** the page reads the issue
- **THEN** `networkNews` does not contain it

#### Scenario: A past issue keeps its own week

- **GIVEN** a member opens a past issue sent on 10 November
- **WHEN** the page reads it
- **THEN** `networkNews` holds press added between 3 and 10 November
