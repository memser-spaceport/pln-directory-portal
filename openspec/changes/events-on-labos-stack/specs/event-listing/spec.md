# Spec Delta

## Purpose

The list of approved events with search, filters and paging, used by the All Events page in its list, calendar and map views.

## ADDED Requirements

### Requirement: Approved events can be listed with paging

The system SHALL serve `GET /v1/irl/events` with an optional user token. It SHALL return `{ page, limit, total, items }` of approved, non-deleted events, ordered by start date, earliest first. With no date filter it SHALL return only events that have not ended. `limit` SHALL default to 50 and SHALL be at most 100; a larger value SHALL answer 400.

#### Scenario: Default list

- **GIVEN** one ended event and two events that have not ended
- **WHEN** `GET /v1/irl/events` is called with no query
- **THEN** `total` is 2
- **AND** the items are ordered by start date, earliest first

#### Scenario: Second page

- **GIVEN** 60 events that have not ended
- **WHEN** `GET /v1/irl/events?page=2&limit=50` is called
- **THEN** `items` has 10 events and `total` is 60

#### Scenario: Limit too large

- **WHEN** `GET /v1/irl/events?limit=500` is called
- **THEN** the response is 400

### Requirement: Each listed event carries what a card, a calendar and a map need

Each item SHALL include `uid`, `name`, `startDate`, `endDate`, `allDay`, `timezone`, `format`, `accessOption`, `tags`, `isFeatured`, `logo`, `banner`, `host` (name and logo), its gathering (`uid`, `city`, `country`), its venue (`address`, `latitude`, `longitude`), `goingCount`, `faces` (up to 3 members going) and, for a signed-in viewer, `isGoing`. A missing value SHALL be null or an empty list. An invite-only event SHALL have `goingCount` null and no `faces`. An event is invite-only when its `type` is `INVITE_ONLY` or its `accessOption` is `INVITE`; the drawer uses the same rule for signed-out viewers.

#### Scenario: An event with venue coordinates

- **GIVEN** an approved in-person event with a venue latitude and longitude
- **WHEN** the list is read
- **THEN** the item has those coordinates and the gathering's city

#### Scenario: A virtual event

- **GIVEN** an approved virtual event
- **WHEN** the list is read
- **THEN** the item's venue and gathering are null and `format` is `VIRTUAL`

#### Scenario: An INVITE access event with no type

- **GIVEN** an approved event with `accessOption` `INVITE`, `type` null and going members
- **WHEN** the list is read
- **THEN** the item has `goingCount` null and no `faces`

#### Scenario: A signed-out viewer

- **WHEN** the list is read with no user token
- **THEN** no item has `isGoing` set to true

### Requirement: The list can be searched and filtered

The list SHALL accept `search` (matched on the event name and host name, ignoring case), `city`, `format`, `accessOption`, `tag`, `host`, `featured`, `from` and `to`. `city`, `format`, `accessOption`, `tag` and `host` SHALL each accept several values; an event matches when it has any one of them. Different filters SHALL combine with AND. `from` and `to` SHALL select events that overlap that date range, ended events included. An unknown filter value SHALL answer 400.

#### Scenario: Two cities and one format

- **GIVEN** in-person events in Lisbon and Denver and a virtual event
- **WHEN** the list is read with `city=Lisbon&city=Denver&format=IN_PERSON`
- **THEN** the two in-person events are returned and the virtual one is not

#### Scenario: A past month

- **GIVEN** an event that ended last month
- **WHEN** the list is read with `from` and `to` set to last month
- **THEN** the event is returned

#### Scenario: A filter with no match

- **WHEN** the list is read with a tag no event has
- **THEN** the response is 200 with `total` 0 and no items

### Requirement: A member can filter to the events they are going to

The list SHALL accept `going=true` for a signed-in member and SHALL then return only events that member is going to. `going=true` with no user token SHALL answer 401.

#### Scenario: Going filter for a signed-in member

- **GIVEN** member M is going to event A and not to event B
- **WHEN** M reads the list with `going=true`
- **THEN** A is returned and B is not

#### Scenario: Going filter when signed out

- **WHEN** the list is read with `going=true` and no user token
- **THEN** the response is 401
