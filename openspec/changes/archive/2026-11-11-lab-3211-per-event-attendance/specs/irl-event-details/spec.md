# Spec Delta

## Purpose

Reading one IRL event for display: its details synced from the PL events service, its gathering, its hosts and who is going. It also covers the gathering uid on upcoming events, so any event list can open the event.

## ADDED Requirements

### Requirement: One event can be read by uid

The system SHALL serve `GET /v1/irl/events/:uid` with an optional user token, without caching. It SHALL return the event's `uid`, `name`, `type`, `startDate`, `endDate`, `description`, `logo`, `banner`, `websiteUrl`, `externalId` and `resources`, plus its gathering (`uid`, `location`, `flag`, `timezone`, `resources`). Unknown or deleted events SHALL return 404. Private resources SHALL be left out for signed-out viewers, as the existing event reads do.

#### Scenario: A signed-in member opens an event

- **GIVEN** a non-deleted event A in gathering G
- **WHEN** a signed-in member calls `GET /v1/irl/events/A`
- **THEN** the response includes A's dates and description, and G's uid and timezone

#### Scenario: A deleted event

- **GIVEN** an event marked deleted
- **WHEN** its uid is requested
- **THEN** the response is 404

#### Scenario: Static paths keep working

- **WHEN** `GET /v1/irl/events/upcoming` or `GET /v1/irl/events/contributors` is called
- **THEN** each returns what it returned before this change

### Requirement: The event read includes the gathering's events and the viewer's attendance

The event read SHALL also include `slugURL` and `shortDescription`; on the gathering, `city` (its name up to the first comma) and `events`, the gathering's non-deleted events the viewer may see under the attendee list's invite-only rule; and `viewer`, the signed-in viewer's own `showOnProfile` and `roles` (`Host`, `Speaker`, `Sponsor`) when they are going, otherwise null. Host and face `image` SHALL be an image URL or null.

#### Scenario: A signed-out viewer and an invite-only sibling

- **GIVEN** gathering "Lisbon, Portugal" with an `IN_PERSON` event A and an `INVITE_ONLY` event B
- **WHEN** a signed-out viewer reads A
- **THEN** `location.city` is `Lisbon`
- **AND** `location.events` lists A but not B
- **AND** `viewer` is null

#### Scenario: A going viewer who hid the event

- **GIVEN** the viewer is going to A as a speaker, with A hidden from their profile
- **WHEN** they read A
- **THEN** `viewer` is `{ showOnProfile: false, roles: ["Speaker"] }`

### Requirement: The event read includes the synced details

The event read SHALL include `details`, taken from the events service:
- `tags` (`name`, `color`)
- `accessType`, `accessOption`, `format`
- `host` (`name`, `logo`), `coHosts`, `sponsors`
- `agenda` (with its sessions)

A field the events service did not send SHALL be null or an empty list, never an error.

#### Scenario: An event with an agenda and tags

- **GIVEN** an event whose events-service record has two tags and an agenda with sessions, synced after this change
- **WHEN** the event is read
- **THEN** `details.tags` has the two tags
- **AND** `details.agenda` has the sessions

#### Scenario: An event synced before this change

- **GIVEN** an event that has never been resynced
- **WHEN** it is read
- **THEN** `details.tags` is an empty list and `details.agenda` is null

### Requirement: The event read includes hosts and an attendance summary

The event read SHALL include:
- `hosts`: members with `isHost` on this event (uid, name, image).
- `goingCount`: the number of distinct members going to this event.
- `faces`: up to three of those members (uid, name, image).
- `viewerGoing`: true only when the signed-in viewer has a guest row for this event.

For a signed-out viewer of an `INVITE_ONLY` event, `goingCount` SHALL be 0 and `faces` empty. REJECTED members SHALL be left out, as in the attendee list; `showOnProfile` SHALL NOT matter.

#### Scenario: The viewer is going

- **GIVEN** three members going to event A, one of them the viewer
- **WHEN** the viewer reads A
- **THEN** `goingCount` is 3
- **AND** `viewerGoing` is true

#### Scenario: A rejected member is going

- **GIVEN** three members going to event A, one of them REJECTED
- **WHEN** A is read
- **THEN** `goingCount` is 2
- **AND** the rejected member is not in `faces` or `hosts`

#### Scenario: A signed-out viewer

- **WHEN** a signed-out viewer reads an `IN_PERSON` event with going members
- **THEN** `goingCount` and `faces` are returned
- **AND** `viewerGoing` is false

### Requirement: Event sync keeps the event details

Both event sync paths SHALL store the events service's `tags`, `access_type`, `access_option`, `format`, `host`, `host_logo`, `co_hosts`, `sponsors` and `agenda` on the event as its `details`, replacing earlier details. They SHALL NOT drop other fields already on the event. A malformed field SHALL be stored as empty and logged, and SHALL NOT fail the sync of that event.

#### Scenario: A synced event gains tags

- **GIVEN** the events service sends event E with tags `["DeSci"]`
- **WHEN** E is synced
- **THEN** reading E returns `details.tags` with `DeSci`

#### Scenario: A malformed agenda

- **GIVEN** the events service sends event E with an agenda that is not an object
- **WHEN** E is synced
- **THEN** E is saved with `details.agenda` null

### Requirement: Existing events can be backfilled with details

The internal sync endpoint `POST /v1/irl/events/sync` (internal auth only) SHALL accept `detailsOnly: true`. With it, the system SHALL fetch events from the events service and, for each event it already has (matched by external id), update only the stored details. It SHALL NOT create, delete or change any other field. It SHALL return how many events were updated.

#### Scenario: Backfill leaves slugs alone

- **GIVEN** an existing event with slug `abc123`
- **WHEN** the details-only sync runs
- **THEN** the event has details
- **AND** its slug, dates and name are unchanged

### Requirement: Upcoming events carry their gathering uid

Every row of `GET /v1/irl/events/upcoming` SHALL include `locationUid`: the event's gathering uid, or null when the event has none. All existing fields, the `X-Total-Count` header and the query options SHALL stay as they are.

#### Scenario: An upcoming in-person event

- **GIVEN** an upcoming event in gathering G
- **WHEN** `GET /v1/irl/events/upcoming` is called
- **THEN** its row has `locationUid` equal to G's uid
