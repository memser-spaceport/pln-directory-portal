## Why

The event drawer on the Directory frontend reads `details.locationUrl` (LAB-3324, `services/events/event-drawer.mappers.ts`), but no backend sends it. So the drawer never shows the venue's map link that the PL events app shows (LAB-3332).

## What Changes

- Both event sync paths (the pull sync and the `events` queue consumer) store the events service's `location_url` as `details.locationUrl`. They read `location_url` first and `locationUrl` as a fallback.
- `locationUrl` is kept only when it is an absolute `http` or `https` URL. Any other value (for example `javascript:`) is stored as null and logged.
- `GET /v1/irl/events/:uid` returns `details.locationUrl`: the link, or null when the event has none or was synced before this change.
- `PLEventDetailsSchema` gets an optional, nullable `locationUrl` (http or https URL). Empty details have `locationUrl: null`.
- Other `additionalInfo` keys do not change.

## Capabilities

### Modified Capabilities

- `irl-event-details`: the synced details and the event read include `locationUrl`.

## Impact

- `libs/contracts/src/schema/pl-event-details.ts` (schema, `isHttpUrl`, `emptyPLEventDetails`).
- `apps/web-api/src/pl-events/pl-event-details.mapper.ts` (`mapEventDetails`, `readEventDetails`).
- No migration: the link lives in the existing `PLEvent.additionalInfo` JSON.
- Existing events get the link after the details-only backfill (`POST /v1/irl/events/sync` with `detailsOnly: true`), run after merge on dev and after release on prod.
