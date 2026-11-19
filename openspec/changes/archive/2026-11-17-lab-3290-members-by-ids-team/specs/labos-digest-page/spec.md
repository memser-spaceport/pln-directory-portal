## ADDED Requirements

### Requirement: Team membership for the digest email

`POST v1/members/by-ids` (service key) SHALL return `isTeamMember` for each member: true when the member has a team role with no end date or an end date that hasn't passed, the same rule as the page read's `isTeamMember`. The notification service SHALL show the digest email's "Got news from your team?" card only when it is true.

#### Scenario: Former team member

- **GIVEN** a member whose only team role ended last month
- **WHEN** the notification service fetches them by id
- **THEN** `isTeamMember` is false
