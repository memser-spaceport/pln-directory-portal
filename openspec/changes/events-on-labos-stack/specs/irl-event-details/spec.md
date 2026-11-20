# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: The event read includes the synced details`
- TO: `### Requirement: The event read includes the event details`

## MODIFIED Requirements

### Requirement: One event can be read by uid

The system SHALL serve `GET /v1/irl/events/:uid` with an optional user token, without caching. It SHALL return the event's `uid`, `name`, `type`, `startDate`, `endDate`, `description`, `logo`, `banner`, `websiteUrl`, `externalId` and `resources`, plus its gathering (`uid`, `location`, `flag`, `timezone`, `resources`). Unknown or deleted events SHALL return 404. An event that is not approved SHALL return 404, except to its submitter and to a directory admin, who SHALL also get its `status`. Private resources SHALL be left out for signed-out viewers, as the existing event reads do.

#### Scenario: A signed-in member opens an event

- **GIVEN** a non-deleted, approved event A in gathering G
- **WHEN** a signed-in member calls `GET /v1/irl/events/A`
- **THEN** the response includes A's dates and description, and G's uid and timezone

#### Scenario: A deleted event

- **GIVEN** an event marked deleted
- **WHEN** its uid is requested
- **THEN** the response is 404

#### Scenario: A pending event

- **GIVEN** an event waiting for approval
- **WHEN** a member who did not submit it requests its uid
- **THEN** the response is 404

#### Scenario: Static paths keep working

- **WHEN** `GET /v1/irl/events/upcoming` or `GET /v1/irl/events/contributors` is called
- **THEN** each returns what it returned before this change

### Requirement: The event read includes the event details

The event read SHALL include `details`, taken from the event record in LabOS:
- `tags` (`name`, `color`)
- `accessType`, `accessOption`, `format`
- `host` (`name`, `logo`), `coHosts`, `sponsors`
- `agenda` (with its sessions)
- `locationUrl`: the venue's map link, an `http` or `https` URL, or null

It SHALL also include the event's `timezone`, its venue (`address`, `latitude`, `longitude`) and its `registrationUrl` and `meetingUrl`. A field the event does not have SHALL be null or an empty list, never an error.

#### Scenario: An event with an agenda and tags

- **GIVEN** an event stored with two tags and an agenda with sessions
- **WHEN** the event is read
- **THEN** `details.tags` has the two tags
- **AND** `details.agenda` has the sessions

#### Scenario: An event synced before this change

- **GIVEN** an event stored with no tags and no agenda
- **WHEN** it is read
- **THEN** `details.tags` is an empty list and `details.agenda` is null

#### Scenario: An event with a venue

- **GIVEN** an in-person event stored with a venue address and coordinates
- **WHEN** it is read
- **THEN** the response has that address, latitude and longitude

#### Scenario: An event with a map link

- **GIVEN** an event whose events-service record has `location_url` `https://maps.example.org/venue`, synced after LAB-3332
- **WHEN** the event is read
- **THEN** `details.locationUrl` is `https://maps.example.org/venue`

#### Scenario: An event with no map link

- **GIVEN** an event whose events-service record has no `location_url`, or an event synced before LAB-3332
- **WHEN** the event is read
- **THEN** `details.locationUrl` is null

## REMOVED Requirements

### Requirement: Event sync keeps the event details

**Reason**: LabOS owns event records. There is no events service to sync from.
**Migration**: Details are written with the event itself through `POST /v1/irl/events`, `PATCH /v1/irl/events/:uid` and the curation API (`event-submission`, `event-curation-api`).

### Requirement: Existing events can be backfilled with details

**Reason**: `POST /v1/irl/events/sync` is removed with the events service. The backfill runs once, before cutover.
**Migration**: None after cutover. An event's details are corrected with `PATCH /v1/irl/events/:uid` or the curation API.
