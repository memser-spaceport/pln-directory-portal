# Proposal

## Why

Event records live in a separate events service (own MongoDB and Postgres, no source code in our org), and LabOS only keeps a synced copy of the approved ones. Every submission waits for an admin in a separate portal, and La Christa re-enters events from her PL Infra Events app by hand. LAB-3278 asks for one LabOS stack: members submit in LabOS, trusted members publish with no wait, and her app works with LabOS events through an API instead of manual copying.

## What Changes

- **LabOS owns event records.** `PLEvent` in the LabOS Postgres is the only store. It gains an approval status (`DRAFT`, `PENDING`, `APPROVED`, `REJECTED`), a submitter (a member), and a source with the source's own event id.
- **Event fields become columns.** Format, access, tags, time zone, venue address and coordinates, host and links move out of the `additionalInfo.details` JSON. The agenda stays JSON.
- **Submit in LabOS.** `POST /v1/irl/events` accepts a submission from a signed-in member; a request with no session answers 401, because the submitter must be able to edit the event later. A member with `forum.write` gets `APPROVED` at once. Every other submission is `PENDING`. The answer says which.
- **Same form rules as the old portal.** The submit body takes what the old submission form sent: host with email, co-hosts, registration and website links, social handles, agenda, venue address with instructions and position, rich-text description (stored as safe HTML), and a draft state ("Save as draft"). The required fields are the old ones: name, dates, time zone, at least one tag and a host name.
- **Form lookups.** Small routes for the submit form, for signed-in members: venue suggestions, place details with time zone, and agenda text to sessions. They keep the Google key and the model key on the server.
- **Own events.** A member edits or deletes an event they submitted. A directory admin edits, hides or deletes any event.
- **Host links on submit.** A submission can name members and teams as host, co-host, speaker or sponsor; they are stored as `PLEventAssociation` rows, as today.
- **Only approved events are visible.** Every read (lists, the event read, home, digest, search, AI search, MCP, profile events) leaves out `PENDING` and `REJECTED` events. The submitter still sees their own.
- **Event list endpoint.** `GET /v1/irl/events` returns approved events with search, filters (city, mode, access, tag, host, date range, going) and paging, for the All Events page (LAB-3317 phase 2).
- **Curation API for partner apps.** A new set of routes under `/v1/integrations/events`, behind a team-scoped integration key with new `events:read` and `events:write` scopes. It is built so a curator app needs no manual copying:
  - list events with filters, status and `updatedSince`;
  - list pending submissions;
  - approve or reject any event in one call, with an optional note (rejecting an approved event hides it);
  - create or update an event by the caller's own id (idempotent upsert, single or batch), published as `APPROVED`;
  - correct the fields of any event;
  - delete an event the key's team created;
  - upload an event image.
  The PL Infra Events app (`pl-infra-events`) is the first caller. A decision or a new event shows in LabOS at once, with no sync interval.
- **Data move.** One final full sync brings every approved event and its details into LabOS. Submissions still waiting in the events service are approved or rejected in the old portal before the freeze, so nothing pending is left behind. Attendance ("I'm going") already lives only in LabOS and does not move.
- **BREAKING: the events service integration is removed.** The SQS consumer, the pull sync (`POST /v1/irl/events/sync`), the submit and delete proxy (`POST /v1/events/submit`), `POST /v1/service/images`, and the env vars `EVENT_SERVICE_URL`, `EVENT_SERVICE_BASE_URL`, `EVENT_SERVICE_INTERNAL_AUTH_TOKEN`, `EVENTS_QUEUE_URL` go away.
- **BREAKING: the old apps are switched off.** The events service, the submission portal (`pl-events-submission`; prod irl.os.pl.xyz, dev submitv2.events.dev.os.pl.xyz), `pl-events-mgmt-v2` and `pl-events-tooling` are retired. `events.plnetwork.io` redirects to the LabOS All Events page once that page is native.

### Not in this change

- Hosted schedule sites, tenants ("clients") and per-tenant email whitelists from the events service. They are dropped.
- Luma import, in the submit form and through the Event Harvester. It is a later option. A curator app that scrapes sends its results through the curation API.
- Submissions from people with no LabOS account. The curator helps them by hand.
- An events admin UI in LabOS or back-office. Approval happens in the curator app; a directory admin can still act through the admin routes.
- A new gathering (location) admin. Locations are still resolved from the event address; the existing admin routes stay.
- A message to the submitter on approve or reject.

## Capabilities

### New Capabilities

- `event-submission`: submitting an event in LabOS, the approval status and who is auto-approved, what a submitter can do with their own event, and the rule that only approved events are visible.
- `event-listing`: the list of approved events with search, filters and paging.
- `event-form-helpers`: the lookups the submit form uses while it is filled in (venues, place time zone, agenda parsing).
- `event-curation-api`: the integration-key routes a partner app uses to read events, decide on pending submissions, and create, update, hide or delete its own events.

### Modified Capabilities

- `irl-event-details`: event details come from the LabOS event record, not from an events-service sync. The requirements "Event sync keeps the event details" and "Existing events can be backfilled with details" are removed. The event read answers "not found" for an event that is not approved, except for its submitter and directory admins.
- `images`: the requirement "Events-service image upload requires the service key" is removed.

## Impact

- **pln-directory-portal (web-api):** `prisma/schema.prisma` (`PLEvent` columns, status, submitter, source; migration that fills them from `additionalInfo.details` and marks current rows `APPROVED`); `events/` and `pl-events/` modules (new submit, own-event, list and curation routes; removal of `events.consumer.ts`, `event-consumer.helper.ts`, `event-guests-sync.helper.ts`, `pl-event-sync.service.ts`, `events-tooling.service.ts`); `libs/contracts` (`contract-events.ts`, `contract-pl-events.ts`, `schema/integration-key.ts` scopes); every `PLEvent` reader gets the approved filter (home, digest, search index, AI search tool, MCP read and submit tools, profile events, push notifications, recommendations, member signals); `internals/pl-events.controller.ts` routes that only the submission portal calls are removed.
- **pln-directory-portal-v2:** the submit form (LAB-3282), "my events" edit, and removal of links to the old portal (`getSubmitEventUrl`, `IRL_SUBMIT_FORM_URL`, `PL_EVENTS_SUBMISSION_URL`). Tracked in that repo's own change.
- **pl-infra-events (AI App, owner La Christa Eccles):** calls the curation API with an integration key stored as a runtime secret. Needs an API description she can hand to her build agent.
- **pl-infra-pipeline:** removal of the `event-service` release, the events queue, the feature-env wiring for the events service, and its SSM parameters, after cutover.
- **Vercel and DNS:** `pl-events-submission`, `pl-events-mgmt-v2`, `pl-events-tooling` projects retired; `irl.os.pl.xyz` and `events.plnetwork.io` redirect to LabOS.
- **Data:** about 700 events, 2,500 guest rows and 41 gatherings on prod. No prod event carries synced details yet, so the details backfill runs before the columns are filled. 268 event logos are stored in the events service's S3 bucket, which must stay readable or be copied.
- **In-flight change `events-portal-labos-sign-in`:** its portal sign-in bridge has no use once the portal is off; its remaining rollout tasks can be closed.
- **Linear:** LAB-3281 covers the web-api work and should be split (model and submit, curation API, cutover, decommission). The `pl-infra-events` change and the decommission have no ticket yet.
