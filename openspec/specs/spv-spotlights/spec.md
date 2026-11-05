# spv-spotlights Specification

## Purpose

SPV spotlights let admins present a team's SPV to investors and email them from the back office. This spec covers saved investor lists: named sets of investor emails per spotlight that admins reuse to select recipients.

## Requirements

### Requirement: The public spotlight lists only approved team members

The public spotlight response SHALL list a team member under founders only when that member's approval state is `APPROVED`, the role has no end date, and the role is a team lead or the role text contains "founder". The system SHALL omit pending (L0), verified, and rejected members. This is the same member set the public team profile lists.

#### Scenario: A pending team lead is on the team

- **GIVEN** a team lead whose member approval state is `PENDING`
- **WHEN** a visitor opens the public spotlight for that team
- **THEN** the founders list does not include that member

#### Scenario: An approved founder is on the team

- **GIVEN** a current team member whose role contains "founder" and whose member approval state is `APPROVED`
- **WHEN** a visitor opens the public spotlight for that team
- **THEN** the founders list includes that member

### Requirement: Admins save investors as a named list per SPV spotlight

`POST /v1/admin/spv-spotlights/:uid/investor-lists` SHALL create an investor list on that spotlight from `name` and `participantUids`. The system SHALL trim `name`. The system SHALL refuse an empty `name`, a `name` longer than 100 characters and an empty `participantUids` with HTTP 422. The list SHALL store the email of each participant that is an investor participant of that spotlight, trimmed and lower-cased, once, in the order of `participantUids`. The system SHALL skip participants that are not investor participants of that spotlight or have no email; if none is left, the system SHALL return HTTP 400 and store nothing. A list name SHALL be unique within a spotlight; a second list with the same name SHALL return HTTP 409. The response SHALL be the list as `{ uid, name, emails, createdAt, updatedAt }`.

#### Scenario: Save the selected investors

- **WHEN** an admin posts `name: " Top angels "` and three investor participant uids of the spotlight, one of them twice
- **THEN** the response is HTTP 201 with `name: "Top angels"` and the two distinct investors' emails in `emails`

#### Scenario: A participant is not an investor on this spotlight

- **WHEN** `participantUids` contains an investor participant of the spotlight and a uid that is not one
- **THEN** the response is HTTP 201 and `emails` holds only the investor's email

#### Scenario: No participant is an investor on this spotlight

- **WHEN** no uid in `participantUids` is an investor participant of the spotlight with an email
- **THEN** the response is HTTP 400 and no list is created

#### Scenario: The name is taken

- **WHEN** the spotlight already has a list named `Top angels` and an admin saves another list named `Top angels`
- **THEN** the response is HTTP 409

### Requirement: Admins read the investor lists of an SPV spotlight

`GET /v1/admin/spv-spotlights/:uid/investor-lists` SHALL return every investor list of that spotlight, oldest first, each as `{ uid, name, emails, createdAt, updatedAt }` with `emails` in list order. An unknown spotlight SHALL return HTTP 404.

#### Scenario: A spotlight with no lists

- **WHEN** an admin reads the lists of a spotlight that has none
- **THEN** the response is HTTP 200 with `[]`

### Requirement: Admins edit an investor list

`PATCH /v1/admin/spv-spotlights/:uid/investor-lists/:listUid` SHALL update the `name`, the `emails` or both. A field left out SHALL stay unchanged. The system SHALL trim `name` and refuse an empty or longer than 100 characters `name` and an empty `emails` with HTTP 422. `emails` SHALL replace the list's emails; the system SHALL trim and lower-case each email and store it once. The system SHALL NOT check `emails` against the spotlight participants. A name used by another list of the spotlight SHALL return HTTP 409. A list that is not on that spotlight SHALL return HTTP 404. The response SHALL be the updated list as `{ uid, name, emails, createdAt, updatedAt }`.

#### Scenario: Rename a list and remove an email

- **WHEN** an admin patches a list of three emails with `name: "Lead angels"` and two of those emails
- **THEN** the response is HTTP 200 with `name: "Lead angels"` and only those two emails in `emails`

#### Scenario: Keep the email of an investor who left the spotlight

- **WHEN** an admin patches a list with `emails` that contain the email of an investor no longer on the spotlight
- **THEN** the list keeps that email

#### Scenario: Rename only

- **WHEN** an admin patches a list with only `name`
- **THEN** the list keeps its emails

#### Scenario: Edit through another spotlight

- **WHEN** an admin patches a list with the uid of a different spotlight in the path
- **THEN** the response is HTTP 404 and the list stays unchanged

### Requirement: Admins delete an investor list

`DELETE /v1/admin/spv-spotlights/:uid/investor-lists/:listUid` SHALL delete that list and its emails. It SHALL NOT change the spotlight participants. A list that is not on that spotlight SHALL return HTTP 404 and stay unchanged.

#### Scenario: Delete through another spotlight

- **WHEN** an admin deletes a list with the uid of a different spotlight in the path
- **THEN** the response is HTTP 404 and the list remains

### Requirement: Lists keep their emails until an admin removes them

Removing a participant from a spotlight or changing their access SHALL NOT change any list. Only an admin edit or the list's deletion SHALL remove an email from a list. Deleting a spotlight SHALL delete its lists. Investor list endpoints SHALL use the same admin guard as the other SPV spotlight admin endpoints.

#### Scenario: An investor leaves the spotlight

- **WHEN** an admin removes an investor whose email is in a saved list
- **THEN** the list still contains that email
