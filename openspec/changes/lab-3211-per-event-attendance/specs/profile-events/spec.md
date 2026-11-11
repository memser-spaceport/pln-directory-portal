# Spec Delta

## Purpose

Which IRL events show on a member profile and on a team profile, who may see them, and how a team's Demo Day appears among its past events.

## ADDED Requirements

### Requirement: A member's events are listed in two groups

The system SHALL serve `GET /v1/members/:uid/events` with an optional user token, without caching. It SHALL return `{ upcoming, past }`, each `{ page, limit, total, items }`, built only from the member's event-level guest rows on non-deleted events. An event is upcoming while its `endDate` is after now and past otherwise. Upcoming items SHALL be ordered soonest first; past items newest first. Unknown members SHALL return 404.

#### Scenario: A member with upcoming and past events

- **GIVEN** a member going to an event next month and who attended one last year
- **WHEN** a signed-in member requests their events
- **THEN** `upcoming.items` has the next-month event
- **AND** `past.items` has last year's event

#### Scenario: Gathering-level attendance is not an event

- **GIVEN** a member going to a gathering with no specific event
- **WHEN** their events are requested
- **THEN** neither group lists that gathering

### Requirement: Member event items describe the card

Each member event item SHALL include:
- the event: `uid`, `name`, `type`, `startDate`, `endDate`, `logo`
- `locationUid`, `location` (the gathering name) and `city` (the gathering name up to its first comma, or null)
- the member's `roles` (`Host`, `Speaker`, `Sponsor`; empty for plain attendance)
- `showOnProfile`
- `goingCount` and up to three `faces` (uid, name, image)
- `viewerGoing`

#### Scenario: A host's card

- **GIVEN** a member who is a host of event A in gathering "Berlin, Germany"
- **WHEN** their events are requested
- **THEN** A's item has `roles` `["Host"]` and `city` "Berlin"

### Requirement: Member event groups are paged

The endpoint SHALL accept `limit` (default 4, at most 50) and `page` (default 1) for each group. It SHALL also accept an optional `group` (`upcoming` or `past`); with it, only that group is returned, paged. `total` SHALL count every visible item in the group, so a client can show "Show all N".

#### Scenario: Show all past events

- **GIVEN** a member with 9 visible past events
- **WHEN** their events are requested with default options
- **THEN** `past.items` has 4 items and `past.total` is 9

#### Scenario: One group only

- **WHEN** their events are requested with `group=past&limit=50`
- **THEN** the response has `past` with all 9 items and no `upcoming`

### Requirement: Upcoming member events are for signed-in viewers only

For a signed-out viewer, `upcoming` SHALL be `{ page: 1, limit, total: 0, items: [] }`, and only past events SHALL be listed.

#### Scenario: A signed-out visitor

- **GIVEN** a member with upcoming and past events
- **WHEN** a signed-out visitor requests their events
- **THEN** `upcoming.total` is 0
- **AND** past events are listed

### Requirement: Hidden events are visible only to their owner

Rows with `showOnProfile` false SHALL be listed, and counted in `total`, only when the viewer is the member themselves. For any other viewer they SHALL be left out of both items and totals. The same rule SHALL apply to `eventGuests` on `GET /v1/members/:uid`.

#### Scenario: Another member views a hidden event

- **GIVEN** member M going to event A with `showOnProfile` false
- **WHEN** another signed-in member requests M's events
- **THEN** A is not listed and not counted

#### Scenario: The owner sees their hidden event

- **WHEN** M requests their own events
- **THEN** A is listed with `showOnProfile` false

#### Scenario: Member detail hides it too

- **WHEN** another member calls `GET /v1/members/M`
- **THEN** `eventGuests` has no row for A

### Requirement: A team's events are listed in two groups

The system SHALL serve `GET /v1/teams/:uid/events` with an optional user token, without caching, returning `{ upcoming, past }` with the same paging envelope as member events. It SHALL refuse a signed-out viewer with 403 when `GET /v1/teams/:uid` would, and return 404 for an unknown team.

#### Scenario: An L0 team for a signed-out visitor

- **GIVEN** a team at access level `L0`
- **WHEN** a signed-out visitor requests its events
- **THEN** the response is 403

### Requirement: A team's upcoming events come from its members' attendance

Team upcoming items SHALL be the upcoming events that the team's current members are going to with `showOnProfile` true, one item per event, soonest first. A current member has a role on the team with no end date, or an end date in the future. For a signed-out viewer, upcoming SHALL be empty.

#### Scenario: Two teammates go to the same event

- **GIVEN** two current members of team T going to event A, both shown on their profiles
- **WHEN** a signed-in member requests T's events
- **THEN** `upcoming.items` has one item for A with `memberCount` 2

#### Scenario: A hidden attendance does not count for the team

- **GIVEN** one member of T going to A with `showOnProfile` false
- **WHEN** another member requests T's events
- **THEN** A is not listed for T

#### Scenario: A former member does not count

- **GIVEN** a member whose role on T ended last month, going to event A
- **WHEN** T's events are requested
- **THEN** that member is not counted for A

### Requirement: Team upcoming items describe the team's attendance

Each team upcoming item SHALL include:
- the event fields of a member item
- `memberCount` and up to three `members` (uid, name, image) from this team
- the team's `roles` for the event (`Host`, `Speaker`, `Sponsor`), from guest rows that name the team and from the team's event associations

#### Scenario: A team sponsoring an upcoming event

- **GIVEN** team T with a `SPONSOR` association on upcoming event A, and one member going to A
- **WHEN** T's events are requested by a signed-in member
- **THEN** A's item has `roles` `["Sponsor"]` and `memberCount` 1

### Requirement: A team's past events are the events it hosted or sponsored

Team past event items SHALL be the past events the team hosted, co-hosted, spoke at or sponsored, through guest rows that name the team or the team's event associations. There SHALL be one item per event, newest first, each with `kind: "event"` and the team's `roles`. An association role of `ATTENDEE` SHALL give no role.

#### Scenario: A hosted past event

- **GIVEN** team T with a `HOST` association on an event that ended last year
- **WHEN** T's events are requested
- **THEN** `past.items` has that event with `roles` `["Host"]`

### Requirement: A team's Demo Days come first among past events

Before its past event items, the team's past list SHALL hold its Demo Days, newest first. A team's Demo Day is a non-deleted Demo Day that has ended and has at least one non-deleted `FOUNDER` participant for the team with status `ENABLED`. A Demo Day item SHALL have `kind: "demo-day"`, `title`, `slug`, `startDate` and `endDate`, and SHALL count in `past.total`.

#### Scenario: A team that took part in a Demo Day

- **GIVEN** team T with an enabled founder in a Demo Day that ended in October, and an event it hosted in September
- **WHEN** T's events are requested
- **THEN** the first past item is the Demo Day with its slug
- **AND** the hosted event follows it

#### Scenario: A disabled founder does not count

- **GIVEN** team T whose only founder participant in a Demo Day is `DISABLED`
- **WHEN** T's events are requested
- **THEN** no Demo Day item is listed
