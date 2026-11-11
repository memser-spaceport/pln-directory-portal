# Proposal

## Why

LAB-3211 lets a member say "I'm going" to one IRL event and see who else is going. Their events then show on their profile and their team's profile, and Home's Upcoming events rail opens the same event drawer. LAB-3117 hid IRL Gatherings from non-admins, so members need this new place to say they are going.

The API cannot serve that today:

- Guests can be saved per event, but there is no "show on my profile" flag.
- The attendee list for one event also returns everyone going to the gathering as a whole.
- The delete contract disagrees with the service, and a body that follows the contract deletes all of the member's rows at the location.
- A member with no team cannot save attendance.
- There is no event-by-uid read for the drawer, no member or team events list, and no Demo Day for teams.
- The events sync drops the panel's tags, access, hosts and agenda.

Backend subtasks: LAB-3213 (attendance API), LAB-3214 (sync details), LAB-3215 (member and team events). The frontend work is LAB-3216..LAB-3220.

## What Changes

- **LAB-3213, attendance:**
  - Add `PLEventGuest.showOnProfile` (default true). It is set on create and toggled by the guest themselves.
  - Add a strict per-event filter to the location guests list (that event's guests only, no gathering-level guests).
  - Fix the delete contract to `{ membersAndEvents: [{ memberUid, events: string[] }] }`. A body without `events` is rejected with 400 instead of deleting everything.
  - Save an empty `teamUid` as `null`.
- **LAB-3213, reads:**
  - Add `GET /v1/irl/events/:uid` for the event drawer: event, gathering, synced details, hosts, going count, three faces and whether the viewer is going.
  - Add `locationUid` to every `/v1/irl/events/upcoming` row (additive).
- **LAB-3214, sync:**
  - Both sync paths keep the events service's `tags`, `access_type`, `access_option`, `format`, host, co-hosts, sponsors and agenda (with sessions) in `PLEvent.additionalInfo.details`.
  - An internal, details-only resync backfills existing events.
- **LAB-3215, profile events:**
  - Add `GET /v1/members/:uid/events`: upcoming and past events, with visibility rules (upcoming only for signed-in viewers, hidden rows only for the owner).
  - Add `GET /v1/teams/:uid/events`: upcoming = the team's current members' visible attendance; past = the team's host/sponsor events and event associations, with the team's Demo Day first.
  - `GET /v1/members/:uid` stops returning a member's hidden guest rows to anyone but that member.
- RBAC stays as it is. Attendance writes still need `irlg.going.write` or directory admin.

Out of scope:

- The frontend: the drawer, profile sections and Home rail (LAB-3216..LAB-3220).
- Giving `irlg.going.write` to more members.
- Changes to PUT `/v1/irl/locations/:uid/guests/:guestUid`, the notification-driven gathering modal flow and `/events/irl`.
- A database unique constraint on guest rows.
- Writing event details back to the events service.

## Capabilities

### New Capabilities

- `irl-event-attendance`: how a member marks and unmarks attendance for one IRL event, the "show on my profile" flag, and the per-event attendee list.
- `irl-event-details`: reading one IRL event for display (details synced from the events service, gathering, hosts, attendance summary), and the gathering uid on upcoming events.
- `profile-events`: the events listed on a member profile and a team profile, with their visibility rules and the team's Demo Day.

### Modified Capabilities

None. No existing spec covers IRL events, guests or profile events.

## Impact

- **Database:** one additive migration (`PLEventGuest.showOnProfile BOOLEAN NOT NULL DEFAULT true`). No backfill is needed; existing rows read as shown.
- **API:**
  - New: `GET /v1/irl/events/:uid`, `PATCH /v1/irl/events/:uid/me`, `GET /v1/members/:uid/events`, `GET /v1/teams/:uid/events`.
  - Additive: `eventUid` query on `GET /v1/irl/locations/:uid/guests`, `showOnProfile` on guest create, `locationUid` on upcoming events.
  - Stricter: the delete guests body.
  - Filtered: `eventGuests` on `GET /v1/members/:uid`.
- **Code:**
  - `apps/web-api/src/pl-events/*` (controller, events and guests services, sync service, new profile-events service and controller)
  - `apps/web-api/src/events/event-consumer.helper.ts`
  - `apps/web-api/src/members/members.controller.ts`
  - `libs/contracts/src/lib/contract-pl-events.ts`
  - `libs/contracts/src/schema/pl-event*.ts`
- **Callers:**
  - The FE admin attendee popup already sends `events: []` for a full delete; it keeps working.
  - Home's rail and the member page widget get one extra field.
  - The MCP directory tool keeps using `getPLEventForViewer` unchanged.
- **Ops:** after deploy, run the details resync once per environment (dev, then prod) through the internal sync endpoint.
