## ADDED Requirements

### Requirement: Upcoming events on the page read

The page read SHALL return `events`: `items`, the events starting in the next 28 days from the time of the read (not from the issue's send time, so a past issue still shows what's coming), by Home's events rail query (not deleted, soonest first), at most 5; and `total`, how many events that window holds. Each item has the uid, name, start and end, location, gathering uid, pln-events id, logo URL, type and `goingCount`. `goingCount` counts distinct listed members going, as the event drawer does (REJECTED members left out); the read counts as signed out, so an invite-only event's `goingCount` is null.

#### Scenario: Invite-only count hidden

- **GIVEN** an invite-only event in the next 28 days with 3 members going
- **WHEN** the page is read
- **THEN** its row has `goingCount` null

#### Scenario: Past issue shows what's coming

- **GIVEN** a member opens an issue sent two weeks ago
- **WHEN** the page is read
- **THEN** `events` holds the events of the next 28 days from now
