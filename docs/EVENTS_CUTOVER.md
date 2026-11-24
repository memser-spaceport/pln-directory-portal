# Events cutover runbook: LabOS becomes the owner of events

Before the cutover the events service owns event records and LabOS keeps a synced copy of the approved ones.
After it LabOS owns them: members submit in LabOS, and partner apps use the curation API
([EVENTS_CURATION_API.md](./EVENTS_CURATION_API.md)). This page is the one runbook for the switch: every step, its
order, and the queries that prove no event, guest row or gathering was lost. How events work after the switch is in
[EVENTS.md](./EVENTS.md).

## The switches

| Where    | Setting                                                               | Off (default)                                                                                                                                         | On                                                                                                                     |
| -------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| API      | `EVENTS_LOCAL_SUBMIT_ENABLED`                                         | Submissions go to the events service. Submit, my events, edit, delete and the form lookups answer 404. The queue and the pull sync write to `PLEvent` | Submissions are stored in LabOS. A queue message is dropped and `POST /v1/irl/events/sync` answers `{ skipped: true }` |
| Frontend | `NEXT_PUBLIC_SHOW_EVENT_DRAWER` and `NEXT_PUBLIC_SHOW_EVENTS_PAGE_V2` | `/events/all` shows the events app in an iframe                                                                                                       | `/events/all` is the native page, which reads `GET /v1/irl/events`                                                     |
| Frontend | `NEXT_PUBLIC_EVENTS_LOCAL_SUBMIT`                                     | "Submit an event" opens the old submission portal                                                                                                     | `/events/submit`, `/events/edit/<uid>` and `/events/mine` are on, and "Submit an event" opens the LabOS form           |

The frontend settings are read at build time, so a change needs a new frontend build. Turn on the frontend submit
setting only where the API setting is on.

The curation API (`/v1/integrations/events`) has no switch. It needs an integration key with the scope `events:read`
or `events:write`, and no such key exists until step 8 of phase 4.

## Order of the rollout

| Phase | What                                   | When                                                              | Visible change                       |
| ----- | -------------------------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| 1     | Release the code with every switch off | The goal branches merge into `develop`, later `develop` to `main` | None                                 |
| 2     | Prepare the data and the settings      | After phase 1 on that environment, any day before phase 4         | None                                 |
| 3     | Checks before the switch               | The day before phase 4                                            | None                                 |
| 4     | The switch                             | Dev first. Prod only when every Task of the Goal is done on dev   | Members submit events in LabOS       |
| 5     | Watch, and roll back if needed         | Two weeks after phase 4                                           |                                      |
| 6     | Remove the events service              | After two quiet weeks on prod                                     | The old portal and events site close |

Run every phase on dev before prod. Run the SQL read-only (the `pln-pg` skill for dev and prod).

## Phase 1: release with every switch off

1. Merge the backend goal PR, then the frontend goal PR.
2. The API applies the migrations `pl_event_status_and_typed_fields` and `pl_event_private_details` when it starts.
   They add columns and indexes and fill the new columns from stored event details. Every event is `APPROVED`.
3. Check with query 2 that the number of events did not change, and with query 6 that every event is `APPROVED`.

After this phase the events service still owns events. The queue and the pull sync also write the new columns.

## Phase 2: prepare the data and the settings

1. Run the details backfill, with the API switch off. It stores the details and fills the typed columns (format,
   access, tags, host, time zone, venue, links) on events that were synced before those columns existed:

   ```bash
   curl -X POST "$API/v1/irl/events/sync" -H "Authorization: Bearer $INTERNAL_AUTH_TOKEN" \
     -H "Content-Type: application/json" -d '{ "detailsOnly": true }'
   ```

   It answers `{ "updated": <n> }`. Query 3 counts the events it could not reach: events the events service no longer
   returns. They keep empty details and read as before. On 2026-11-20 dev had details on 481 of 682 events and prod on
   15 of 701, so on prod this step fills almost every event.

2. Deploy the search Lambda (`lambda/lambda-opensearch-sync`) by hand, as its README describes. No pipeline deploys
   it. Its query reads `PLEvent.status`, so deploy it only after the migrations are applied on that environment.
3. Check that `GOOGLE_PLACES_API_KEY` of the API has the Places, Geocoding and Time Zone APIs on. The submit form's
   venue lookups use them.
4. Set a browser key in `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` of the frontend, for the Map view and the venue map. With no
   key both are hidden and everything else works.
5. Turn on the native All Events page (the two frontend settings of the second row above). The old page shows events
   from the events service, so an event submitted in LabOS would not show there.
6. Review the gathering mappings with query 7 and fix or delete each wrong row (see "How an event finds its
   gathering").
7. Check whether the events service returns the creator of an event. From a pod that reaches it:

   ```bash
   curl -s "$EVENT_SERVICE_URL/events?status=APPROVED&conference=" | jq '.events[0] | keys'
   ```

   If a creator email is there (for example `requestorEmail` or `createdBy`), the final sync can set
   `PLEvent.submitterUid` by matching the member email, and authors keep editing their events under "My events".
   If not, events from the events service have no submitter in LabOS: a directory admin or the curator app edits them.

## Phase 3: checks before the switch

1. Record the counts of queries 1 and 2.
2. Query 4 returns no rows.
3. Tell the curator the day and the hour. Submissions that wait in the old portal must be approved or rejected before
   the switch: drafts and rejected events are not moved.

## Phase 4: the switch

1. Approve or reject every submission that waits in the old portal.
2. Put the old portal in maintenance (redirect `irl.os.pl.xyz/events/add` to the LabOS submit form).
3. Run the final full pull sync, with the API switch still off:

   ```bash
   curl -X POST "$API/v1/irl/events/sync" -H "Authorization: Bearer $INTERNAL_AUTH_TOKEN" \
     -H "Content-Type: application/json" -d '{}'
   ```

4. Compare: the number of events the events service returns for `GET /events?status=APPROVED&conference=` equals
   `live_synced_events` of query 1. Query 4 returns no rows.
5. Set `EVENTS_LOCAL_SUBMIT_ENABLED=true` on the API and redeploy. Set `NEXT_PUBLIC_EVENTS_LOCAL_SUBMIT=true` on the
   frontend and rebuild it.
6. Check with queries 1 and 2 that the counts did not change.
7. Submit one event as a member with forum access (published at once) and one as a member without it (waits).
8. Issue the integration key for the curator app, with the scopes `events:read` and `events:write`
   ([INTEGRATION_KEYS.md](./INTEGRATION_KEYS.md)). Approve the waiting event through the API and see it in LabOS.
9. Query 6 shows the two new events by status and by who created them.

## Phase 5: watch, and roll back if needed

Each day of the first week, check query 6 and the API log for errors on `/v1/irl/events` and
`/v1/integrations/events`.

To roll back, set the API and frontend submit settings off, redeploy both, and bring the old portal back. The queue
consumer and the pull sync work again. Events created in LabOS while the switch was on stay in LabOS and stay visible;
they do not exist in the events service. Keep the old portal frozen while the switch is on, so nothing is submitted
there in that window.

The rollback is possible until the events service integration is removed from the code.

## Phase 6: remove the events service

After two weeks on prod with no rollback:

1. Copy the event logos that sit on the events service's buckets into the LabOS image bucket:

   ```bash
   yarn api:copy-event-service-logos             # dry run: lists the logos, changes nothing
   yarn api:copy-event-service-logos -- --apply
   ```

   Query 5 shows how many there are. Logos hosted by Luma are left as they are.

2. Remove the links to the old apps and the iframe fallback from the frontend.
3. Remove the events service integration from the API, then the settings above.
4. Turn off the events service, its queue and the old apps.

## How an event finds its gathering

A new event goes to the gathering that its city, state and country are mapped to in `PLEventLocationAssociation`.
A mapping row wins over everything else, and many rows point a city to a gathering with another name on purpose
(on prod, small cities go to the gathering "Others"). With no mapping row, the event reuses a gathering named
"City, Country", or one named only "City" when that gathering has no country or the same country. Otherwise a new
gathering "City, Country" is made, with a mapping row.

So a wrong mapping row sends every new event of that city to the wrong gathering. Query 7 lists the rows whose
country differs from their gathering's country. On prod on 2026-11-20 it returned one row: San Juan, Argentina,
mapped to the gathering "san juan" of Puerto Rico, with no events.

A gathering that an event creates is listed on IRL Gatherings as soon as it has an approved event, after the
gatherings that have a `priority` (see "Which gatherings are listed" in [EVENTS.md](./EVENTS.md)). Query 8 lists the
gatherings with upcoming events and no priority: set one to move a city up the list.

## Count queries

```sql
-- 1. Events that came from the events service, by state.
SELECT count(*) FILTER (WHERE NOT "isDeleted") AS live_synced_events,
       count(*) FILTER (WHERE "isDeleted") AS deleted_synced_events,
       count(DISTINCT "externalId") FILTER (WHERE NOT "isDeleted") AS distinct_live_external_ids
FROM "PLEvent"
WHERE "externalId" IS NOT NULL AND "sourceTeamUid" IS NULL;

-- 2. All events, guest rows and gatherings.
SELECT (SELECT count(*) FROM "PLEvent" WHERE NOT "isDeleted") AS live_events,
       (SELECT count(*) FROM "PLEvent") AS all_events,
       (SELECT count(*) FROM "PLEventGuest") AS guest_rows,
       (SELECT count(*) FROM "PLEventGuest" WHERE "eventUid" IS NOT NULL) AS event_guest_rows,
       (SELECT count(*) FROM "PLEventLocation" WHERE NOT "isDeleted") AS live_gatherings,
       (SELECT count(*) FROM "PLEventLocationAssociation" WHERE NOT "isDeleted") AS live_location_associations,
       (SELECT count(*) FROM "PLEventAssociation") AS member_and_team_links;

-- 3. Synced events with no stored details (the backfill did not reach them).
SELECT count(*) AS live_synced_events_without_details
FROM "PLEvent"
WHERE "externalId" IS NOT NULL AND "sourceTeamUid" IS NULL AND NOT "isDeleted"
  AND NOT COALESCE("additionalInfo" ? 'details', false);

-- 4. External ids of the events service used by more than one live event (expected: no rows).
SELECT "externalId", count(*) AS events
FROM "PLEvent"
WHERE "externalId" IS NOT NULL AND "sourceTeamUid" IS NULL AND NOT "isDeleted"
GROUP BY "externalId"
HAVING count(*) > 1;

-- 5. Event logos by host, for the logo copy.
SELECT CASE
         WHEN i.url LIKE '%pl-events-service%' THEN 'events service bucket'
         WHEN i.url LIKE '%lumacdn.com%' THEN 'luma'
         ELSE 'other'
       END AS logo_host,
       count(DISTINCT i.uid) AS logos
FROM "PLEvent" e
JOIN "Image" i ON i.uid = e."logoUid"
GROUP BY 1
ORDER BY 2 DESC;

-- 6. After the cutover: events by status and by who created them.
SELECT status,
       count(*) FILTER (WHERE "submitterUid" IS NOT NULL) AS by_members,
       count(*) FILTER (WHERE "sourceTeamUid" IS NOT NULL) AS by_partner_apps,
       count(*) AS events
FROM "PLEvent"
WHERE NOT "isDeleted"
GROUP BY status
ORDER BY status;

-- 7. City mappings that point to a gathering in another country (review each row before the cutover).
SELECT a.city, a.state, a.country, l.location AS gathering, l.country AS gathering_country,
       (SELECT count(*) FROM "PLEvent" e
        WHERE e."pLEventLocationAssociationUid" = a.uid AND NOT e."isDeleted") AS events
FROM "PLEventLocationAssociation" a
JOIN "PLEventLocation" l ON l.uid = a."locationUid"
WHERE NOT a."isDeleted" AND NOT l."isDeleted"
  AND a.country IS NOT NULL AND a.country <> ''
  AND l.country IS NOT NULL AND l.country <> ''
  AND lower(a.country) <> lower(l.country);

-- 8. Gatherings with upcoming events and no priority (listed last on IRL Gatherings).
SELECT l.uid, l.location, l.country,
       count(*) AS upcoming_events
FROM "PLEventLocation" l
JOIN "PLEvent" e ON e."locationUid" = l.uid
WHERE NOT l."isDeleted" AND l.priority IS NULL
  AND NOT e."isDeleted" AND e."endDate" >= now()
GROUP BY l.uid, l.location, l.country
ORDER BY upcoming_events DESC;
```

Queries 1, 3, 4 and 6 read columns the migrations add (`sourceTeamUid`, `status`, `submitterUid`). Before the
migrations are applied, run them without those conditions.
