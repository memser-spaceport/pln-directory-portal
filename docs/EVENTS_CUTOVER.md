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

### Where each setting is set

| Setting                                                                                                                                  | Set in                                                                            | Dev     | Prod |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------- | ---- |
| `EVENTS_LOCAL_SUBMIT_ENABLED`, `GOOGLE_PLACES_API_KEY`                                                                                   | SSM `/dev/directory-service/` or `/prod/directory-service/`, then an API redeploy | Natalia | Vova |
| `NEXT_PUBLIC_SHOW_EVENT_DRAWER`, `NEXT_PUBLIC_SHOW_EVENTS_PAGE_V2`, `NEXT_PUBLIC_EVENTS_LOCAL_SUBMIT`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | The frontend's Vercel project, for that environment, then a new build             | Natalia | Vova |

The curation API (`/v1/integrations/events`) has no switch. It needs an integration key with the scope `events:read`
or `events:write`, and no such key exists until step 8 of phase 4.

## The cutover tool

`yarn api:events-cutover` runs the checks and the sync calls of this page, the same way on dev and prod. It reads only
the environment variables it is given, never a `.env` file:

| Command                                             | Needs                               | Does                                                                                                                                                                                                                                           |
| --------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `snapshot --env <env> [--out <file>]`               | `DATABASE_URL`                      | Runs the count queries in one read-only transaction and writes them to a JSON file. On a database without the migrations it is marked `pre-migration`.                                                                                         |
| `compare <before.json> <after.json>`                | the two files                       | Exits 1 when events, guest rows, gatherings, city mappings or member and team links changed, and prints each change. Other counts are shown, not checked.                                                                                      |
| `service --env <env>`                               | `DATABASE_URL`, `EVENT_SERVICE_URL` | Compares the events service with LabOS, by id and by status: approved with `APPROVED`, waiting (`SUBMITTED`) with `PENDING`, drafts (`PENDING`) with `DRAFT`. Names the fields that hold a creator email. Exits 1 unless every status matches. |
| `sync --details-only`, `--full` or `--non-approved` | `API_URL`, `INTERNAL_AUTH_TOKEN`    | Calls `POST /v1/irl/events/sync`: the details backfill, the full pull sync, or the import of waiting events and drafts. Exits 1 when the API skips it because the API switch is on.                                                            |
| `--print-sql`                                       | nothing                             | Prints the queries, to run them by hand.                                                                                                                                                                                                       |

`DATABASE_URL` is the `pln-pg` tunnel of the environment (`.claude/skills/pln-pg/pln-pg.sh <env> --url`); the tool
reads `sslmode=require` as "encrypt, do not verify", as libpq does. `EVENT_SERVICE_URL` is the events service the
laptop reaches: `https://dev-events.os.pl.xyz` on dev. Keep the snapshot files until the Goal is done, and put their
counts (not their rows) in the ticket.

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
3. Before the merge, take `snapshot --env <env> --out phase1-before.json` (it is `pre-migration`). After the API
   started, take `phase1-after.json` and run `compare phase1-before.json phase1-after.json`. Query 6 in the second
   snapshot shows every event `APPROVED`.

After this phase the events service still owns events. The queue and the pull sync also write the new columns.

## Phase 2: prepare the data and the settings

1. Run the details backfill, with the API switch off. It stores the details and fills the typed columns (format,
   access, tags, host, time zone, venue, links) on events that were synced before those columns existed:

   ```bash
   yarn api:events-cutover sync --details-only
   ```

   It prints `{ "updated": <n> }`. `live_synced_events_without_details` of the next snapshot (query 3) counts the
   events it could not reach: events the events service no longer
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
7. Run `service --env <env>`. It lists the events missing on either side, for each status, and the fields that hold
   a creator email.
   On dev on 2026-11-25 the events service had 1393 approved events and LabOS 507: 912 were never synced to dev, and
   26 LabOS events (the ones query 3 counts) are no longer in the events service. The final sync adds the first and
   deletes the second. The events carry `created_by` and `submitted_by` emails, so the final sync can set
   `PLEvent.submitterUid` by matching the member email, and authors keep editing their events under My Submissions.

## Phase 3: checks before the switch

1. Take `snapshot --env <env> --out phase3.json` and put its counts in the ticket.
2. Query 4 has no rows in it.
3. Tell the curator the day and the hour. Waiting submissions and drafts move to LabOS with their submitter, so the
   curator can also decide on them after the switch (curation API). Rejected events are not moved.

## Phase 4: the switch

1. Put the old portal in maintenance (redirect `irl.os.pl.xyz/events/add` to the LabOS submit form), so nothing new
   is submitted there.
2. Run the final full pull sync, with the API switch still off: `yarn api:events-cutover sync --full`. It adds the
   approved events LabOS is missing, removes the ones the events service no longer approves, and approves in LabOS
   any event the old portal approved since the last import.
3. Import the waiting events and the drafts: `yarn api:events-cutover sync --non-approved`. Old `SUBMITTED` becomes
   `PENDING` ("Submitted"), old `PENDING` becomes `DRAFT`. The submitter is the member whose email is the event's
   `created_by` (else `submitted_by`); `withoutSubmitter` counts the events with no matching member. They get no guest
   rows and no notifications. Running it again updates what it brought over before.
4. `service --env <env>` says "every status matches": approved, waiting and draft events are in LabOS with the
   matching status, and nothing else. Then take `snapshot --env <env> --out phase4-before.json`. Query 4 has no rows
   in it.
5. Set `EVENTS_LOCAL_SUBMIT_ENABLED=true` on the API and redeploy. Set `NEXT_PUBLIC_EVENTS_LOCAL_SUBMIT=true` on the
   frontend and rebuild it.
6. Take `phase4-after.json` and run `compare phase4-before.json phase4-after.json`: it says "no loss".
7. Submit one event as a member with forum access (published at once) and one as a member without it (waits).
8. Issue the integration key for the curator app, with the scopes `events:read` and `events:write`
   ([INTEGRATION_KEYS.md](./INTEGRATION_KEYS.md)). Approve the waiting event through the API and see it in LabOS.
9. A new snapshot shows the two new events in query 6, by status and by who created them.

## Phase 5: watch, and roll back if needed

Each day of the first week, take a snapshot (query 6) and check the API log for errors on `/v1/irl/events` and
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

`yarn api:events-cutover --print-sql` prints them. `snapshot` runs them all.

| Query                                                                                              | Read it as                                                                                        |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1. Events that came from the events service, by state                                              | `live_synced_events`, `deleted_synced_events`, `distinct_live_external_ids`                       |
| 2. All events, guest rows and gatherings                                                           | The counts `compare` checks: events, guest rows, gatherings, city mappings, member and team links |
| 3. Synced events with no stored details (the backfill did not reach them)                          | `live_synced_events_without_details`                                                              |
| 4. External ids of the events service used by more than one live event (expected: no rows)         | Rows to fix before the switch                                                                     |
| 5. Event logos by host, for the logo copy                                                          | Logos per host; the copy in phase 6 empties "events service bucket"                               |
| 6. Events by status and by who created them                                                        | After the switch: members' and partner apps' events by status                                     |
| 7. City mappings that point to a gathering in another country (review each row before the cutover) | Rows to review (see "How an event finds its gathering")                                           |
| 8. Gatherings with upcoming events and no priority (listed last on IRL Gatherings)                 | Gatherings to give a `priority` to move them up                                                   |

Queries 1, 3, 4 and 6 read columns the migrations add (`sourceTeamUid`, `status`, `submitterUid`). On a database
without them, `snapshot` runs 1, 3 and 4 without those conditions and leaves 6 out.
