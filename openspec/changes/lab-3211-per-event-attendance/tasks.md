# Tasks

Each section is one subtask PR into `lab-3211`. Its branch is `lab-3211-<sub#>`, cut from `origin/lab-3211`. Tick only your own section.

**Type-check gate for every section:** `NX_DAEMON=false npx -y -p typescript@5.6.3 tsc --noEmit -p apps/web-api/tsconfig.build.json`. Its baseline is 7 `Buffer` errors; any other error is real. `yarn typecheck:api` is vacuous in this repo.

**Tests:** run with `yarn nx run web-api:test --testFile=<spec>`.

## 1. LAB-3213: per-event attendance API

- [x] 1.1 Add `showOnProfile Boolean @default(true)` to `PLEventGuest`. Create the migration `<timestamp>_pl_event_guest_show_on_profile` (`ALTER TABLE "PLEventGuest" ADD COLUMN "showOnProfile" BOOLEAN NOT NULL DEFAULT true`) and run `prisma generate`. Verify that `prisma migrate deploy` applies it on a local DB and that existing rows read `true`.
- [x] 1.2 Contracts:
  - Add optional `showOnProfile` to `CreatePLEventGuestSchema` and make `teamUid` optional.
  - Replace `DeletePLEventGuestsSchema` with `{ membersAndEvents: [{ memberUid, events: string[] }] }` (min 1 entry).
  - Add `eventUid` to the guests query schema.
  - Add the `PATCH /v1/irl/events/:uid/me` route (body `{ showOnProfile: boolean }`).
  - Add the `PATCH /v1/irl/locations/:uid/guests/me` route (D12 body).

  Verify that the contracts lib compiles under the type-check gate.
- [x] 1.3 Guest create:
  - `formatInputToEventGuests` sets `showOnProfile` (default true) and `teamUid || null`.
  - `updateGuestTopicsAndReason` and the modify path also use `teamUid || null`.

  Verify with a jest test: an `events: [{uid: B}]` create leaves the existing row for A, `teamUid: ''` produces `null`, and `showOnProfile: false` is stored.
- [x] 1.4 Toggle: a service method plus a controller handler for `PATCH /v1/irl/events/:uid/me` (`UserTokenValidation`; `updateMany` on the caller's own row; 404 when count is 0; 400 via `safeParse`). It resets the `PLEventGuest` cache. Verify with jest: the owner hides, a non-guest gets 404, and an invalid body gets 400.
- [x] 1.4a Plans update (D12): a service method plus a controller handler for `PATCH /v1/irl/locations/:uid/guests/me` (`UserTokenValidation` + `irlg.going.write` or directory admin; `safeParse`; shared fields on all the caller's rows at the location in one transaction; roles per `events[]` entry; 400 for an event the caller has no row for; 404 when the caller has no rows). It resets the `PLEventGuest` cache. Verify with jest: roles change on A only, shared fields reach A and B, `showOnProfile` stays false on a hidden row, an unknown event gets 400 and creates nothing.
- [x] 1.5 Strict attendee list: with `eventUid`, `getPLEventGuestsByLocationAndType` narrows events to that event (after viewer filtering) and passes `includeLocationOnlyGuests: false` after the `...query` spread. Verify with jest: a gathering-level guest is left out, a hidden-from-profile guest is kept, and a signed-out viewer of an `INVITE_ONLY` event gets an empty list. Without `eventUid` the existing calls are unchanged.
- [x] 1.6 Delete body: the controller runs `safeParse` on the new schema and throws `BadRequestException` before any delete. Verify with jest that a `{ memberUid, eventUid }` entry gets 400 and deletes nothing, `events: [A]` deletes only A, and `events: []` still deletes all of that member's rows at the location. Grep the back-office (`apps/back-office`) and the FE repo for other callers of `/events/guests`, and record them in the PR.
- [x] 1.7 `GET /v1/irl/events/:uid` (D6):
  - Add `getPLEventDetail(uid, viewer)` with event, gathering, `details` (empty until LAB-3214), hosts, `goingCount`, three `faces` and `viewerGoing`.
  - Signed-out viewers of `INVITE_ONLY` events get count 0 and no faces, and private resources are filtered.
  - Declare the handler after the static `/irl/events/*` handlers, with `OptionalUserTokenCheckGuard` + `@NoCache()`.

  Verify with jest: a deleted event gets 404, `viewerGoing` is true for a going viewer, and a controller test proves `/v1/irl/events/upcoming` and `/v1/irl/events/contributors` still reach their handlers.
- [x] 1.8 Upcoming events: add `locationUid` to the select, to `toUpcomingEvent` and to `ResponseUpcomingEventSchema`. Verify that `upcoming-events.spec.ts` is extended to assert `locationUid` and still passes.
- [x] 1.9 Run the type-check gate, ESLint on the touched files (`npx eslint <files>`), and the touched jest specs. Verify that there are no new type errors, no new lint errors versus `develop`, and that the specs are green.

## 2. LAB-3214: keep event details from the sync

- [ ] 2.1 Capture one real events-service payload. Call dev's `EVENT_SERVICE_URL/events?status=APPROVED&event_id=<id>` for an event with tags and an agenda, and save a trimmed copy as a jest fixture (no personal data). Verify that the fixture has `tags`, `access_type`, `access_option`, `host`, `co_hosts`, `sponsors` and `agenda`. If any are missing, stop and report on LAB-3214 before going on.
- [ ] 2.2 Add `PLEventDetailsSchema` (tolerant per field) to `libs/contracts`, and a pure `mapEventDetails(raw)` in `pl-events`. Verify with jest against the fixture: a malformed `agenda` gives `null` plus a log line, and missing fields give empty values.
- [ ] 2.3 Both sync paths store `additionalInfo: { ...existing, details }`: `PLEventSyncService.mapEventData` for create/update, and `EventConsumerHelper.mapEventData` with its create/update calls. Verify with jest that both paths write `details` and keep any other `additionalInfo` key.
- [ ] 2.4 Add `detailsOnly` to the internal `POST /v1/irl/events/sync`. It fetches events, updates only `additionalInfo.details` for existing events matched by `externalId`, and returns `{ updated }`. Verify with jest that `slugURL`, `name`, dates and `type` are unchanged and no event is created or deleted.
- [ ] 2.5 `GET /v1/irl/events/:uid` returns `details` from `additionalInfo.details`, with empty defaults for events never resynced. Verify with jest that both cases match the spec.
- [ ] 2.6 Run the type-check gate, ESLint on the touched files and the touched specs. Verify that all are green against the baseline.

## 3. LAB-3215: member and team events

- [ ] 3.1 Contracts: the `GET /v1/members/:uid/events` and `GET /v1/teams/:uid/events` routes in `contract-pl-events.ts`. The query takes `group?`, `page?`, `limit?` (default 4, max 50). The response is `{ upcoming?, past? }`, each `{ page, limit, total, items }`, with item schemas (`kind`, event fields, `locationUid`, `location`, `city`, `roles`, `showOnProfile`, `goingCount`, `faces`, `viewerGoing`; team items add `memberCount` and `members`; Demo Day items have `title`, `slug` and dates). Verify that the contracts compile.
- [ ] 3.2 `ProfileEventsService.getMemberEvents(uid, viewer, query)`:
  - Upcoming means `endDate > now`, signed-in viewers only.
  - Hidden rows are shown only to the owner.
  - Counts and faces are batched for the page's events.
  - `city` is the gathering name up to the first comma.
  - It returns 404 for an unknown member.

  Verify with jest: the signed-out, other-member, owner, 9-past-events paging and `group=past` scenarios from the spec.
- [ ] 3.3 `ProfileEventsService.getTeamEvents(uid, viewer, query)`:
  - Upcoming comes from current members' visible rows, grouped by event, with `memberCount`, `members` and team roles.
  - Past comes from team guest rows with a role plus TEAM associations (`ATTENDEE` gives no role), deduped.
  - The team's Demo Days (ended, non-deleted, an ENABLED non-deleted FOUNDER participant for the team) come first.
  - The L0 + signed-out check is the same as `GET /v1/teams/:uid`.

  Verify with jest: the teammates-grouped, hidden-row, former-member, Demo Day first, disabled-founder and L0 scenarios.
- [ ] 3.4 `ProfileEventsController` in the `pl-events` module with both routes (`OptionalUserTokenCheckGuard`, `@NoCache()`, query parsed with `safeParse`). Register it in `pl-events.module.ts`. Verify that `yarn nx build web-api` passes and both routes answer locally with a seeded member and team.
- [ ] 3.5 Member detail: add `showOnProfile` to the `eventGuests` select in `members.service.findOne`. `MembersController.findOne` drops hidden rows unless the viewer is the member. Verify with jest that another viewer does not get the hidden row and the owner does.
- [ ] 3.6 Run the type-check gate, ESLint on the touched files and the touched specs. Verify that all are green against the baseline.

## 4. Goal integration (on `lab-3211`, after 1–3 merge)

- [ ] 4.1 Deploy the `lab-3211` feature env, call the internal sync with `{ "detailsOnly": true }`, and read one synced event with `GET /v1/irl/events/:uid`. Verify that `details.tags` / `details.agenda` are filled for an event that has them in PL Events.
- [ ] 4.2 Run `openspec validate lab-3211-per-event-attendance --strict --json`. Verify that it reports valid with no issues.

## Workflow follow-up

- Archive the change (`/opsx:archive`) in the last BE subtask PR, so `openspec/specs/` changes with the code.
- After the release to `main`, run the details-only sync once on dev and once on prod.
