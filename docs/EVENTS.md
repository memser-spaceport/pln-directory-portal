# Events

Events are `PLEvent` rows in the Directory database. This page covers which events a read returns, the events list
endpoint, submitting an event and the submit form's lookups. Attendance ("I'm going") and gatherings are described in the OpenSpec specs `irl-event-attendance` and
`irl-event-details`.

## Which events are visible

An event has a `status`: `DRAFT`, `PENDING`, `APPROVED` or `REJECTED`. Every event read returns only events that are
`APPROVED` and not deleted: the events list, upcoming events, gathering events, the event read, home, the digest
page, search, AI search, MCP event tools, profile events, recommendations and push notifications.

The rule lives in one place, `apps/web-api/src/pl-events/pl-event-visibility.ts`:

```ts
import { VISIBLE_PL_EVENT_WHERE } from '../pl-events/pl-event-visibility';

await this.prisma.pLEvent.findMany({ where: { ...VISIBLE_PL_EVENT_WHERE, locationUid } });
```

- A new `prisma.pLEvent` read spreads `VISIBLE_PL_EVENT_WHERE` into its `where`. Raw SQL uses `visiblePLEventSql('e')`.
- A read that must see other events (the sync, a write path) says why in a `// pl-event-visibility: <reason>` comment
  right above the call.
- `pl-event-visibility.spec.ts` scans the source and fails for a `pLEvent` read that has neither.
- A read that returns whole `PLEvent` rows passes them through `withoutPrivateEventFields`. It removes the columns
  only the submitter, a directory admin and a curator read: `submitterUid`,
  `sourceTeamUid`, `reviewedAt`, `reviewNote` and `privateDetails`.

The global search index (`event` in OpenSearch, filled by `lambda/lambda-opensearch-sync`) holds approved, non-deleted
events only. An event that stops being visible is removed from the index on the next run of the Lambda. Deploy the
Lambda after the migration that adds `PLEvent.status`, because its query reads that column. `GET /v1/global-search/all` matches events on name, description, short description, location and `additionalInfo` (tags,
host, agenda), but shows only the first four as matches: `additionalInfo` is indexed as a JSON string. The frontend
opens an event result on the LabOS All Events page (`/events/all?event=<uid>`), not on the index's `eventUrl`.

## Which gatherings are listed

`GET /v1/irl/locations` (the IRL Gatherings list) returns every gathering that is not deleted and has at least one
visible event. A gathering that a new event creates is listed as soon as that event is approved; one whose events are
all drafts, pending, rejected or deleted is not. Gatherings with a `priority` come first, lowest first, then the ones
without, each group by name. `priority` only orders the list; nothing sets it when a gathering is created.

## Event fields

Time zone, format, access, tags, host name, venue address and position, the all-day flag and the registration and
meeting links are typed `PLEvent` columns (see `docs/DATABASE_SCHEMA.md`). Co-hosts, sponsors, the host logo, tag
colours, the agenda and the map link stay in `additionalInfo.details`. `GET /v1/irl/events/:uid` returns both as one
`details` object, plus `timezone`, `allDay`, `venue`, `registrationUrl` and `meetingUrl`.

Both events-service sync paths (the queue consumer and `POST /v1/irl/events/sync`) write the typed columns through
`mapEventColumns` (`pl-event-columns.mapper.ts`). `POST /v1/irl/events/sync` with `detailsOnly: true` fills them on
events that already exist.

## List events

```
GET /v1/irl/events
```

Auth: optional user token. Not cached.

Returns approved events, earliest start first. With no date filter it returns only events that have not ended.

| Query          | Meaning                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `page`         | Page number, from 1. Default 1.                                                                                                                  |
| `limit`        | Page size, 1 to 100. Default 50. A larger value answers 400.                                                                                     |
| `search`       | Text matched on the event name and the host name, ignoring case.                                                                                 |
| `city`         | The gathering's city, for example `Lisbon`.                                                                                                      |
| `format`       | `IN_PERSON`, `VIRTUAL` or `HYBRID`.                                                                                                              |
| `accessOption` | `OPEN`, `INVITE` or `PAID`.                                                                                                                      |
| `tag`          | A tag name, exact.                                                                                                                               |
| `host`         | A host name, ignoring case.                                                                                                                      |
| `featured`     | `true` or `false`.                                                                                                                               |
| `from`, `to`   | Events that overlap this range, ended events included. A date (`2026-07-01`) or an ISO date-time with an offset. A date is the whole day in UTC. |
| `going`        | `true`: only the events the signed-in member is going to. Answers 401 with no user token.                                                        |

`city`, `format`, `accessOption`, `tag` and `host` can be repeated (`?city=Lisbon&city=Denver`). An event matches when
it has any one of the values. Different filters combine with AND. A value that is not allowed (an unknown `format`, a
`limit` of 500, a `from` that is not a date) answers 400. A filter that matches nothing answers 200 with no items.

Example:

```bash
curl "http://localhost:3000/v1/irl/events?city=Lisbon&format=IN_PERSON&limit=2"
```

```json
{
  "page": 1,
  "limit": 2,
  "total": 1,
  "items": [
    {
      "uid": "cmabc123",
      "name": "Lisbon Builders Night",
      "slugURL": "lisbon-builders-night-x7k2",
      "type": "IN_PERSON",
      "startDate": "2026-12-01T18:00:00.000Z",
      "endDate": "2026-12-01T21:00:00.000Z",
      "allDay": false,
      "timezone": "Europe/Lisbon",
      "format": "IN_PERSON",
      "accessOption": "OPEN",
      "tags": ["Networking Event"],
      "isFeatured": false,
      "logo": "https://example.org/logo.png",
      "banner": null,
      "host": { "name": "Protocol Labs", "logo": null },
      "coHosts": [{ "name": "Filecoin Foundation" }],
      "gathering": { "uid": "cmloc456", "city": "Lisbon", "country": "Portugal" },
      "venue": { "address": "Avenida da Liberdade 10", "latitude": 38.7205, "longitude": -9.1453 },
      "goingCount": 12,
      "faces": [{ "uid": "cmmem789", "name": "Ada Example", "image": null }],
      "isGoing": false,
      "externalId": null,
      "websiteUrl": "https://example.org",
      "location": "Lisbon, Portugal",
      "locationUid": "cmloc456",
      "flag": "https://example.org/flags/pt.svg"
    }
  ]
}
```

Notes on an item:

- `timezone` is the event's own time zone, or its gathering's when the event has none.
- `gathering` is null for an event with no gathering (a virtual event). `venue` is null when the event has no
  address and no position.
- `goingCount` counts distinct members the attendee list shows, as on the event drawer. An invite-only event
  (`type: "INVITE_ONLY"` or `accessOption: "INVITE"`) has `goingCount: null` and no `faces`. The drawer, upcoming
  events, profile events and the digest page hide the attendance of such an event from signed-out viewers.
- `isGoing` is true only for a signed-in viewer who goes to the event.
- `externalId`, `websiteUrl`, `location`, `locationUid` and `flag` are the fields of `GET /v1/irl/events/upcoming`.

## Submit an event

The routes in this section are on only when `EVENTS_LOCAL_SUBMIT_ENABLED=true`. While it is off they answer 404 and
the events service keeps owning submissions.

```
POST /v1/irl/events
```

Auth: a signed-in member. A request with no session answers 401. People with no LabOS account do not submit in
LabOS.

The server decides the status and returns it:

| Who submits                                                      | Status                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------- |
| A member with the `forum.write` permission, or a directory admin | `APPROVED`: the event is visible at once                       |
| Any other member                                                 | `PENDING` (shown as "Submitted"): the event waits for approval |

A `status` in the body is ignored.

Body fields:

| Field                                                        | Required          | Meaning                                                                                                                                                                                             |
| ------------------------------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                                                       | yes               |                                                                                                                                                                                                     |
| `startDate`, `endDate`                                       | yes               | ISO date-time with an offset (`2026-07-24T18:00:00+01:00`), or a day (`2026-07-24`) with `allDay: true`                                                                                             |
| `timezone`                                                   | yes               | IANA name (`Europe/Lisbon`)                                                                                                                                                                         |
| `format`                                                     | yes               | `IN_PERSON`, `VIRTUAL` or `HYBRID`                                                                                                                                                                  |
| `tags`                                                       | yes, at least one | Free text                                                                                                                                                                                           |
| `hostName`                                                   | yes               |                                                                                                                                                                                                     |
| `allDay`                                                     |                   | `true` for dates with no time of day                                                                                                                                                                |
| `accessOption`                                               |                   | `OPEN`, `INVITE` or `PAID`                                                                                                                                                                          |
| `description`                                                |                   | Text or HTML. Stored as safe HTML: paragraphs, headings, bold, italic, underline, strikethrough, lists, alignment, line breaks and `http` / `https` links. Every other tag and attribute is dropped |
| `hostEmail`, `coHosts[{ name, email? }]`                     |                   | The emails are returned only to the submitter and a directory admin                                                                                                                                 |
| `websiteUrl`, `registrationUrl`, `meetingUrl`, `locationUrl` |                   | `http` or `https` only                                                                                                                                                                              |
| `contactInfos`                                               |                   | Addresses by platform: `{ "twitter": ["https://x.com/pl"] }`                                                                                                                                        |
| `agenda`                                                     |                   | `{ sessions: [{ name, description?, start_date, end_date, timezone? }], agendaSummary? }`                                                                                                           |
| `address`                                                    |                   | `{ address, city, state, country, latitude, longitude, locationInstructions }`. City, state and country choose the gathering. An event with no city, and a virtual event, has no gathering          |
| `logoUid`, `bannerUid`                                       |                   | `Image.uid` from `POST /v1/images`                                                                                                                                                                  |
| `associations`                                               |                   | `[{ role, memberUid }]` or `[{ role, teamUid }]`, `role` one of `HOST`, `CO_HOST`, `SPEAKER`, `SPONSOR`. A named member shows as going to the event while it is approved                            |
| `draft`                                                      |                   | `true` saves a draft (members only). A draft needs only `name`, the dates and `timezone`                                                                                                            |

Example:

```bash
curl -X POST "http://localhost:3000/v1/irl/events" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lisbon Builders Night",
    "startDate": "2026-12-01T18:00:00+00:00",
    "endDate": "2026-12-01T21:00:00+00:00",
    "timezone": "Europe/Lisbon",
    "format": "IN_PERSON",
    "tags": ["Networking Event"],
    "hostName": "Protocol Labs",
    "address": { "address": "Avenida da Liberdade 10", "city": "Lisbon", "country": "Portugal" }
  }'
```

Answer, 201:

```json
{ "uid": "cmabc123", "status": "APPROVED" }
```

An invalid body answers 400 and stores nothing. `message` names each problem with its field, separated by `; `
(`"endDate: endDate is before startDate; tags: at least one tag is required"`).

### Your own events

| Route                        | Who                        | What                                                                                                                                                                                                                                                                        |
| ---------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/irl/events/mine`    | signed-in member           | The events the member submitted, in every status, newest first: `uid`, `name`, dates, `allDay`, `timezone`, `status`, `reviewNote`, `updatedAt`                                                                                                                             |
| `GET /v1/irl/events/:uid`    | submitter, directory admin | A non-approved event answers 404 to everyone else. The submitter and a directory admin also get `status` and the edit form's fields (`hostEmail`, `coHosts` with emails, `address`, `agenda`, `contactInfos`, `logoUid`, `associations`). A draft is for its submitter only |
| `PATCH /v1/irl/events/:uid`  | submitter, directory admin | Any subset of the body fields. A missing field keeps its value; `null` clears it. The status does not change, except: `submit: true` sends a draft for approval, and a directory admin may send `status` (`PENDING`, `APPROVED`, `REJECTED`). Others get 403                |
| `DELETE /v1/irl/events/:uid` | submitter, directory admin | The event leaves every read. A submitter cannot delete their approved event (403); a directory admin can                                                                                                                                                                    |

The member routes share one write path with the curation API and the MCP `submit_event` tool:
`PLEventWriteService` (`apps/web-api/src/pl-events/pl-event-write.service.ts`).

### Form lookups

For the submit form. Each route needs a signed-in member (401 without a session) and uses the normal rate limit.

| Route                                                       | Answer                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/irl/events/places?query=`                          | Up to 5 suggestions: `[{ text, placeId }]`. Empty `query`: 400                                                                                                                                                                                           |
| `GET /v1/irl/events/places/resolve?placeId=` or `?address=` | `{ placeId, address, city, state, country, latitude, longitude, locationUrl, timezone }`. No match: 404. `timezone` is null when the time zone lookup fails                                                                                              |
| `POST /v1/irl/events/agenda/parse`                          | Body `{ text, startDate, endDate, timezone }`. Answer `{ sessions: [{ name, description, start_date, end_date, timezone }], message }`. A session with no end lasts one hour. With no sessions, `message` says what is missing. Model not reachable: 503 |

The venue routes use `GOOGLE_PLACES_API_KEY` (Places, Geocoding and Time Zone APIs). Agenda parsing uses the API's
AI provider (`EVENT_AGENDA_PARSE_AI_PROVIDER` overrides it). A failed model call logs the model, the error class, the HTTP status and the
provider's error type and code, never the agenda text (LAB-3443).
