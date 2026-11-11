# Spec Delta

## Purpose

How a member marks and unmarks that they are going to one IRL event, whether that attendance shows on their profile, and who is listed as going to one event.

## ADDED Requirements

### Requirement: Going to one event creates one guest row

The system SHALL treat `POST /v1/irl/locations/:uid/guests` with `events: [{ uid }]` as attendance for that event only. It SHALL create one guest row for that event and SHALL NOT change or delete the caller's other guest rows. Writes SHALL keep needing `irlg.going.write` or directory admin.

#### Scenario: A member says they are going to a second event

- **GIVEN** a member who is already going to event A at a gathering
- **WHEN** they post `events: [{ uid: B }]` for event B at the same gathering
- **THEN** they have guest rows for both A and B

#### Scenario: Going twice to the same event is refused

- **GIVEN** a member who is already going to event A
- **WHEN** they post `events: [{ uid: A }]` again
- **THEN** the response is 409 and no row is added

#### Scenario: A member without the write permission is refused

- **GIVEN** a signed-in member who has neither `irlg.going.write` nor directory admin
- **WHEN** they post a guest for an event
- **THEN** the response is 403

### Requirement: Show on my profile is stored per guest row

Each guest row SHALL carry `showOnProfile`, true by default. Guest create SHALL accept an optional boolean `showOnProfile` and apply it to every row it creates. Existing rows SHALL read as `true`.

#### Scenario: Going with the box unticked

- **WHEN** a member posts `events: [{ uid: A }]` with `showOnProfile: false`
- **THEN** their row for A has `showOnProfile` false

#### Scenario: Going without the field

- **WHEN** a member posts a guest without `showOnProfile`
- **THEN** the created rows have `showOnProfile` true

### Requirement: A member toggles show on my profile for their own event

The system SHALL serve `PATCH /v1/irl/events/:uid/me` with body `{ showOnProfile: boolean }` for a signed-in member. It SHALL update only the caller's own guest row for that event and return `{ eventUid, showOnProfile }`. It SHALL return 404 when the caller has no guest row for the event and 400 when the body is invalid.

#### Scenario: The owner hides an event

- **GIVEN** a member going to event A with `showOnProfile` true
- **WHEN** they call `PATCH /v1/irl/events/A/me` with `{ "showOnProfile": false }`
- **THEN** their row for A has `showOnProfile` false

#### Scenario: A member who is not going cannot toggle

- **GIVEN** a member with no guest row for event A
- **WHEN** they call `PATCH /v1/irl/events/A/me`
- **THEN** the response is 404

### Requirement: Not going removes one event only

`POST /v1/irl/locations/:uid/events/guests` SHALL take `{ membersAndEvents: [{ memberUid, events: string[] }] }` and validate it at the boundary. A non-empty `events` SHALL delete only those event rows for that member at that gathering. An empty `events` array SHALL keep its current meaning (all the member's rows at that gathering). An entry without an `events` array SHALL be rejected with 400, and nothing SHALL be deleted. Non-admins SHALL only delete their own rows.

#### Scenario: Not going to one of two events

- **GIVEN** a member going to events A and B at a gathering
- **WHEN** they post `{ membersAndEvents: [{ memberUid: <self>, events: [A] }] }`
- **THEN** their row for A is deleted
- **AND** their row for B remains

#### Scenario: A body without events is refused

- **GIVEN** a member going to events A and B
- **WHEN** they post `{ membersAndEvents: [{ memberUid: <self>, eventUid: "A" }] }`
- **THEN** the response is 400
- **AND** both rows remain

#### Scenario: Deleting another member's row is refused for non-admins

- **WHEN** a non-admin posts an entry whose `memberUid` is another member
- **THEN** the response is 403

### Requirement: A member with no team can save attendance

Guest create SHALL store an empty or missing `teamUid` as no team (`null`) instead of failing. A non-empty `teamUid` SHALL still have to be a team the member belongs to, unless the caller is an admin.

#### Scenario: Going without a team

- **GIVEN** a member who belongs to no team
- **WHEN** they post a guest for event A with `teamUid: ""`
- **THEN** the row is created with no team

### Requirement: The attendee list for one event is strict

`GET /v1/irl/locations/:uid/guests` SHALL accept an optional `eventUid` query parameter. With it, the list SHALL contain only guests with a row for that event, leaving out gathering-level guests and guests of other events. Search, pagination, sorting and the existing viewer rules SHALL still apply, and guests whose `showOnProfile` is false SHALL be included. Without `eventUid` the endpoint SHALL behave as before.

#### Scenario: Gathering-level guests are left out

- **GIVEN** member M1 going to event A, and member M2 going to the gathering with no event
- **WHEN** the list is requested with `eventUid=A`
- **THEN** it contains M1
- **AND** it does not contain M2

#### Scenario: Hidden-from-profile attendance still counts as going

- **GIVEN** member M1 going to event A with `showOnProfile` false
- **WHEN** the list is requested with `eventUid=A`
- **THEN** it contains M1

#### Scenario: Invite-only event for a signed-out viewer

- **GIVEN** an `INVITE_ONLY` event A
- **WHEN** a signed-out viewer requests the list with `eventUid=A`
- **THEN** the list is empty
