# Spec Delta

## Purpose

The routes a partner app uses, with a team-scoped integration key, to read LabOS events, decide on submissions, and publish and maintain its own events without manual copying.

## ADDED Requirements

### Requirement: Curation routes need an integration key with an events scope

Every route under `/v1/integrations/events` SHALL require a live team-scoped integration key. Read routes SHALL require the `events:read` scope and write routes the `events:write` scope. A missing, unknown or revoked key SHALL answer 401. A key without the needed scope SHALL answer 403. The routes SHALL NOT accept a member token in place of a key.

#### Scenario: A key without the write scope decides

- **GIVEN** a key with only `events:read`
- **WHEN** it posts a decision
- **THEN** the response is 403

#### Scenario: No key

- **WHEN** `GET /v1/integrations/events` is called with no key
- **THEN** the response is 401

#### Scenario: A revoked key

- **GIVEN** a key that an admin revoked
- **WHEN** it calls any curation route
- **THEN** the response is 401

### Requirement: A partner app can read events in every status

`GET /v1/integrations/events` SHALL return non-deleted events that are not drafts, oldest change first, with `status` (one or more of `PENDING`, `APPROVED`, `REJECTED`; all when absent), `updatedSince`, `cursor` and `limit` (at most 100). Each item SHALL carry all event fields, `status`, `externalId`, whether the calling key's team created it, and the submitter's name and contact email. The answer SHALL carry `nextCursor`, null on the last page.

#### Scenario: The pending queue

- **GIVEN** two pending events and five approved events
- **WHEN** the app reads with `status=PENDING`
- **THEN** exactly the two pending events are returned, each with its submitter's contact email

#### Scenario: Incremental read

- **GIVEN** an event changed after time T and an event not changed since before T
- **WHEN** the app reads with `updatedSince=T`
- **THEN** only the first event is returned

#### Scenario: Paging to the end

- **GIVEN** more events than one page holds
- **WHEN** the app follows `nextCursor` until it is null
- **THEN** it has received every event exactly once

### Requirement: A partner app can approve or reject an event

`POST /v1/integrations/events/:uid/decision` SHALL accept `status` (`APPROVED` or `REJECTED`) and an optional `note`, and SHALL set the event to that status and record the time and the note. It SHALL work on an event in any status, so rejecting an approved event hides it. Repeating the same decision SHALL succeed and change nothing. An unknown or deleted event SHALL answer 404. An approved event SHALL be visible in LabOS in the same request, with no sync delay.

#### Scenario: A pending submission is approved

- **GIVEN** a pending event
- **WHEN** the app posts `status: "APPROVED"`
- **THEN** the event is in the LabOS events list on the next read

#### Scenario: A pending submission is rejected

- **GIVEN** a pending event
- **WHEN** the app posts `status: "REJECTED"` with a note
- **THEN** the event is not in the events list and reading it by uid as another member answers 404

#### Scenario: An approved member event is hidden

- **GIVEN** an event a forum member published
- **WHEN** the app posts `status: "REJECTED"`
- **THEN** the event is no longer in the events list

#### Scenario: The same decision twice

- **GIVEN** an event the app already approved
- **WHEN** the app posts `status: "APPROVED"` again
- **THEN** the response is 200 and the event is unchanged

### Requirement: A partner app can publish its own events by its own id

`PUT /v1/integrations/events/by-external-id/:externalId` SHALL create an event when the key's team has none with that `externalId`, and SHALL update that event otherwise. The event SHALL be stored as `APPROVED`, with the key's team as its source. An invalid body SHALL answer 422. The answer SHALL carry the LabOS `uid` and whether the event was created or updated.

#### Scenario: First push of an event

- **WHEN** the app puts a valid event with external id `evt-1`
- **THEN** the response says `created` and gives a `uid`
- **AND** the event is in the LabOS events list

#### Scenario: Second push of the same event

- **GIVEN** the app already pushed `evt-1`
- **WHEN** it puts `evt-1` again with a new name
- **THEN** the response says `updated` with the same `uid`
- **AND** there is still one event, with the new name

#### Scenario: Two teams use the same external id

- **GIVEN** team A's key pushed `evt-1`
- **WHEN** team B's key puts `evt-1`
- **THEN** a second, separate event is created

#### Scenario: An invalid event is pushed

- **WHEN** the app puts an event whose end is before its start
- **THEN** the response is 422 and nothing is stored

#### Scenario: A deleted event is pushed again

- **GIVEN** the app deleted its event `evt-1`
- **WHEN** it puts `evt-1` again
- **THEN** the event is visible again with the same `uid`

### Requirement: A partner event needs only a name, a start date and a format

A partner event SHALL be accepted with only `name`, `startDate` and `format`. `description`, `endDate`, `timezone`, the address and every other field SHALL be optional. A missing `endDate` SHALL be stored as the start date. A date with no time SHALL be accepted with `allDay: true`. A missing `timezone` SHALL be taken from the event's gathering when the city has one, and SHALL otherwise be UTC. An in-person event with no city SHALL be stored with no gathering.

#### Scenario: A date-only conference with no description

- **WHEN** the app puts an event with a name, `startDate: "2026-07-24"`, `allDay: true`, `format: "IN_PERSON"` and city Lisbon
- **THEN** the event is stored and shows in LabOS as an all-day event in Lisbon's time zone
- **AND** its description is empty

#### Scenario: A virtual event with no time zone

- **WHEN** the app puts a `VIRTUAL` event with no `timezone`
- **THEN** the event is stored with time zone UTC

#### Scenario: No format

- **WHEN** the app puts an event with no `format`
- **THEN** the response is 422

### Requirement: A partner app can publish events in a batch

`POST /v1/integrations/events/batch` SHALL accept up to 100 events, each with its `externalId`, and SHALL apply the single-event rules to each. The answer SHALL list one result per input in the same order: `created` or `updated` with the `uid`, or `error` with the reason. One invalid event SHALL NOT stop the others. More than 100 events SHALL answer 422 and store nothing.

#### Scenario: One bad event in a batch of three

- **WHEN** the app posts three events and the second has no name
- **THEN** the first and third are stored
- **AND** the second result is `error` with the reason

#### Scenario: Too many events

- **WHEN** the app posts 101 events
- **THEN** the response is 422 and nothing is stored

### Requirement: A partner app can correct any event and delete its own

`PATCH /v1/integrations/events/:uid` SHALL update the given fields of any non-deleted event, with the same validation as a submission (422 when invalid), and SHALL NOT change its status or submitter. `DELETE /v1/integrations/events/:uid` SHALL delete an event only when the key's team created it; for any other event it SHALL answer 403. An unknown event SHALL answer 404.

#### Scenario: A typo in a member's submission is fixed before approval

- **GIVEN** a pending event submitted by a member
- **WHEN** the app patches its name
- **THEN** the event has the new name and is still `PENDING` with the same submitter

#### Scenario: The app deletes a member's event

- **GIVEN** an event a member submitted
- **WHEN** the app calls delete on it
- **THEN** the response is 403 and the event is unchanged

#### Scenario: The app deletes its own event

- **GIVEN** an event the app published
- **WHEN** the app deletes it
- **THEN** the event is no longer in the events list

### Requirement: A partner app can upload an event image

`POST /v1/integrations/events/images` SHALL accept one image file with the `events:write` scope and SHALL answer with the stored image's `uid` and `url`. An event body SHALL accept that `uid` as its logo. A file that is not an accepted image type or is over the size limit of the member image upload SHALL answer 400.

#### Scenario: Upload and use a logo

- **WHEN** the app uploads a PNG and then puts an event with the returned image `uid` as its logo
- **THEN** the LabOS event read shows that logo

#### Scenario: Not an image

- **WHEN** the app uploads a text file
- **THEN** the response is 400
