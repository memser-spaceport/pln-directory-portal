# Design

## Context

See proposal.md for the motivation. The facts that shape the approach:

- `PLEvent` in the LabOS Postgres already holds every approved event, keyed by `externalId` (the events service's `event_id`). Two paths write it: an SQS consumer (`events/events.consumer.ts`) and a pull sync (`pl-events/pl-event-sync.service.ts`, `POST /v1/irl/events/sync`). Attendance (`PLEventGuest`), gatherings (`PLEventLocation`, `PLEventLocationAssociation`) and host links (`PLEventAssociation`) are LabOS tables.
- `PLEvent` has no status, submitter or source. Tags, access, format, host and agenda sit in `additionalInfo.details`. `type` mixes format and access (`INVITE_ONLY`, `VIRTUAL`, `IN_PERSON`).
- On prod: 698 events (625 with `externalId`), 2,461 guest rows, 41 gatherings. No event has `additionalInfo.details` yet (the details backfill has not run). 268 logos point at the `pl-events-service-prod` S3 bucket and 148 at `images.lumacdn.com`.
- The events service has no source code in our org. Its public read (`GET /events?status=APPROVED`) and its SQS messages are the only interfaces we rely on.
- The submission portal (`pl-events-submission`) is the only caller of `/v1/internals/irl/*`, `GET /v1/events/location-associations` and `POST /v1/service/images`.
- The curator app `pl-infra-events` is an AI App with its own Postgres. AI Apps sit behind the LabOS auth sidecar, and web-api has no way to read an app's database. Team-scoped integration keys (`integration-keys/`, `IntegrationKeyGuard`, `@RequireIntegrationScopes`) already authenticate partner servers.
- Readers of `PLEvent`: `pl-events/*`, `home`, `team-news` digest, `search` (OpenSearch `events` index), `husky/tools/irl-events.tool.ts`, `mcp/*`, `recommendations`, `push-notifications`, `member-signals`, `member-interest-profile`.

## Goals / Non-Goals

**Goals:**

- One store and one module for events, with no sync code left.
- A curator app does its whole job through a small API: read, decide, publish in bulk by its own ids.
- A cutover that can be rehearsed on a feature env and rolled back until the old service is removed.
- No change to the response shapes the v2 event drawer, profile events and home already read.

**Non-Goals:**

- Renaming `PLEvent`, the `/v1/irl` prefix or the gathering model.
- "I'm going" for events with no gathering (virtual events). It stays refused, as today.
- Geocoding on the server. Coordinates come from the client (Google Places in the v2 form) or from the partner app.
- Webhooks to partner apps. They poll with `updatedSince`.

## Decisions

### D1. LabOS Postgres and `PLEvent` are the only store

`PLEvent` has foreign keys to `Member`, `Team`, `Image`, guests and associations, and about a dozen modules read it. A separate events database would need the same sync this change removes. Alternative considered: keep the events service and only re-host its data. Rejected: no source code, two databases, and the approval rule would still live outside LabOS.

### D2. Schema: add status, submitter, source; promote only filtered fields

New `PLEvent` columns:

| Column | Type | Note |
|---|---|---|
| `status` | enum `PLEventStatus` (`DRAFT`, `PENDING`, `APPROVED`, `REJECTED`), default `APPROVED` | default keeps every current row visible. The UI shows `PENDING` as "Submitted". In the old events service the raw value `PENDING` meant a draft and `SUBMITTED` meant waiting; do not carry those names over |
| `submitterUid` | `String?` → `Member` | null for partner events and for events from the events service |
| `sourceTeamUid` | `String?` → `Team` | the team whose integration key published the event |
| `reviewedAt`, `reviewNote` | `DateTime?`, `String?` | last decision |
| `timezone` | `String?` | IANA name |
| `format` | enum `PLEventFormat` (`IN_PERSON`, `VIRTUAL`, `HYBRID`) | |
| `accessOption` | enum `PLEventAccess` (`OPEN`, `INVITE`, `PAID`) | |
| `tags` | `String[]` | focus areas stay tag codes |
| `hostName` | `String?` | host logo stays in `details` |
| `venueAddress`, `latitude`, `longitude` | `String?`, `Float?`, `Float?` | |
| `isAllDay` | `Boolean`, default `false` | dates with no time of day |
| `registrationUrl`, `meetingUrl` | `String?` | |
| `privateDetails` | `Json?` | host and co-host emails and the address parts; read by the submitter, a directory admin and a curator only. A column of its own, because older reads return `additionalInfo` as it is |

Indexes: `(status, isDeleted, startDate)`, GIN on `tags`, unique `(sourceTeamUid, externalId)`.

- Co-hosts, sponsors, host logo, agenda and the map link (`locationUrl`, LAB-3332) stay in `additionalInfo.details`. Nothing filters on them. `locationUrl` is part of the shared event body, so a member and a partner app can both send it.
- `type` stays and is derived on every write through the event write service (`INVITE` → `INVITE_ONLY`, `VIRTUAL` → `VIRTUAL`, otherwise `IN_PERSON`), because the invite-only rules in attendance read it. The migration does not rewrite `type` on existing rows: an event that turned `INVITE_ONLY` would be hidden from members who do not attend it, and step 1 must change nothing a user sees.
- `slugURL` stays unique. New events get a slug from the name plus a short random suffix. Legacy rows keep their `event_id` slug, which v2 deep links use.
- `reviewerUid` is unused (no row sets it on prod) and is left alone.
- `syncedAt` is dropped in the removal step.
- Alternative considered: keep everything in JSON and filter with JSON operators. Rejected: the list endpoint filters and sorts on these fields, and typed columns are simpler to validate and index.

### D3. One module and one route family

All event routes live in the `pl-events` module under `/v1/irl/events`, next to the reads that exist: `POST /` (submit), `GET /` (list), `GET /mine`, `PATCH /:uid`, `DELETE /:uid`. The `events` module (consumer, helpers, tooling proxy, `POST /v1/events/submit`) is deleted at the end. The curation routes go in a new controller in the `pl-events` module under `/v1/integrations/events`, with the same guard, `@SkipThrottle()` and `@NoCache()` as `IntegrationsController`.

Static paths (`/mine`, `/upcoming`, `/contributors`) are declared before `/:uid`, as the existing spec scenario "Static paths keep working" requires.

Alternative considered: a new `/v1/events` family. Rejected: two prefixes for one resource, and every existing reader and the v2 services already use `/v1/irl/events`.

### D4. One write path for all three callers

A single service method validates and writes an event (create or update): it derives `type`, resolves the gathering, writes associations, and stamps status, submitter and source. The member submit, the member edit, the curation upsert and the MCP submit tool all call it with a different "actor":

| Actor | Status on create | May edit | May delete |
|---|---|---|---|
| Member with `forum.write`, or directory admin | `APPROVED` | own (admin: any) | own (admin: any) |
| Other member | `PENDING` | own | own |
| Integration key with `events:write` | `APPROVED` | any | events of its team |

The forum check is `AccessControlV2Service.hasPermission(memberUid, FORUM_PERMISSIONS.WRITE)`, the same check the news and MCP forum tools use. It runs on the server only.

One Zod schema in `libs/contracts` describes the event body. The member contract adds `draft`; the partner routes take `externalId` in the path or next to the body.

### D5. Visibility is one shared filter

A single exported Prisma `where` fragment (`status: APPROVED`, `isDeleted: false`) is used by every reader listed in Context, and the OpenSearch indexer only indexes rows that match it and removes a row that stops matching. Readers stop repeating `isDeleted: false` by hand. A unit test lists the reader call sites and fails when a new `pLEvent.findMany` appears without the fragment.

Guest rows for named hosts, speakers and sponsors are written when an event becomes `APPROVED` (on create or on decision), and removed when it stops being approved. This keeps pending events out of profile events and attendee lists without touching every guest query. It reuses the logic in `event-guests-sync.helper.ts`, moved into the `pl-events` module.

Alternative considered: a separate `EventSubmission` table, copied into `PLEvent` on approval. Rejected: two shapes for one thing, a copy step, and the curator app would need two id spaces.

### D6. Gatherings are resolved from the address

An in-person or hybrid event carries `city`, `state` and `country`. The write path finds the `PLEventLocationAssociation` for that triple and uses its gathering. With no match it creates a gathering named from the city and country, with the event's time zone, and an association (`AUTO_MAPPED`). This is the behaviour of `handleLocationAndAssociation` and the pull sync today, kept as one function. A virtual event has no gathering.

The current consumer drops an event that has no gathering, so virtual events only arrive through the pull sync. The new write path stores virtual events directly.

### D7. Curation API: keys, scopes, identity

- Two new scopes in `INTEGRATION_KEY_SCOPES`: `events:read` and `events:write`. A directory admin creates the key for the curator's team with `POST /v1/admin/integration-keys`, as for other integrations (back-office has no key screen).
- `events:write` is a curator role: it decides on and corrects any event. Deleting is limited to the key's own team's events, so a leaked key cannot erase member submissions; a wrong rejection is undone with a second decision.
- A partner event's identity is `(sourceTeamUid, externalId)`. Pushing the same id again updates the event, and a soft-deleted one is restored. This is what makes a scraper safe to re-run.
- The list uses the cursor pattern of `integration-candidates.service.ts` (`cursor`, `since`, `limit`, `nextCursor`), ordered by `updatedAt` then `uid`.
- Batch is a loop over the single upsert, each event in its own transaction, with a per-item result. Limit 100.
- Bodies are validated with the `@abitia/zod-dto` pipe, as in `job-openings-integration.controller.ts`, so an invalid body answers 422. The member routes in `pl-events.controller.ts` keep their pipe and answer 400.
- Images: a multipart upload route that reuses the image service and returns an `Image` uid. No "fetch this URL" input, to avoid server-side requests to arbitrary hosts.
- The API is described in `docs/EVENTS_CURATION_API.md` with request and response examples, written so the app owner can hand it to her build agent. `pl-infra-events` stores the key as a runtime secret.

Alternative considered: LabOS calls the app (push submissions, pull decisions). Rejected: the app would need public paths and its own auth, decisions would arrive with a sync delay, and LabOS would depend on an app it does not control.

### D8. Submitting needs a signed-in member

`POST /v1/irl/events`, the edit and delete routes, `GET /v1/irl/events/mine` and the form lookups use `UserTokenValidation`. A request with no session answers 401. A submitter must be able to edit their event later, so there is no submission without an account; the curator helps people with no LabOS account by hand. No per-IP limit is added: signed-in requests use the normal member rate limit.

A body that fails validation answers 400 with `message` as one line of text (`"endDate: endDate is before startDate; tags: at least one tag is required"`), because the API's error filter returns `message` only when it is text.

### D9. Response shapes stay stable

`GET /v1/irl/events/:uid` keeps its `details` object, now assembled from the columns plus the JSON remainder by the existing `pl-event-details.mapper.ts`. `upcoming`, profile events, home and digest items keep their fields. The list endpoint reuses `ResponseUpcomingEventSchema` and extends it.

### D10. The curation API fits the PL Infra Events app as it is

The app's source (bundle `apps/pl-infra-events/d202611101148106475/app.zip`) shows what its owner does today and what its event record holds:

- Every event page has a "Send to PL Events Portal" button (`components/PortalSubmitButton.tsx`). It copies the title, dates, location, type, link and notes to the clipboard and opens `https://irl.os.pl.xyz/events/add`. She then types the event into the portal form. This is the manual step.
- The app is an internal planning tracker: about 300 events, most of them third-party conferences, many with a status such as "No Action" or "Watch". She sends events to LabOS one by one. So the app publishes the events she picks, never all of them.
- An event has `title`, `start_date` and `end_date` (dates only, end often empty), free-text `city` and `country`, one `link`, `focus_fund[]` (FA1 to FA4 and others), `type`, and a unique `master_id`. It has no description, time zone, time of day, format, venue address, coordinates, image, or LabOS member and team ids.
- It already calls another service with a key (`lib/pulse/client.ts`, `fetchPulseJson`) and pulls candidates from it into a review queue (`lib/pulse/updates.ts`, cursor in `app_settings`).

What follows for the API:

- A partner event needs only a name, a start date and a format (spec `event-curation-api`). Requiring a description, a time zone or times would send her back to typing.
- All-day events are a real case, so `isAllDay` is part of the model (D2).
- `externalId` is her `master_id`. Her app deletes rows on merge and on duplicate cleanup, so it calls the delete route for a published event that it removes.
- Tags take her `focus_fund` codes as they are. Host, speaker and sponsor links stay optional, because her app has only names.
- The pending queue of LabOS submissions fits her existing intake pattern: pull with `updatedSince`, show in her review queue, send the decision back.

The change in her app is small: a LabOS client next to `lib/pulse/client.ts`, a "Publish to LabOS" action in place of the portal button, two columns for the LabOS uid and the last sync, and a pull of pending submissions into her queue.

Until her app is changed, `irl.os.pl.xyz/events/add` redirects to the LabOS submit form, so her button and clipboard keep working.

### D12. The member API keeps the old form's rules

The v2 form keeps the old portal's UX (v2 change `events-on-labos-stack`), so the member body mirrors what that form sent. Source: a field-by-field read of `pl-events-submission` (`components/core/event-form/add-event-form.tsx`).

| Old payload | LabOS body | Stored in |
|---|---|---|
| `event_name`, `start_date`, `end_date`, `timezone`, `format`, `access_option`, `tags` | `name`, `startDate`, `endDate`, `timezone`, `format`, `accessOption`, `tags` | columns |
| `description` (HTML from the editor) | `description` | column, sanitized with `sanitize-html` on every write |
| `host`, `host_email`, `co_hosts[{name,email}]` | `hostName`, `hostEmail`, `coHosts` | `hostName` column; co-host names in `details`; emails in `privateDetails` |
| `registration_link`, `website_link`, `meeting_link` | `registrationUrl`, `websiteUrl`, `meetingUrl` | columns; `websiteUrl` is the existing `PLEvent.websiteURL` |
| `contact_infos` | `contactInfos` | `details` |
| `agenda {sessions, agendaSummary}` | `agenda` | `details.agenda` (shape unchanged) |
| `address_info` (address, city, state, country, latitude, longitude, locationUrl, location_instructions) | `address` | `venueAddress`, `latitude`, `longitude` columns; `locationUrl` and instructions in `details`; city, state and country resolve the gathering (D6) |
| `event_logo` (URL) | `logoUid` | `logoUid` |
| `status` chosen by the button (`PENDING` = draft, `SUBMITTED`) | `draft: true`, or nothing | `status` `DRAFT`, or the rule in D4 |

- Required for a submission: name, dates, time zone, format, one tag, host name. A draft needs name, dates and time zone. Location and description are optional, as in the old form.
- Tags are free text, as before. The five default chips live in the v2 form.
- Host and co-host emails are contact data. They are returned only to the submitter and a directory admin.
- An edit never changes the status. The old portal sent "submitted" on every save and let the old backend decide; LabOS keeps an approved event approved (risk accepted in Risks).
- A submitter cannot delete their approved event, as the old list had no Delete there. A directory admin can.
- Old client-side bugs are not carried over: co-host, registration and website link checks run on create as well as on edit.

### D13. Form lookups stay on the server

The old portal called Google, OpenAI and the Event Harvester from its own Next server or from the browser; its `next.config.ts` lists the OpenAI key in `env`, which puts it in the browser bundle. LabOS serves three thin routes in the `pl-events` module instead (`event-form-helpers`):

- **Places and place details.** Reuse `LocationTransferService` and its Google key. The existing `/v1/locations/autocomplete` is limited to regions, so the venue search is a new method without that limit. Place details add the time zone (Google Time Zone API).
- **Agenda parsing.** `generateObject` with the repo's AI SDK and the provider the API already uses, with the old prompt rules (one hour default, dates required for multi-day events). 503 when the provider is down.
- All three need a signed-in member, like the form itself.

Alternative considered: Next route handlers in v2, as in the old portal. Rejected: a second Google key and a model key in the frontend deploy, and no shared rate limit.

### D11. Legacy logos

Event logos are `Image` rows that hold a URL. The 268 that point at `pl-events-service-prod` are copied into the LabOS image bucket by a one-time script before the bucket is removed, and the `Image.url` values are updated. Luma-hosted logos are left as they are.

## Risks / Trade-offs

- [A reader misses the approved filter and shows a pending event] → one shared fragment (D5), a test that enumerates the call sites, and a check on the feature env with a pending event against every surface in the proposal's list.
- [A leaked `events:write` key approves spam or rejects real events] → keys are admin-issued, revocable, and audited by `lastUsedAt`; decisions are reversible; delete is limited to the team's own events.
- [A member edits an approved event into something else] → accepted; status does not change on edit. A curator or admin can reject it. Revisit if it happens.
- [Events created in LabOS during the rollback window do not exist in the old service] → the window is short and the old portal stays frozen during it; on rollback these events stay in LabOS and stay visible.
- [The details backfill finds events the old service no longer returns] → they keep null columns and still read as today (empty details).
- [Events that came from the events service have no submitter in LabOS, so their authors cannot edit them under "my events"] → the queue message carries `requestorEmail`, but LabOS never stored it. Before cutover, check if the events service's event list returns the creator's email; if it does, the final sync sets `submitterUid` by matching member email. If it does not, these events are edited by a directory admin or the curator app.
- [Drafts and rejected events in the events service are not moved] → accepted; only approved events are part of LabOS today. Admins clear the pending queue before the freeze.
- [`type` and the new `format`/`accessOption` disagree on rows from before the migration] → accepted; `type` is derived in the one write path for every new write, and the old rows keep the `type` they have.
- [Partner app change is owned by someone outside the team] → the API document and a tested example request set are delivered with the API; cutover does not wait for the app, because directory admins can decide through `PATCH /v1/irl/events/:uid`.

## Migration Plan

Four steps, each its own PR and deploy. Steps 1 to 3 are reversible.

1. **Additive schema and readers.**
   - Run the existing details backfill on dev and prod (`POST /v1/irl/events/sync` with `detailsOnly: true`).
   - Migration: add the columns and enums; fill them from `additionalInfo.details`; all rows `APPROVED`.
   - Both sync paths also write the new columns. Readers use the shared filter. Ship the list endpoint.
   - No visible change. Rollback: revert the deploy; the columns are unused.
2. **New write paths, switched off on prod.**
   - Submit, mine, edit, delete, curation API, new scopes, MCP submit tool, behind `EVENTS_LOCAL_SUBMIT_ENABLED`.
   - Tested on dev and on a feature env with v2 and a test integration key.
3. **Cutover (one day).**
   - Precondition: the native All Events page (LAB-3317) is live on prod. The old page is an iframe of `events.plnetwork.io`, which reads the events service, so an event submitted in LabOS after cutover would not show there.
   - Admins clear the pending queue in the old portal. The portal is put in maintenance (redirect to LabOS).
   - Final full pull sync. Compare counts: events from `GET /events?status=APPROVED` against `PLEvent` rows with `externalId`; guest and gathering counts before and after.
   - Set `EVENTS_LOCAL_SUBMIT_ENABLED=true`, stop the SQS consumer (unset `EVENTS_QUEUE_URL` handling by flag), enable the v2 submit form.
   - Issue the integration key for `pl-infra-events`.
   - Rollback: flag off, consumer on, portal back.
4. **Removal (after two quiet weeks).**
   - Copy legacy logos (D11).
   - Delete the `events` module, the pull sync, `/v1/internals/irl/*` routes with no caller, `POST /v1/service/images`, `syncedAt`, the flag and the env vars.
   - `pl-infra-pipeline`: remove the `event-service` release, the events queue, feature-env wiring and SSM parameters. Retire the three Vercel projects; redirect `irl.os.pl.xyz` and, once the native All Events page is live, `events.plnetwork.io`.
   - Not reversible. The events service databases are snapshotted before removal.

## Open Questions

- Which team owns the `pl-infra-events` integration key (the key is team-scoped). Needed at cutover, not before.
- Whether `events.plnetwork.io` redirects or keeps serving an embed for PLRS. It belongs to LAB-3247 and only affects the timing of the last redirect.
- Whether a submitter gets a message on approve or reject. Out of scope here; the decision note is stored so a later change can send it.
