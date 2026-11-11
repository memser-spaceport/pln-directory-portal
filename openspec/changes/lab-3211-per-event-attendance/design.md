# Design

## Context

See proposal.md for why. The current state that shapes the approach (`develop` at bee7c60a):

- **`PLEventGuest`** is one row per member per event (`eventUid`), or per gathering (`eventUid` null).
  - It has no visibility field.
  - There is no unique constraint. Duplicates are blocked in `assertNoDuplicateGuestForEvents` / `assertNoDuplicateGuestForLocationAndRange`.
- **Guest create** (`createPLEventGuestByLocation`) with `events: [{uid}]` already adds rows without touching others. `formatInputToEventGuests` copies `teamUid` as given, and `''` breaks the `Team` foreign key (P2003 → 400).
- **Guest delete** (`deletePLEventGuests`) treats a missing or empty `events` as "delete everything at this location". The contract schema (`DeletePLEventGuestsSchema`) says `{ memberUid, eventUid }`. The `@abitia/zod-dto` DTOs are not checked by `nestjs-zod`, so any body reaches the service. A contract-shaped body therefore deletes everything. The FE admin attendee popup sends `events: []` on purpose.
- **Attendees list** (`getPLEventGuestsByLocationAndType` → `fetchAttendees`) always passes `includeLocationOnlyGuests: true`. `fetchAttendees` already supports `false`.
- **`getPLEventForViewer(uid)`** returns every guest with contact fields. The MCP directory tool uses it, and it is too heavy for a drawer.
- **Two sync paths:**
  - `PLEventSyncService` (HTTP pull from `EVENT_SERVICE_URL`, internal `POST /v1/irl/events/sync`) writes `slugURL = <first 4 letters>-<event_id>` and no `type`.
  - `EventConsumerHelper` (queue) writes `slugURL = event_id` and `type`.
  - Neither writes `PLEvent.additionalInfo`; nothing else in `pl-events` writes it either.
  - The HTTP path only updates when the source `updatedAt` is newer than `syncedAt`.
- **Member detail** (`members.service.findOne`) returns `eventGuests` with no viewer awareness. The controller has `OptionalUserTokenCheckGuard`, so `request['userEmail']` is set for signed-in viewers.
- **Team detail** returns only the team's host/sponsor guest rows plus `eventAssociations`.
- **Demo Day** is not a `PLEvent`. A team links to it through `DemoDayParticipant.teamUid` (type `FOUNDER`).
- **Upcoming events:** `/v1/irl/events/upcoming` treats an event as upcoming when `startDate > now`.

## Goals / Non-Goals

**Goals:**
- Give the FE everything LAB-3216..LAB-3220 need in one release, behind no BE flag. Every change is additive or a bug fix, except the stricter delete body.
- Keep the old FE (flag off) working unchanged on the new API.

**Non-Goals:**
- Changing PUT guest semantics (it still replaces the set). The new FE never calls it.
- A DB unique constraint on `(memberUid, eventUid)`. The code-level 409 stays.
- Merging the two sync paths, or fixing their `slugURL` disagreement.
- Paging the attendee faces beyond three, and any new search over events.

## Decisions

### D1. `showOnProfile` is a column on `PLEventGuest`

`BOOLEAN NOT NULL DEFAULT true`, in one migration (`<timestamp>_pl_event_guest_show_on_profile`).
- Visibility is per event row, and every read filters on it in SQL. A member-preferences JSON entry would need a join on a blob and could clobber other preferences.
- Existing rows default to shown, which matches today's behaviour.

### D2. The toggle is `PATCH /v1/irl/events/:uid/me`, guarded by `UserTokenValidation` only

It updates the caller's own row for that event (`updateMany where { memberUid, eventUid }`). It returns 404 when the update count is 0.
- RBAC is not required because hiding only narrows visibility. A member who lost `irlg.going.write` must still be able to hide what they once shared.
- Alternatives:
  - PUT on the guest replaces the whole set and is the wrong tool.
  - A field on the delete body would mix two meanings.

### D3. The strict attendee list is a new `eventUid` query parameter

With `eventUid`, the list service sets `events = [that event]` and `includeLocationOnlyGuests = false`. This happens after the existing invite-only/viewer filtering, so a signed-out viewer of an `INVITE_ONLY` event gets an empty list. An `eventUid` that is not in the gathering gives an empty list, not an error.
- `filteredEvents` keeps its current meaning, so `/events/irl` is unchanged.
- The explicit `includeLocationOnlyGuests` key wins over the spread `...query`, so a string from the query string can't flip it.

### D4. Delete body validation in the controller with `safeParse`

The contract schema becomes `{ membersAndEvents: z.array(z.object({ memberUid: z.string().min(1), events: z.array(z.string()) })).min(1) }`. `@Api` and the zod DTOs do not validate here, so the controller runs `safeParse` and throws `BadRequestException` on failure, before any delete.
- An explicit `events: []` keeps the full-delete meaning, because the admin popup depends on it.
- A missing `events` is now a 400 instead of a silent full delete.

### D5. `teamUid` normalization

`formatInputToEventGuests` and `updateGuestTopicsAndReason` write `teamUid: input.teamUid || null`. The controller's team-membership check already skips empty values. `CreatePLEventGuestSchema.teamUid` becomes `z.string().optional()` (empty allowed), so the FE can omit it.

### D6. `GET /v1/irl/events/:uid` is a new, lean read, not `getPLEventForViewer`

A new `PLEventsService.getPLEventDetail(uid, viewer)` does:
- one `findFirst` (event, logo, banner, location: `uid`, `location`, `flag`, `timezone`, `resources`)
- one host query (`isHost` rows → member uid, name, image)
- one aggregate for `goingCount` (count distinct `memberUid` with `eventUid = uid`)
- one query for three faces (newest rows first)
- one `exists` check for `viewerGoing`

`getPLEventForViewer` stays as it is for MCP.
- The route goes into `PLEventsController` after the static `/irl/events/upcoming` and `/irl/events/contributors` handlers. Express then matches the static paths first. A controller test asserts both static paths still reach their handlers.
- `@UseGuards(OptionalUserTokenCheckGuard)` and `@NoCache()` apply.

### D7. Event details live in `PLEvent.additionalInfo.details`, normalized by one mapper

The `details` shape:
- `tags: { name; color }[]` (the events service sends tags as plain strings and has no colours; the PL events app derives them on the client, so `color` is `null` unless a source sends one)
- `accessType`, `accessOption`, `format`: `string | null`
- `host: { name; logo } | null`
- `coHosts: { name; logo }[]`
- `sponsors: { name; logo }[]`
- `agenda: { sessions: unknown[] } & Record<string, unknown> | null`

How it is built and stored:
- A pure `mapEventDetails(raw)` builds it from the events-service payload, with a tolerant Zod schema per field (`PLEventDetailsSchema` in `libs/contracts`). A field that fails to parse becomes empty and is logged with the external id.
- Both sync paths call the mapper and merge: `additionalInfo: { ...existing, details }`.
- No migration is needed: the column already exists and is unused by events today. A namespaced key leaves room for other uses.
- Alternatives:
  - Dedicated columns would mean a migration per field and churn while the panel design settles.
  - The FE calling the events service directly is not possible: no public by-id API; the list API needs a token.

### D8. Backfill is `detailsOnly` on the internal sync endpoint

With `{ detailsOnly: true }`, `PLEventSyncService` fetches APPROVED events (the existing fetch). It then updates `additionalInfo` (details merge) for each existing `PLEvent` matched by `externalId`, and returns `{ updated }`.
- It never creates, deletes or touches `slugURL`, `type`, dates or name.
- The normal HTTP sync would rewrite `slugURL` to `<4 letters>-<id>` on queue-created events and skips unchanged events. That makes it the wrong tool for a backfill.

### D9. Upcoming events gain `locationUid`

Add `locationUid: true` to the select, map it in `toUpcomingEvent`, and add `locationUid: z.string().nullable()` to `ResponseUpcomingEventSchema`.

### D10. Member and team events: a `ProfileEventsService` + `ProfileEventsController` in the `pl-events` module

- Paths are `/v1/members/:uid/events` and `/v1/teams/:uid/events` (rule 17: paths follow the resource). They are declared in `contract-pl-events.ts`.
- The code lives with the guest logic. The `pl-events` module already depends on `MembersService` and `TeamsService`, while `members` / `teams` importing `pl-events` would create a cycle.
- Both routes use `OptionalUserTokenCheckGuard` and `@NoCache()`.
- **Viewer:** `request['userEmail']` → `findMemberByEmail`. Signed-in means a viewer member was found. The owner is the viewer whose `uid` equals `:uid`.
- **Upcoming vs past:** an event is upcoming while `endDate > now`, so an event in progress is still "going". This differs from `/events/upcoming` (`startDate > now`) on purpose, and is noted in the spec.
- **Member groups:** two Prisma queries on `PLEventGuest` (`memberUid`, `eventUid not null`, event not deleted, upcoming/past window, `showOnProfile: true` unless owner), each with `count` + `skip/take`.
  - Counts and faces for the page's events come from one `groupBy` and one raw query (`ROW_NUMBER() OVER (PARTITION BY "eventUid")` ≤ 3).
  - `viewerGoing` comes from one `findMany` of the viewer's rows for those events.
- **City:** `location.split(',')[0].trim() || null`.
- **Team upcoming:**
  - Rows of current members: `TeamMemberRole` for the team with `endDate` null or future, joined to `PLEventGuest` with `showOnProfile: true`, upcoming, not deleted.
  - Rows are grouped by event in memory, then paged. A team's members' upcoming events are a small set; see Risks.
  - Roles come from member rows with `teamUid = team` (`isHost` / `isSpeaker` / `isSponsor`) and from `PLEventAssociation` (`entityType TEAM`, `HOST` / `CO_HOST` → Host, `SPEAKER` → Speaker, `SPONSOR` → Sponsor).
- **Team past:**
  - Guest rows with `teamUid = team` and a role, plus TEAM associations, past only, deduped by event.
  - Demo Days: `DemoDay` where `isDeleted false`, `endDate < now`, and `participants some { type FOUNDER, status ENABLED, teamUid, isDeleted false }`, newest first, prepended.
  - The list is built in memory, then paged. `past.total` includes Demo Days.
- **Team visibility:** the same L0 + signed-out check as `GET /v1/teams/:uid` (team-public-visibility), via the existing teams service helper.
- **Response:** `{ upcoming?: Group, past?: Group }`, with `Group = { page, limit, total, items }` (rule 18). Items carry `kind` (`event` | `demo-day`) so the FE can render the Demo Day tile.

### D11. Member detail filters hidden rows in the controller

`findOne` adds `showOnProfile` to the `eventGuests` select. `MembersController.findOne` drops rows with `showOnProfile === false` unless the viewer is that member. The response shape only gains a field. The old IRL contributions block (flag off) then respects "hide" too.

### D12. Plans are updated in place with `PATCH /v1/irl/locations/:uid/guests/me`

The drawer's plans step (FE D4) saves a diff: create for added events, per-event delete for removed ones. Events the member keeps can still change: their roles (host/speaker/sponsor and sub-events), and the details shared across the gathering (check-in/out dates in `additionalInfo`, topics, reason, Telegram, office hours, team). This route updates them without deleting rows.
- Guard: `UserTokenValidation` + `irlg.going.write` or directory admin, same as create. It only touches the caller's own rows.
- Body (all optional, validated with `safeParse`): `{ teamUid?, topics?, reason?, telegramId?, officeHours?, additionalInfo?: { checkInDate?, checkOutDate? }, events?: [{ uid, isHost?, isSpeaker?, isSponsor?, hostSubEvents?, speakerSubEvents?, sponsorSubEvents? }] }`.
- Shared fields are written to every row the caller has at that location (event rows and a gathering-level row, if any). Each `events[]` entry updates the roles on the caller's existing row for that event. An entry for an event the caller has no row for is a 400; the route never creates or deletes rows.
- `showOnProfile` and `createdAt` are untouched. Returns the caller's rows at the location. 404 when the caller has no rows there.
- Alternatives: PUT replaces the set and resets `showOnProfile`; delete + recreate loses `createdAt` and races with the attendee list.

## Risks / Trade-offs

- [In-memory grouping for team upcoming/past grows with team size] → Teams have tens of members and a handful of events. Log the row count, and move to SQL `GROUP BY` if any team exceeds ~500 rows.
- [The events-service payload shape for `agenda` / `co_hosts` is not documented, and was read from pln-events code] → The tolerant per-field schema plus logging. Task 2.1 first captures a real payload from dev's `EVENT_SERVICE_URL` and fixes the mapper to it.
- [`EVENT_SERVICE_URL` may not return the same fields as pln-events' `WEB_API_BASE_URL`] → Verified in task 2.1 before building the mapper. If fields are missing, stop and report; LAB-3214 then becomes a pln-events question.
- [The stricter delete body could break an unknown caller that relied on omitting `events`] → The only FE callers send `events`. Grep the back-office and the FE before merging (task 1.6).
- [Faces and counts include members who hid the event from their profile] → Intended: hiding is about the profile, not about going. It is covered in the spec.
- [Route `/v1/irl/events/:uid` could shadow static paths] → Declaration order plus a controller test (D6).

## Migration Plan

1. Merge LAB-3213/3214/3215 PRs into `lab-3211`. The migration runs on deploy (`prisma migrate deploy` in the image).
2. Deploy the feature env (`lab-3211`) and call the internal sync with `{ "detailsOnly": true }` there to check the backfill.
3. After `lab-3211` → `develop` → `main`, run the details-only sync once on dev and once on prod.
4. Rollback: the column is additive and defaults to true. Reverting the code leaves it unused. Details in `additionalInfo` are inert for old code.
