## Why

The digest page v2 (LAB-3292, item 13 of LAB-3287) shows "Upcoming events": the next four weeks in the network.

## What Changes

- The page read returns `events` (`items`, `total`): events in the next 28 days from now, soonest first, at most 5, with the event drawer's going count (hidden for invite-only events).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `labos-digest-page`: Upcoming events on the page read.

## Impact

`labos-digest-page.service.ts` (reuses `upcomingEventsFindArgs`, `hidesAttendance`, `listedGuestsWhereIn` from `pl-events`), `LabosDigestPageSchema`. Three small queries per page read.
