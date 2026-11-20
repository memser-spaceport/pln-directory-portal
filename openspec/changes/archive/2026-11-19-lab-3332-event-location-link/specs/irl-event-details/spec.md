## MODIFIED Requirements

### Requirement: The event read includes the synced details

The event read SHALL include `details`, taken from the events service:
- `tags` (`name`, `color`)
- `accessType`, `accessOption`, `format`
- `host` (`name`, `logo`), `coHosts`, `sponsors`
- `agenda` (with its sessions)
- `locationUrl`: the venue's map link, an `http` or `https` URL, or null (LAB-3332)

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

### Requirement: Event sync keeps the event details

Both event sync paths SHALL store the events service's `tags`, `access_type`, `access_option`, `format`, `host`, `host_logo`, `co_hosts`, `sponsors`, `agenda` and `location_url` on the event as its `details`, replacing earlier details. They SHALL NOT drop other fields already on the event. A malformed field SHALL be stored as empty and logged, and SHALL NOT fail the sync of that event. `location_url` SHALL be stored as `locationUrl` only when it is an absolute `http` or `https` URL; any other value (for example `javascript:`) SHALL be stored as null (LAB-3332).

#### Scenario: A synced event gains tags

- **GIVEN** the events service sends event E with tags `["DeSci"]`
- **WHEN** E is synced
- **THEN** reading E returns `details.tags` with `DeSci`

#### Scenario: A malformed agenda

- **GIVEN** the events service sends event E with an agenda that is not an object
- **WHEN** E is synced
- **THEN** E is saved with `details.agenda` null

#### Scenario: A map link that is not http or https

- **GIVEN** the events service sends event E with `location_url` `javascript:alert(1)`
- **WHEN** E is synced
- **THEN** E is saved with `details.locationUrl` null and its other details unchanged
