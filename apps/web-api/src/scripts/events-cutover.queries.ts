/**
 * The read-only queries of the events cutover (`docs/EVENTS_CUTOVER.md`), numbered as the runbook numbers them.
 * `events-cutover.ts` runs them; `yarn api:events-cutover --print-sql` prints them for a person who runs them by hand.
 *
 * `counts` queries return one row of named counts. `rows` queries return rows to read (the review queries, the
 * events by status and the logos by host). Before the migration `pl_event_status_and_typed_fields` (no `status`,
 * `sourceTeamUid` or `submitterUid` yet), a query runs as `preMigration`: `'same'` (it reads no migrated column),
 * `'skip'` (it has no meaning there), or the SQL to run instead.
 */
export type CutoverQuery = {
  number: number;
  title: string;
  kind: 'counts' | 'rows';
  sql: string;
  preMigration: 'same' | 'skip' | string;
};

const SYNCED = `"externalId" IS NOT NULL AND "sourceTeamUid" IS NULL`;
const SYNCED_PRE_MIGRATION = `"externalId" IS NOT NULL`;

const syncedEvents = (synced: string) => `SELECT count(*) FILTER (WHERE NOT "isDeleted") AS live_synced_events,
       count(*) FILTER (WHERE "isDeleted") AS deleted_synced_events,
       count(DISTINCT "externalId") FILTER (WHERE NOT "isDeleted") AS distinct_live_external_ids
FROM "PLEvent"
WHERE ${synced}`;

const withoutDetails = (synced: string) => `SELECT count(*) AS live_synced_events_without_details
FROM "PLEvent"
WHERE ${synced} AND NOT "isDeleted"
  AND NOT COALESCE("additionalInfo" ? 'details', false)`;

const duplicateExternalIds = (synced: string) => `SELECT "externalId", count(*) AS events
FROM "PLEvent"
WHERE ${synced} AND NOT "isDeleted"
GROUP BY "externalId"
HAVING count(*) > 1`;

export const CUTOVER_QUERIES: CutoverQuery[] = [
  {
    number: 1,
    title: 'Events that came from the events service, by state',
    kind: 'counts',
    sql: syncedEvents(SYNCED),
    preMigration: syncedEvents(SYNCED_PRE_MIGRATION),
  },
  {
    number: 2,
    title: 'All events, guest rows and gatherings',
    kind: 'counts',
    sql: `SELECT (SELECT count(*) FROM "PLEvent" WHERE NOT "isDeleted") AS live_events,
       (SELECT count(*) FROM "PLEvent") AS all_events,
       (SELECT count(*) FROM "PLEventGuest") AS guest_rows,
       (SELECT count(*) FROM "PLEventGuest" WHERE "eventUid" IS NOT NULL) AS event_guest_rows,
       (SELECT count(*) FROM "PLEventLocation" WHERE NOT "isDeleted") AS live_gatherings,
       (SELECT count(*) FROM "PLEventLocationAssociation" WHERE NOT "isDeleted") AS live_location_associations,
       (SELECT count(*) FROM "PLEventAssociation") AS member_and_team_links`,
    preMigration: 'same',
  },
  {
    number: 3,
    title: 'Synced events with no stored details (the backfill did not reach them)',
    kind: 'counts',
    sql: withoutDetails(SYNCED),
    preMigration: withoutDetails(SYNCED_PRE_MIGRATION),
  },
  {
    number: 4,
    title: 'External ids of the events service used by more than one live event (expected: no rows)',
    kind: 'rows',
    sql: duplicateExternalIds(SYNCED),
    preMigration: duplicateExternalIds(SYNCED_PRE_MIGRATION),
  },
  {
    number: 5,
    title: 'Event logos by host, for the logo copy',
    kind: 'rows',
    sql: `SELECT CASE
         WHEN i.url LIKE '%pl-events-service%' THEN 'events service bucket'
         WHEN i.url LIKE '%lumacdn.com%' THEN 'luma'
         ELSE 'other'
       END AS logo_host,
       count(DISTINCT i.uid) AS logos
FROM "PLEvent" e
JOIN "Image" i ON i.uid = e."logoUid"
GROUP BY 1
ORDER BY 2 DESC`,
    preMigration: 'same',
  },
  {
    number: 6,
    title: 'Events by status and by who created them',
    kind: 'rows',
    sql: `SELECT status,
       count(*) FILTER (WHERE "submitterUid" IS NOT NULL) AS by_members,
       count(*) FILTER (WHERE "sourceTeamUid" IS NOT NULL) AS by_partner_apps,
       count(*) AS events
FROM "PLEvent"
WHERE NOT "isDeleted"
GROUP BY status
ORDER BY status`,
    preMigration: 'skip',
  },
  {
    number: 7,
    title: 'City mappings that point to a gathering in another country (review each row before the cutover)',
    kind: 'rows',
    sql: `SELECT a.city, a.state, a.country, l.location AS gathering, l.country AS gathering_country,
       (SELECT count(*) FROM "PLEvent" e
        WHERE e."pLEventLocationAssociationUid" = a.uid AND NOT e."isDeleted") AS events
FROM "PLEventLocationAssociation" a
JOIN "PLEventLocation" l ON l.uid = a."locationUid"
WHERE NOT a."isDeleted" AND NOT l."isDeleted"
  AND a.country IS NOT NULL AND a.country <> ''
  AND l.country IS NOT NULL AND l.country <> ''
  AND lower(a.country) <> lower(l.country)`,
    preMigration: 'same',
  },
  {
    number: 8,
    title: 'Gatherings with upcoming events and no priority (listed last on IRL Gatherings)',
    kind: 'rows',
    sql: `SELECT l.uid, l.location, l.country,
       count(*) AS upcoming_events
FROM "PLEventLocation" l
JOIN "PLEvent" e ON e."locationUid" = l.uid
WHERE NOT l."isDeleted" AND l.priority IS NULL
  AND NOT e."isDeleted" AND e."endDate" >= now()
GROUP BY l.uid, l.location, l.country
ORDER BY upcoming_events DESC`,
    preMigration: 'same',
  },
];

/** The SQL to run for this database state, or null when the query is skipped there. */
export function queryFor(query: CutoverQuery, preMigration: boolean): string | null {
  if (!preMigration || query.preMigration === 'same') return query.sql;
  return query.preMigration === 'skip' ? null : query.preMigration;
}

/** The external ids LabOS holds for the events service's events, for the `service` check. */
export const LIVE_SYNCED_EXTERNAL_IDS_SQL = (preMigration: boolean) =>
  `SELECT DISTINCT "externalId" FROM "PLEvent" WHERE ${
    preMigration ? SYNCED_PRE_MIGRATION : SYNCED
  } AND NOT "isDeleted"`;

/** Live synced events with their status (a migrated database only), for `service` by status. */
export const SYNCED_EXTERNAL_IDS_BY_STATUS_SQL = `SELECT DISTINCT "externalId", "status"::text AS status FROM "PLEvent"
  WHERE ${SYNCED} AND NOT "isDeleted"`;

/** True when the migration that adds `PLEvent.status` is applied. */
export const STATUS_COLUMN_PROBE_SQL = `SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = 'PLEvent' AND column_name = 'status'
) AS migrated`;

export function printableSql(): string {
  return CUTOVER_QUERIES.map((q) => `-- ${q.number}. ${q.title}.\n${q.sql};\n`).join('\n');
}
