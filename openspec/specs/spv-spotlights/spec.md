# spv-spotlights Specification

## Purpose

SPV spotlights let admins present a team's SPV to investors and email them from the back office. This spec covers saved investor lists: named sets of a spotlight's investors that admins reuse to select recipients.

## Requirements

### Requirement: Admins save investors as a named list per SPV spotlight

`POST /v1/admin/spv-spotlights/:uid/investor-lists` SHALL create an investor list on that spotlight from `name` and `participantUids`. The system SHALL trim `name`. The system SHALL refuse an empty `name`, a `name` longer than 100 characters and an empty `participantUids` with HTTP 422. The system SHALL store each participant once. Every participant SHALL be an investor participant of that spotlight; otherwise the system SHALL return HTTP 400 and store nothing. A list name SHALL be unique within a spotlight; a second list with the same name SHALL return HTTP 409. The response SHALL be the list as `{ uid, name, participantUids, createdAt, updatedAt }`.

#### Scenario: Save the selected investors

- **WHEN** an admin posts `name: " Top angels "` and three investor participant uids of the spotlight, one of them twice
- **THEN** the response is HTTP 201 with `name: "Top angels"` and the two distinct uids in `participantUids`

#### Scenario: A participant is not an investor on this spotlight

- **WHEN** `participantUids` contains a uid that is not an investor participant of the spotlight
- **THEN** the response is HTTP 400 and no list is created

#### Scenario: The name is taken

- **WHEN** the spotlight already has a list named `Top angels` and an admin saves another list named `Top angels`
- **THEN** the response is HTTP 409

### Requirement: Admins read the investor lists of an SPV spotlight

`GET /v1/admin/spv-spotlights/:uid/investor-lists` SHALL return every investor list of that spotlight, oldest first, each as `{ uid, name, participantUids, createdAt, updatedAt }`. An unknown spotlight SHALL return HTTP 404.

#### Scenario: A spotlight with no lists

- **WHEN** an admin reads the lists of a spotlight that has none
- **THEN** the response is HTTP 200 with `[]`

### Requirement: Admins delete an investor list

`DELETE /v1/admin/spv-spotlights/:uid/investor-lists/:listUid` SHALL delete that list and its participant links. It SHALL NOT change the spotlight participants. A list that is not on that spotlight SHALL return HTTP 404 and stay unchanged.

#### Scenario: Delete through another spotlight

- **WHEN** an admin deletes a list with the uid of a different spotlight in the path
- **THEN** the response is HTTP 404 and the list remains

### Requirement: Lists follow the spotlight and its participants

Removing a participant from a spotlight SHALL remove that participant from every list of the spotlight. Deleting a spotlight SHALL delete its lists. Investor list endpoints SHALL use the same admin guard as the other SPV spotlight admin endpoints.

#### Scenario: An investor leaves the spotlight

- **WHEN** an admin removes an investor that is in a saved list
- **THEN** the list no longer contains that investor's participant uid
