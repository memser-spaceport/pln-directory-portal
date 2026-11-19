# Events cutover: LabOS becomes the owner of events

Before the cutover the events service owns event records and LabOS keeps a synced copy of the approved ones.
After it LabOS owns them: members submit in LabOS, and partner apps use the curation API
([EVENTS_CURATION_API.md](./EVENTS_CURATION_API.md)). This page is the checklist for the switch and the queries that
prove no event, guest row or gathering was lost. How events work after the switch is in [EVENTS.md](./EVENTS.md).

The switch is one flag, `EVENTS_LOCAL_SUBMIT_ENABLED`:

| Flag          | Submissions                                                                                        | Events-service queue and pull sync                                                                |
| ------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| off (default) | The events service. `POST /v1/irl/events`, my events, edit, delete and the form lookups answer 404 | Write to `PLEvent`                                                                                |
| `true`        | LabOS                                                                                              | Do nothing: a queue message is dropped and `POST /v1/irl/events/sync` answers `{ skipped: true }` |

Rehearse every step on dev before prod. Run the SQL read-only (the `pln-pg` skill for dev and prod).

## Before the day

1. The migrations `pl_event_status_and_typed_fields` and `pl_event_private_details` are applied. Every event is
   `APPROVED`.
2. The search Lambda (`lambda/lambda-opensearch-sync`) is deployed from the same release. Its query reads
   `PLEvent.status`, so it must not be deployed before the migration.
3. The details backfill has run, so the typed columns are filled on events that were synced before them:

   ```bash
   curl -X POST "$API/v1/irl/events/sync" -H "Authorization: Bearer $INTERNAL_AUTH_TOKEN" \
     -H "Content-Type: application/json" -d '{ "detailsOnly": true }'
   ```

   It answers `{ "updated": <n> }`. Query 3 below counts the events it could not reach: events the events service
   no longer returns. They keep empty details and read as before.

4. The native All Events page is live. The old page shows events from the events service, so an event submitted in
   LabOS would not show there.
5. `GOOGLE_PLACES_API_KEY` has the Places, Geocoding and Time Zone APIs on (the submit form's venue lookups).
6. Check whether the events service returns the creator of an event. From a pod that reaches it:

   ```bash
   curl -s "$EVENT_SERVICE_URL/events?status=APPROVED&conference=" | jq '.events[0] | keys'
   ```

   If a creator email is there (for example `requestorEmail` or `createdBy`), the final sync can set
   `PLEvent.submitterUid` by matching the member email, and authors keep editing their events under "My events".
   If not, events from the events service have no submitter in LabOS: a directory admin or the curator app edits them.

## On the day

Record the counts of queries 1 and 2 before step 3 and after step 6.

1. Approve or reject every submission that waits in the old portal. Drafts and rejected events are not moved.
2. Put the old portal in maintenance (redirect `irl.os.pl.xyz/events/add` to the LabOS submit form).
3. Run the final full pull sync, with the flag still off:

   ```bash
   curl -X POST "$API/v1/irl/events/sync" -H "Authorization: Bearer $INTERNAL_AUTH_TOKEN" \
     -H "Content-Type: application/json" -d '{}'
   ```

4. Compare: the number of events the events service returns for `GET /events?status=APPROVED&conference=` equals
   `live_synced_events` of query 1. Query 4 returns no rows.
5. Set `EVENTS_LOCAL_SUBMIT_ENABLED=true` on the API and redeploy. Turn on the submit form in the frontend.
6. Check, with the same queries, that the counts did not change.
7. Submit one event as a member with forum access (published at once) and one as a member without it (waits).
8. Issue the integration key for the curator app, with the scopes `events:read` and `events:write`
   ([INTEGRATION_KEYS.md](./INTEGRATION_KEYS.md)). Approve the waiting event through the API and see it in LabOS.

## Rollback

Set the flag off and redeploy, and bring the old portal back. The queue consumer and the pull sync work again.
Events created in LabOS while the flag was on stay in LabOS and stay visible; they do not exist in the events
service. Keep the old portal frozen while the flag is on, so nothing is submitted there in that window.

The rollback is possible until the events service integration is removed from the code.

## After two quiet weeks

1. Copy the event logos that sit on the events service's buckets into the LabOS image bucket:

   ```bash
   yarn api:copy-event-service-logos             # dry run: lists the logos, changes nothing
   yarn api:copy-event-service-logos -- --apply
   ```

   Query 5 shows how many there are. Logos hosted by Luma are left as they are.

2. Remove the events service integration from the API, then the service, its queue and the old apps.

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
```

Queries 1, 3, 4 and 6 read columns the migrations add (`sourceTeamUid`, `status`, `submitterUid`). Before the
migrations are applied, run them without those conditions.
