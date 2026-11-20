# Events curation API

This API lets a partner app work with LabOS events: read them, approve or reject submissions, and publish its own
events. A change shows in LabOS at once. There is no sync delay and nothing to copy by hand.

Base URL: `https://<labos-api-host>/v1/integrations/events`

## Authentication

Send your integration key in every request:

```
Authorization: Bearer labos_ik_...
```

- A LabOS directory admin creates the key for your team with `POST /v1/admin/integration-keys`
  (see [INTEGRATION_KEYS.md](./INTEGRATION_KEYS.md)). The key is shown once. Store it as a secret on your server.
  Never put it in browser code.
- The key needs the scope `events:read` to read and `events:write` to write.
- A missing, unknown or revoked key answers 401. A key without the needed scope answers 403.
- A member's sign-in token is not accepted here.

Check a key: `GET /v1/integrations/me` returns `{ uid, name, teamUid, teamName, scopes }`.

## Routes

| Method and path                                          | Scope          | What it does                               |
| -------------------------------------------------------- | -------------- | ------------------------------------------ |
| `GET /v1/integrations/events`                            | `events:read`  | List events in every status                |
| `POST /v1/integrations/events/:uid/decision`             | `events:write` | Approve or reject an event                 |
| `PUT /v1/integrations/events/by-external-id/:externalId` | `events:write` | Create or update your event by your own id |
| `POST /v1/integrations/events/batch`                     | `events:write` | Create or update up to 100 of your events  |
| `PATCH /v1/integrations/events/:uid`                     | `events:write` | Correct fields of any event                |
| `DELETE /v1/integrations/events/:uid`                    | `events:write` | Delete an event your team published        |
| `POST /v1/integrations/events/images`                    | `events:write` | Upload an event image                      |

Status codes: 200 success; 401 bad key; 403 missing scope, or delete of an event that is not yours; 404 unknown or
deleted event; 422 invalid body; 400 invalid query value or file type.

The examples use these shell variables:

```bash
API=https://<labos-api-host>
KEY=labos_ik_...
```

## Event statuses

| Status     | Meaning                                           | Visible in LabOS |
| ---------- | ------------------------------------------------- | ---------------- |
| `PENDING`  | A person submitted it and it waits for a decision | No               |
| `APPROVED` | Published                                         | Yes              |
| `REJECTED` | Declined, or hidden after it was published        | No               |

A member's own draft is never part of this API.

## List events

```bash
curl "$API/v1/integrations/events?status=PENDING&limit=50" -H "Authorization: Bearer $KEY"
```

| Query          | Meaning                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| `status`       | `PENDING`, `APPROVED` or `REJECTED`. Repeat it, or separate values with commas, for several. All when absent |
| `updatedSince` | ISO date-time. Only events changed at or after it                                                            |
| `limit`        | 1 to 100. Default 50                                                                                         |
| `cursor`       | The `nextCursor` of the previous page                                                                        |

Events come oldest change first. Answer:

```json
{
  "items": [
    {
      "uid": "cmabc123",
      "status": "PENDING",
      "externalId": null,
      "createdByYourTeam": false,
      "submitter": { "memberUid": "cmmem789", "name": "Ada Example", "email": "ada@example.org" },
      "reviewedAt": null,
      "reviewNote": null,
      "name": "Lisbon Builders Night",
      "slugURL": "lisbon-builders-night-x7k2mq",
      "description": "<p>An evening for builders.</p>",
      "startDate": "2026-12-01T18:00:00.000Z",
      "endDate": "2026-12-01T21:00:00.000Z",
      "allDay": false,
      "timezone": "Europe/Lisbon",
      "format": "IN_PERSON",
      "accessOption": "OPEN",
      "tags": ["Networking Event"],
      "isFeatured": false,
      "hostName": "Protocol Labs",
      "hostEmail": "host@example.org",
      "coHosts": [{ "name": "Filecoin Foundation", "email": null }],
      "websiteUrl": null,
      "registrationUrl": "https://lu.ma/abc",
      "meetingUrl": null,
      "locationUrl": "https://maps.app.goo.gl/abc",
      "contactInfos": null,
      "agenda": null,
      "address": {
        "address": "Avenida da Liberdade 10",
        "city": "Lisbon",
        "state": null,
        "country": "Portugal",
        "latitude": 38.7205,
        "longitude": -9.1453,
        "locationInstructions": null
      },
      "gathering": { "uid": "cmloc456", "name": "Lisbon, Portugal" },
      "logoUid": null,
      "logo": null,
      "associations": [],
      "createdAt": "2026-11-19T10:00:00.000Z",
      "updatedAt": "2026-11-19T10:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

- `submitter` is the LabOS member who submitted the event, with their email. It is null for an event an app
  published and for an event from before LabOS submissions.
- `createdByYourTeam` is true for an event your key's team published. Only such an event can be deleted with your key.
- `startDate` and `endDate` are instants in UTC. For `allDay: true`, show the days in `timezone`, with no time.

### Read everything, then only what changed

1. Call the list with no `cursor`. While `nextCursor` is not null, call again with `cursor=<nextCursor>`. You get
   every event exactly once.
2. Remember the largest `updatedAt` you saw.
3. Later, call with `updatedSince=<that updatedAt>` and page the same way. An event you already have may come again;
   replace it by `uid`.

To show the queue of submissions that wait for you, read `status=PENDING`.

## Approve or reject an event

```bash
curl -X POST "$API/v1/integrations/events/cmabc123/decision" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{ "status": "APPROVED" }'
```

```bash
curl -X POST "$API/v1/integrations/events/cmabc123/decision" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{ "status": "REJECTED", "note": "Not a network event" }'
```

| Field    | Meaning                                                                            |
| -------- | ---------------------------------------------------------------------------------- |
| `status` | `APPROVED` or `REJECTED`                                                           |
| `note`   | Optional text, stored with the decision. The submitter sees it next to their event |

- Works on an event in any status. Rejecting an approved event hides it from LabOS. Approving a rejected event
  brings it back.
- Sending the same decision again succeeds and changes nothing.
- The answer is the event, in the shape of a list item.

## Publish your own event

```bash
curl -X PUT "$API/v1/integrations/events/by-external-id/evt-1" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{
    "name": "ETHDenver 2027",
    "startDate": "2027-02-23",
    "endDate": "2027-03-02",
    "allDay": true,
    "format": "IN_PERSON",
    "tags": ["FA2"],
    "websiteUrl": "https://www.ethdenver.com",
    "address": { "city": "Denver", "state": "Colorado", "country": "United States" }
  }'
```

`evt-1` is your own id of the event (1 to 200 characters). Answer:

```json
{ "uid": "cmxyz999", "externalId": "evt-1", "result": "created", "status": "APPROVED" }
```

- The first call with an id creates the event. It is published (`APPROVED`) at once.
- A later call with the same id updates that event: `"result": "updated"`, same `uid`. So a job that sends the same
  events again makes no duplicates. Every `PUT` sends `name`, `startDate` and `format`. Another field that you leave out keeps its value. Send `null` to clear a field.
- An update keeps the event's status. To hide your event, reject it or delete it.
- If you deleted the event, sending its id again brings it back with the same `uid`.
- Your ids are your own: another team's events with the same id are separate events.
- Keep the returned `uid`. You need it for a decision, a correction or a delete.

### Event fields

Only `name`, `startDate` and `format` are required.

| Field                                                        | Type                       | Meaning                                                                                                                                                                      |
| ------------------------------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                                                       | text, required             |                                                                                                                                                                              |
| `startDate`                                                  | required                   | A date-time with an offset (`2027-02-23T09:00:00-07:00`), or a day (`2027-02-23`) together with `allDay: true`                                                               |
| `endDate`                                                    |                            | Same form as `startDate`. When absent, the event ends on its start day                                                                                                       |
| `allDay`                                                     | boolean                    | `true` when the dates have no time of day                                                                                                                                    |
| `format`                                                     | required                   | `IN_PERSON`, `VIRTUAL` or `HYBRID`                                                                                                                                           |
| `timezone`                                                   | IANA name                  | For example `America/Denver`. When absent, LabOS uses the time zone of the city's gathering, or `UTC`                                                                        |
| `accessOption`                                               |                            | `OPEN`, `INVITE` or `PAID`                                                                                                                                                   |
| `tags`                                                       | list of text               | Free text, for example focus area codes                                                                                                                                      |
| `description`                                                | text or HTML               | Stored as safe HTML (text formatting, lists, `http` / `https` links)                                                                                                         |
| `hostName`, `hostEmail`                                      | text                       |                                                                                                                                                                              |
| `coHosts`                                                    | list of `{ name, email? }` |                                                                                                                                                                              |
| `websiteUrl`, `registrationUrl`, `meetingUrl`, `locationUrl` | `http` or `https` address  | `locationUrl` opens the venue on a map                                                                                                                                       |
| `contactInfos`                                               | object                     | Addresses by platform: `{ "twitter": ["https://x.com/pl"] }`                                                                                                                 |
| `agenda`                                                     | object                     | `{ "sessions": [{ "name", "description", "start_date", "end_date" }], "agendaSummary" }`                                                                                     |
| `address`                                                    | object                     | `{ address, city, state, country, latitude, longitude, locationInstructions }`. LabOS puts the event in the gathering of its city. An event with no city has no gathering    |
| `logoUid`                                                    | text                       | The `uid` from the image upload                                                                                                                                              |
| `associations`                                               | list                       | Links to LabOS members and teams: `{ "role": "HOST", "memberUid": "..." }` or `{ "role": "SPONSOR", "teamUid": "..." }`. `role` is `HOST`, `CO_HOST`, `SPEAKER` or `SPONSOR` |

An invalid event answers 422, and nothing is stored. `message` names each problem with its field, separated by `; `:

```json
{ "statusCode": 422, "message": "endDate: endDate is before startDate" }
```

A day with no time needs `allDay: true`. Without it the answer is
`"startDate: a date with no time of day needs allDay: true"`.

## Publish events in a batch

```bash
curl -X POST "$API/v1/integrations/events/batch" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{
    "events": [
      { "externalId": "evt-2", "name": "DevConnect", "startDate": "2026-11-17", "allDay": true, "format": "IN_PERSON" },
      { "externalId": "evt-3", "startDate": "2026-12-01", "allDay": true, "format": "IN_PERSON" },
      { "externalId": "evt-4", "name": "Community Call", "startDate": "2026-12-03T16:00:00Z", "format": "VIRTUAL" }
    ]
  }'
```

Each event is an event body plus its `externalId`. Up to 100 events. Each one follows the rules of the single call.
The answer has one result for each event, in the same order. One invalid event does not stop the others:

```json
{
  "results": [
    { "uid": "cmaaa111", "externalId": "evt-2", "result": "created", "status": "APPROVED" },
    { "externalId": "evt-3", "result": "error", "error": "name: Required" },
    { "uid": "cmccc333", "externalId": "evt-4", "result": "created", "status": "APPROVED" }
  ]
}
```

More than 100 events, or no events, answers 422 and stores nothing.

## Correct any event

```bash
curl -X PATCH "$API/v1/integrations/events/cmabc123" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{ "name": "Lisbon Builders Night (December)" }'
```

Send only the fields to change, from the table above. The status and the submitter do not change. Use it to fix a
typo in a submission before you approve it. The answer is the event, in the shape of a list item. An invalid value
answers 422.

## Delete your own event

```bash
curl -X DELETE "$API/v1/integrations/events/cmxyz999" -H "Authorization: Bearer $KEY"
```

Answer: `{ "uid": "cmxyz999", "deleted": true }`. The event leaves LabOS.

You can delete only an event your team published (`createdByYourTeam: true`). For any other event the answer is
403; reject it with a decision to hide it.

## Upload an event image

```bash
curl -X POST "$API/v1/integrations/events/images" \
  -H "Authorization: Bearer $KEY" \
  -F "file=@logo.png"
```

Answer: `{ "uid": "cmimg555", "url": "https://..." }`. Send the `uid` as `logoUid` in an event. Accepted types:
JPEG, PNG, WebP and GIF. Another file type answers 400.

## Implementation

| Part                                     | File                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------- |
| Controller                               | `apps/web-api/src/pl-events/pl-event-curation.controller.ts`         |
| Service                                  | `apps/web-api/src/pl-events/pl-event-curation.service.ts`            |
| Write path shared with the member routes | `apps/web-api/src/pl-events/pl-event-write.service.ts`               |
| Body and answer schemas                  | `libs/contracts/src/schema/pl-event-body.ts`, `pl-event-curation.ts` |
