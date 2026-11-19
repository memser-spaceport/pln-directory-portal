# Tasks

Groups 1 to 5 are code in this repo and map to the PRs in design.md "Migration Plan" (group 1 = step 1, groups 2 to 4 = step 2, group 5 = step 3 support, group 6 = step 4). Run one backend test with `yarn nx run web-api:test --testFile=<path>` and the build with `yarn build:api`.

## 1. Schema, shared visibility filter and list endpoint

- [ ] 1.1 Run the details backfill on dev (`POST /v1/irl/events/sync` with `detailsOnly: true`) and verify with pln-pg that dev `PLEvent` rows with `externalId` now have `additionalInfo.details`
- [x] 1.2 Add the `PLEventStatus`, `PLEventFormat` and `PLEventAccess` enums and the new `PLEvent` columns and indexes from design D2 to `schema.prisma`, with a migration; verify `prisma migrate dev` applies on a clean local DB and the Prisma client regenerates
- [x] 1.3 In the same migration, fill the new columns from `additionalInfo.details` and set every row to `APPROVED`; verify on a copy of dev data that row counts are unchanged and that `format`, `accessOption`, `tags` and `hostName` match the JSON for 10 sampled events
- [x] 1.4 Add the event body, status, format and access schemas to `libs/contracts` (one shared event body schema, per design D4); verify with a contract unit test for valid and invalid bodies (end before start, in-person with no city)
- [x] 1.5 Make both sync paths (`event-consumer.helper.ts`, `pl-event-sync.service.ts`) also write the new columns through one mapping function; verify with the existing sync specs extended for the columns
- [x] 1.6 Add the shared approved-and-not-deleted `where` fragment in the `pl-events` module and use it in every reader listed in design Context (pl-events, home, digest, search indexer, AI search tool, MCP read tools, recommendations, push notifications, member signals, interest profile); verify with a unit test that lists the `pLEvent` read call sites and fails for one without the fragment
- [x] 1.7 Make the OpenSearch events indexer skip and remove events that are not approved; verify with a unit test that a `REJECTED` event produces a delete and no index call
- [x] 1.8 Add `GET /v1/irl/events` (contract, controller route before `/:uid`, service query with filters and paging per `event-listing`, items with `banner` and up to 3 `faces` in one query, not one per event); verify with a spec covering each filter, the `going` 401, the limit 400, the default "not ended" rule and no `faces` on an invite-only event
- [x] 1.9 Assemble `details`, `timezone`, venue and links for `GET /v1/irl/events/:uid` from the columns plus the JSON remainder in `pl-event-details.mapper.ts`; verify the existing `pl-event-detail.spec.ts` passes and a new case covers the venue fields
- [x] 1.10 Add the new `PLEvent` columns and enums to `docs/DATABASE_SCHEMA.md` and the list endpoint to the API docs; verify the documented list request returns the paging envelope on a local API

## 2. Event write path, submit and own events

- [x] 2.1 Move the gathering resolution (`handleLocationAndAssociation`, location create) and the association and guest sync helpers into the `pl-events` module as one event write service with an "actor" input (design D4, D6); verify with unit tests for: known city reuses its gathering, unknown city creates a gathering and an `AUTO_MAPPED` association, virtual event has no gathering
- [x] 2.2 Derive `type` and generate `slugURL` in the write service; verify with unit tests for the three `type` outcomes and for two events with the same name getting different slugs
- [x] 2.3 Add the status rule (forum.write or directory admin → `APPROVED`, else `PENDING`, body `status` ignored for non-admins); verify with unit tests for the four actors in the design D4 table
- [x] 2.4 Write guest rows for named members when an event becomes approved and remove them when it stops being approved; verify with unit tests for create-approved, pending-then-approved, and approved-then-rejected
- [x] 2.5 Add `POST /v1/irl/events` for a signed-in member (`UserTokenValidation`, 401 with no session), behind `EVENTS_LOCAL_SUBMIT_ENABLED`; verify with a controller spec (201 with status, 401, 400 cases with the problems as text, flag off answers 404) and a route-metadata spec for the guard
- [x] 2.6 Add `GET /v1/irl/events/mine`, `PATCH /v1/irl/events/:uid` and `DELETE /v1/irl/events/:uid` with the owner-or-admin rule; verify with specs for owner, other member (403), admin status change, and delete then 404
- [x] 2.7 Let the submitter and a directory admin read a non-approved event by uid, with `status` in the response and every field the edit form fills (address parts, links, time zone, `allDay`); verify with a spec for submitter, other member (404) and admin
- [x] 2.8 Point the MCP submit tool (`mcp-action-coverage-tools.ts`) at the new write service; verify its spec asserts a local `PLEvent` row with the caller as submitter and no call to the events service
- [x] 2.9 Add `EVENTS_LOCAL_SUBMIT_ENABLED` to `.env.example` and document the submit, mine, edit and delete routes in the API docs; verify the documented example request returns 201 on a local API
- [x] 2.10 Accept `locationUrl` in the shared event body (the `isHttpUrl` check of `PLEventDetailsSchema`) and store it in `additionalInfo.details.locationUrl`; verify with specs for a stored link on submit and on edit, a `javascript:` link (400) and no link (null in the read)

## 2b. Old form parity and form lookups (LAB-3343)

- [x] 2.11 Add `DRAFT` to `PLEventStatus` and the `draft` and `submit` inputs to the write service (design D12); verify with specs for: draft with name, dates and time zone only; draft with no session (401); draft submitted by a forum member (`APPROVED`) and by another member (`PENDING`); draft submitted with no host (400, still a draft); a draft read by a directory admin (404); a draft absent from the list and the curation list
- [x] 2.12 Change the submission checks to the old form's: one tag and `hostName` required, description and address optional; verify with specs for no tag (400), no host (400) and an in-person event with no address (201, no gathering)
- [x] 2.13 Add `hostEmail`, `coHosts`, `websiteUrl`, `contactInfos`, `agenda`, `address.locationInstructions`, `latitude` and `longitude` to the shared body and to the event read; return host and co-host emails only to the submitter and a directory admin; verify with specs for the stored values, the private emails, a co-host with no name (400) and a wrong email (400)
- [x] 2.14 Sanitize `description` with `sanitize-html` on every write (allowed tags and attributes from design D12); verify with a spec for a script tag, an event handler attribute, a `javascript:` link and a heading with a list
- [x] 2.15 Refuse a delete of an approved event by a submitter who is not a directory admin; verify with a spec for 403 and for an admin delete
- [ ] 2.16 Add the venue search and place resolve routes on `LocationTransferService` (design D13), with the time zone lookup; first verify on dev that the Google key has Places, Geocoding and Time Zone enabled; verify with specs with the Google client mocked (suggestions, resolved place, no match 404, time zone failure gives null)
- [x] 2.17 Add `POST /v1/irl/events/agenda/parse` with the AI SDK and the old prompt rules; verify with specs with the model mocked (sessions, "times are missing" message, provider error 503)
- [x] 2.18 Not built: import from Luma is out of scope (scope change of 2026-11-19, LAB-3282 and LAB-3343). No route and no `EVENT_HARVESTER_API_URL`
- [x] 2.19 Require a signed-in member on the form lookups (scope change of 2026-11-19: the form needs sign-in, so there are no signed-out limits); verify with a route-metadata spec

## 3. Curation API

- [x] 3.1 Add `events:read` and `events:write` to `INTEGRATION_KEY_SCOPES` and to the scope list in `docs/INTEGRATION_KEYS.md`; verify a key with the new scopes can be created locally with `POST /v1/admin/integration-keys` and `GET /v1/integrations/me` returns them
- [x] 3.2 Add the curation controller under `/v1/integrations/events` with `IntegrationKeyGuard` and scope decorators; verify with a route-metadata spec that every route has the guard and the right scope
- [x] 3.3 Implement the list (`status`, `updatedSince`, cursor paging, submitter contact, `createdByYourTeam`); verify with a spec that pages to the end without duplicates and filters by status and time
- [x] 3.4 Implement the decision route (any status, idempotent, records time and note, triggers the guest rule from 2.4); verify with specs for approve, reject, reject-an-approved and repeat
- [x] 3.5 Implement the upsert by external id and the batch route on the write service (identity `(sourceTeamUid, externalId)`, restore of a deleted event, per-item results, limit 100); verify with specs for created, updated, restored, two teams with one id, one bad item in a batch, an invalid body (422), 101 items (422), and a date-only event with no description, end date or time zone
- [x] 3.6 Implement patch-any and delete-own; verify with specs for a patch that keeps status and submitter, delete of another source's event (403) and delete of its own
- [x] 3.7 Implement the image upload route on the existing image service; verify with a spec for an accepted image and a rejected file type
- [x] 3.8 Write `docs/EVENTS_CURATION_API.md` with auth, every route, field list and curl examples; verify by running each example against a local API with a test key

## 4. Integration check on a feature env

- [ ] 4.1 Deploy the goal branch to a feature env with `EVENTS_LOCAL_SUBMIT_ENABLED=true` and the matching v2 branch; verify a forum member's submission shows in the events list and drawer at once
- [ ] 4.2 Verify on the env that a pending event (member without forum access) is absent from: events list, upcoming, gathering page, event read by another member, home, digest page, global search, AI search, MCP event tools, and the named host's profile events
- [ ] 4.3 With a test integration key, run the documented curl flow: read pending, approve one, reject one, push one event twice, push a batch; verify the results in the LabOS UI with no delay
- [ ] 4.4 Verify "I'm going" on an approved LabOS-submitted in-person event creates a guest row and shows the member in the drawer

## 5. Cutover support

- [x] 5.1 Add a flag check so the SQS consumer and the pull sync endpoint do nothing when `EVENTS_LOCAL_SUBMIT_ENABLED` is true; verify with a unit test for both paths
- [x] 5.2 Write the cutover checklist and the count queries (events with `externalId` against the events service's approved count; guest and gathering counts before and after) as SQL in `docs/EVENTS_CUTOVER.md`; verify the queries run read-only against dev through pln-pg
- [ ] 5.3 Check on dev whether the events service's event list returns the creator's email; if it does, make the pull sync set `submitterUid` by member email and verify with a spec; if it does not, record that in `docs/EVENTS_CUTOVER.md`
- [ ] 5.4 Rehearse the cutover on dev: backfill, final sync, flag on, submit, decision through the API; record the counts in the Linear ticket and verify they match before and after

## 6. Removal of the events service integration

- [x] 6.1 Write the one-time logo copy script for images hosted in the events service bucket (design D11) with a dry-run mode; verify the dry run on dev lists the rows and changes nothing
- [ ] 6.2 Delete the `events` module (`events.consumer.ts`, helpers, `events-tooling.service.ts`, `POST /v1/events/submit`, its contract and specs), `pl-event-sync.service.ts` and `POST /v1/irl/events/sync`; verify `yarn build:api` passes and no import of the removed files remains
- [ ] 6.3 Remove the `/v1/internals/irl/*` routes and `GET /v1/events/location-associations` that only the submission portal called, and `POST /v1/service/images` with its middleware entry in `app.module.ts`; verify the remaining internals specs pass and a grep finds no caller
- [ ] 6.4 Drop `PLEvent.syncedAt` and the `EVENTS_LOCAL_SUBMIT_ENABLED` flag with a migration; remove `EVENT_SERVICE_URL`, `EVENT_SERVICE_BASE_URL`, `EVENT_SERVICE_INTERNAL_AUTH_TOKEN`, `EVENTS_QUEUE_URL` and `IRL_DOMAIN` uses and `.env.example` entries; verify the API boots locally without them
- [ ] 6.5 Update `AGENTS.md`, `docs/DATABASE_SCHEMA.md` and the Purpose line of `openspec/specs/irl-event-details/spec.md` (it names the events service); verify no doc in `docs/` or `.claude/skills/` still describes the events sync

## Workflow follow-up

- Split LAB-3281 into Tasks that match groups 1, 2, 3, 5 and 6, and create Tasks for the `pl-infra-events` change and the infra decommission (`pl-infra-pipeline`, Vercel, DNS), which have no ticket.
- The v2 work is planned in the OpenSpec change `events-on-labos-stack` in `pln-directory-portal-v2`: list endpoint on the All Events page (LAB-3339), submit form (LAB-3282), My events (LAB-3340), removal of old app links (LAB-3341).
- Prod steps are done by a human with the checklist from 5.2: details backfill, pending queue cleared in the old portal, final sync, flag on, integration key issued, logo copy, then the infra removal after two quiet weeks.
- Close the remaining rollout tasks of `events-portal-labos-sign-in` once the portal is off.
- Archive this change in the PR that lands group 6, so `openspec/specs/` updates with the code.
