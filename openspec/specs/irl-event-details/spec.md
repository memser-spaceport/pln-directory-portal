# irl-event-details Specification

## Purpose

Reading one IRL event for display: its details synced from the PL events service, its gathering, its hosts and who is going. It also covers the gathering uid on upcoming events, so any event list can open the event.

## Requirements

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
- `locationUrl`: the venue's map link, an `http` or `https` URL, or null (LAB-3332)
- `timezone`: the event's own IANA time zone, or null (LAB-3403)

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

#### Scenario: An event with a map link

- **GIVEN** an event whose events-service record has `location_url` `https://maps.example.org/venue`, synced after LAB-3332
- **WHEN** the event is read
- **THEN** `details.locationUrl` is `https://maps.example.org/venue`

#### Scenario: An event with no map link

- **GIVEN** an event whose events-service record has no `location_url`, or an event synced before LAB-3332
- **WHEN** the event is read
- **THEN** `details.locationUrl` is null

### Requirement: The event read has the event's time zone

The event read SHALL include `timezone` (LAB-3403): the event's own time zone from its details, otherwise its gathering's, otherwise null.

#### Scenario: The event has its own time zone

- **GIVEN** an event with the time zone `America/Chicago` in a gathering that has none
- **WHEN** the event is read
- **THEN** `timezone` is `America/Chicago`

#### Scenario: The event has no time zone of its own

- **GIVEN** an event synced before LAB-3403 in a gathering with the time zone `Europe/Lisbon`
- **WHEN** the event is read
- **THEN** `timezone` is `Europe/Lisbon`

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

Both event sync paths SHALL store the events service's `tags`, `access_type`, `access_option`, `format`, `host`, `host_logo`, `co_hosts`, `sponsors`, `agenda`, `location_url` and `timezone` on the event as its `details`. The REST sync SHALL replace earlier details. A queue message does not carry every field, so an empty or missing field in it SHALL keep the stored value (LAB-3403). A `timezone` that is not a known IANA name SHALL be stored as null. They SHALL NOT drop other fields already on the event. A malformed field SHALL be stored as empty and logged, and SHALL NOT fail the sync of that event. `location_url` SHALL be stored as `locationUrl` only when it is an absolute `http` or `https` URL; any other value (for example `javascript:`) SHALL be stored as null (LAB-3332).

#### Scenario: A synced event gains tags

- **GIVEN** the events service sends event E with tags `["DeSci"]`
- **WHEN** E is synced
- **THEN** reading E returns `details.tags` with `DeSci`

#### Scenario: A queue message without the details

- **GIVEN** event E with tags and a host stored
- **WHEN** a queue message for E carries only `format`
- **THEN** E keeps its tags and host and takes the new format

#### Scenario: A malformed agenda

- **GIVEN** the events service sends event E with an agenda that is not an object
- **WHEN** E is synced
- **THEN** E is saved with `details.agenda` null

#### Scenario: A map link that is not http or https

- **GIVEN** the events service sends event E with `location_url` `javascript:alert(1)`
- **WHEN** E is synced
- **THEN** E is saved with `details.locationUrl` null and its other details unchanged

### Requirement: A queue message is followed by a read of the full details

After a queue message saves an event, the system SHALL read that event from the events service over REST and replace its stored details (LAB-3403). It SHALL write only that event's details. The read SHALL have a time limit. When it fails, the event SHALL stay saved with its stored details, the failure SHALL be logged, and the message SHALL NOT be delivered again because of it. A message that saves no event, or deletes one, SHALL read nothing.

#### Scenario: A tag is removed in the events portal

- **GIVEN** event E with the tags `AI` and `FA3` stored
- **WHEN** an admin removes `FA3` and the queue message for E arrives
- **THEN** reading E returns `AI` only

#### Scenario: The events service does not answer

- **GIVEN** event E with tags stored
- **WHEN** a queue message for E arrives and the REST read fails
- **THEN** E has the message's name and dates, and keeps its tags

### Requirement: Existing events can be backfilled with details

The internal sync endpoint `POST /v1/irl/events/sync` (internal auth only) SHALL accept `detailsOnly: true`. With it, the system SHALL fetch events from the events service and, for each event it already has (matched by external id), update only the stored details. It SHALL NOT create, delete or change any other field. It SHALL return how many events were updated.

#### Scenario: Backfill leaves slugs alone

- **GIVEN** an existing event with slug `abc123`
- **WHEN** the details-only sync runs
- **THEN** the event has details
- **AND** its slug, dates and name are unchanged

### Requirement: Upcoming events can include the ones in progress

`GET /v1/irl/events/upcoming` SHALL accept `ongoing=true` (LAB-3403). With it, the answer SHALL hold every event that has not ended, started or not. Without it, the answer SHALL hold only events that have not started, as before. Any other value SHALL answer 400.

#### Scenario: A multi-day event on its second day

- **GIVEN** an event that started yesterday and ends tomorrow
- **WHEN** `GET /v1/irl/events/upcoming?ongoing=true` is called
- **THEN** the event is in the answer
- **AND** it is not in the answer without the parameter

### Requirement: Upcoming events carry their gathering uid

Every row of `GET /v1/irl/events/upcoming` SHALL include `locationUid`: the event's gathering uid, or null when the event has none. All existing fields, the `X-Total-Count` header and the query options SHALL stay as they are.

#### Scenario: An upcoming in-person event

- **GIVEN** an upcoming event in gathering G
- **WHEN** `GET /v1/irl/events/upcoming` is called
- **THEN** its row has `locationUid` equal to G's uid

### Requirement: Upcoming events carry their going count

Every row of `GET /v1/irl/events/upcoming` SHALL include `goingCount` (LAB-3271). It is the number of distinct listed members who go, the same count as the event drawer. The endpoint has no viewer, so it SHALL follow the signed-out rule: an invite-only event SHALL return `goingCount: null`. An event with no listed guests SHALL return 0. The count SHALL use one grouped query for the whole page. All other fields SHALL stay as they are.

#### Scenario: An open event with guests

- **GIVEN** an upcoming open event with 3 listed members who go, one of them listed twice
- **WHEN** `GET /v1/irl/events/upcoming` is called
- **THEN** its row has `goingCount` equal to 3

#### Scenario: An invite-only event

- **GIVEN** an upcoming invite-only event with listed guests
- **WHEN** `GET /v1/irl/events/upcoming` is called
- **THEN** its row has `goingCount` null
