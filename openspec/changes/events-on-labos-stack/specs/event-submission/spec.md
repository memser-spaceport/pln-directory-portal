# Spec Delta

## Purpose

Submitting an event in LabOS: who can submit, which submissions are published at once and which wait for approval, what a submitter can do with their own event, and the rule that only approved events are visible.

## ADDED Requirements

### Requirement: A signed-in member can submit an event

The system SHALL serve `POST /v1/irl/events` for a signed-in member. A request with no user token SHALL answer 401 and store nothing. The body SHALL carry `name`, `startDate`, `endDate`, `timezone`, `format` (`IN_PERSON`, `VIRTUAL` or `HYBRID`), at least one tag and `hostName`, as the old submission form required. The description and the address SHALL be optional. A valid submission SHALL answer 201 with the event `uid` and its `status`. An invalid body SHALL answer 400 and store nothing; the answer's `message` SHALL name each problem with its field.

#### Scenario: A signed-in member submits a valid event

- **WHEN** a signed-in member posts a valid in-person event
- **THEN** the response is 201 with a `uid` and a `status`
- **AND** the event is stored with that member as its submitter

#### Scenario: End before start

- **WHEN** a submission has an `endDate` earlier than its `startDate`
- **THEN** the response is 400
- **AND** no event is stored

#### Scenario: No session

- **WHEN** a request with no user token posts a valid event
- **THEN** the response is 401
- **AND** no event is stored

#### Scenario: An in-person event with no city

- **WHEN** an `IN_PERSON` submission has no address
- **THEN** the response is 201 and the event is stored with no gathering

#### Scenario: No tag

- **WHEN** a submission has an empty tag list
- **THEN** the response is 400

#### Scenario: No host name

- **WHEN** a submission has no `hostName`
- **THEN** the response is 400

### Requirement: A member can save a draft

A signed-in member MAY send `draft: true`. The event SHALL be stored with status `DRAFT` and SHALL need only `name`, `startDate`, `endDate` and `timezone`. A draft SHALL be readable by its submitter only, and SHALL be absent from every list, the curation API included. `PATCH` with `submit: true` SHALL apply the submission checks and SHALL then set the status by the rule for new submissions.

#### Scenario: A draft with no tag and no host

- **WHEN** a member posts `draft: true` with a name, dates and a time zone
- **THEN** the response is 201 with `status: "DRAFT"`

#### Scenario: A draft is submitted by a forum member

- **GIVEN** a draft of a member with `forum.write` that has a tag and a host name
- **WHEN** they patch it with `submit: true`
- **THEN** the status is `APPROVED`

#### Scenario: A draft is submitted without a host

- **GIVEN** a draft with no `hostName`
- **WHEN** its submitter patches it with `submit: true`
- **THEN** the response is 400 and the event is still a draft

#### Scenario: A directory admin opens another member's draft

- **GIVEN** a draft of member M
- **WHEN** a directory admin reads it by uid
- **THEN** the response is 404

### Requirement: An event carries the old form's details

A submission and an edit MAY carry `hostEmail`, `coHosts` (each a `name` and an optional `email`), `websiteUrl`, `registrationUrl`, `meetingUrl`, `contactInfos` (addresses by platform), `agenda` (sessions and the pasted text), and in the address `locationInstructions`, `latitude` and `longitude`. Host and co-host emails SHALL be returned to the submitter and a directory admin only. A co-host with no name, a wrong email and a link that is not `http` or `https` SHALL answer 400.

#### Scenario: Co-hosts and social handles are stored

- **WHEN** a member submits an event with two co-hosts and a Twitter address in `contactInfos`
- **THEN** the event read by that member returns both co-hosts and the address

#### Scenario: Host email is private

- **GIVEN** an approved event with a `hostEmail`
- **WHEN** another member reads the event
- **THEN** the response has the host name and no host email

#### Scenario: A co-host with no name

- **WHEN** a submission has a co-host with an email and no name
- **THEN** the response is 400

### Requirement: The description is stored as safe HTML

The description MAY be HTML. On every write the system SHALL keep only text formatting (paragraphs, headings, bold, italic, underline, strikethrough, lists, alignment, line breaks and `http` or `https` links) and SHALL drop every other tag and attribute.

#### Scenario: A script in the description

- **WHEN** a submission's description holds a `<script>` tag and an `onclick` attribute
- **THEN** the stored description has neither

#### Scenario: A formatted description

- **WHEN** a submission's description holds a heading and a bullet list
- **THEN** the event read returns the heading and the list

### Requirement: An event can be all-day

A submission MAY carry `allDay: true` with dates that have no time of day. The system SHALL store the event as all-day, and every event read and list SHALL return `allDay` so a client shows the dates without a time. An event that was stored before this capability SHALL read as `allDay: false`.

#### Scenario: A three-day conference with no times

- **WHEN** a member submits an event with `allDay: true`, `startDate: "2026-07-24"` and `endDate: "2026-07-26"`
- **THEN** the event read returns `allDay: true` and those three days in the event's time zone

### Requirement: An event can carry a map link

A submission and an edit MAY carry `locationUrl`, the link that opens the venue on a map. Only an `http` or `https` address SHALL be accepted; any other value SHALL answer 400. The event read SHALL return it as `details.locationUrl`, and null when the event has none.

#### Scenario: A map link is stored

- **WHEN** a member submits an in-person event with `locationUrl: "https://maps.app.goo.gl/abc"`
- **THEN** the event read returns that address in `details.locationUrl`

#### Scenario: A link that is not a web address

- **WHEN** a submission has `locationUrl: "javascript:alert(1)"`
- **THEN** the response is 400 and no event is stored

#### Scenario: No map link

- **WHEN** a member submits an event with no `locationUrl`
- **THEN** the event read returns `details.locationUrl: null`

### Requirement: Trusted members are published at once

A submission from a member who holds the `forum.write` permission or is a directory admin SHALL be stored with status `APPROVED`. Every other submission SHALL be stored with status `PENDING`. The server SHALL decide the status; a `status` sent by the submitter SHALL be ignored.

#### Scenario: A forum member submits

- **GIVEN** a member with `forum.write`
- **WHEN** they submit a valid event
- **THEN** the response `status` is `APPROVED`
- **AND** the event is in the events list

#### Scenario: A member without forum access submits

- **GIVEN** a signed-in member without `forum.write` who is not a directory admin
- **WHEN** they submit a valid event
- **THEN** the response `status` is `PENDING`
- **AND** the event is not in the events list

#### Scenario: A submitter sends their own status

- **GIVEN** a member without `forum.write`
- **WHEN** they submit with `status: "APPROVED"` in the body
- **THEN** the stored status is `PENDING`

### Requirement: A submission can name hosts, speakers and sponsors

A submission MAY carry `associations`, each with a `role` (`HOST`, `CO_HOST`, `SPEAKER` or `SPONSOR`) and a member uid or a team uid. The system SHALL store each as a link between the event and that member or team. An unknown member or team uid SHALL answer 400. When the event is or becomes `APPROVED`, each linked member SHALL appear as going to the event with that role; no member SHALL appear as going to an event that is not approved.

#### Scenario: A host is named on an approved event

- **GIVEN** a forum member submits an event naming member M as `HOST`
- **WHEN** the event is read
- **THEN** M is in the event's `hosts`

#### Scenario: A host is named on a pending event

- **GIVEN** a pending event naming member M as `HOST`
- **WHEN** M's profile events are read
- **THEN** the pending event is not listed

#### Scenario: An unknown team

- **WHEN** a submission names a team uid that does not exist
- **THEN** the response is 400

### Requirement: Only approved events are visible

Every read of events SHALL return only events with status `APPROVED`: the events list, upcoming events, gathering events, the event read, home, the digest, search, AI search, MCP tools, profile events, recommendations and push notifications. The submitter of an event and a directory admin SHALL still be able to read that event by uid whatever its status; a draft is for its submitter only. Every event that existed before this capability SHALL count as `APPROVED`.

#### Scenario: A pending event is opened by another member

- **GIVEN** a pending event
- **WHEN** a member who did not submit it reads it by uid
- **THEN** the response is 404

#### Scenario: A pending event is opened by its submitter

- **GIVEN** a pending event submitted by member M
- **WHEN** M reads it by uid
- **THEN** the response includes the event and `status: "PENDING"`

#### Scenario: A rejected event is searched

- **GIVEN** a rejected event named "Rejected Meetup"
- **WHEN** a member searches for "Rejected Meetup"
- **THEN** the event is not in the results

#### Scenario: An event from before this capability

- **GIVEN** an event stored before approval status existed
- **WHEN** the events list is read
- **THEN** the event is listed as before

### Requirement: A member can list their own submissions

The system SHALL serve `GET /v1/irl/events/mine` for a signed-in member. It SHALL return the non-deleted events that member submitted, whatever their status, each with its `uid`, `name`, dates, `status` and `reviewNote`, newest first. A request with no user token SHALL answer 401.

#### Scenario: A member with one pending and one approved event

- **GIVEN** member M submitted event A (approved) and event B (pending)
- **WHEN** M calls `GET /v1/irl/events/mine`
- **THEN** both A and B are returned with their statuses

### Requirement: A submitter can edit and delete their own event

The system SHALL serve `PATCH /v1/irl/events/:uid` and `DELETE /v1/irl/events/:uid` for the member who submitted the event and for a directory admin. Any other caller SHALL get 403. An edit SHALL apply the same validation as a submission and SHALL NOT change the event's status, except that a directory admin MAY set `status`. A delete SHALL remove the event from every read. A submitter who is not a directory admin SHALL NOT delete an approved event (403).

#### Scenario: A submitter fixes the date

- **GIVEN** an approved event submitted by member M
- **WHEN** M patches its `startDate` and `endDate`
- **THEN** the event read shows the new dates
- **AND** the status is still `APPROVED`

#### Scenario: Another member tries to edit

- **GIVEN** an event submitted by member M
- **WHEN** member N, who is not a directory admin, patches it
- **THEN** the response is 403

#### Scenario: A directory admin hides an event

- **GIVEN** an approved event
- **WHEN** a directory admin patches it with `status: "REJECTED"`
- **THEN** the event is no longer in the events list

#### Scenario: A submitter deletes their approved event

- **GIVEN** an approved event submitted by member M, who is not a directory admin
- **WHEN** M deletes it
- **THEN** the response is 403 and the event is unchanged

#### Scenario: A submitter deletes their event

- **GIVEN** a pending event submitted by member M
- **WHEN** M deletes it
- **THEN** reading it by uid answers 404
