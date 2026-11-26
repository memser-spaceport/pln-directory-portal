/**
 * The checks and sync steps of the events cutover (`docs/EVENTS_CUTOVER.md`), run from a laptop the same way on
 * dev and prod. Reads only what it is given in the environment, never a `.env` file:
 *
 *   DATABASE_URL         snapshot, service: the env's database (the `pln-pg` tunnel: `pln-pg.sh <env> --url`)
 *   EVENT_SERVICE_URL    service: an events service the laptop reaches; IRL_DOMAIN is sent as `origin`, like the sync
 *   API_URL              sync: the env's directory API, e.g. https://dev-directory.os.pl.xyz
 *   INTERNAL_AUTH_TOKEN  sync: the API's internal token
 *
 *   yarn api:events-cutover snapshot --env prod [--out before.json]   # read-only counts, to a JSON file
 *   yarn api:events-cutover compare before.json after.json            # exit 1 when an event, guest row or gathering is lost
 *   yarn api:events-cutover service --env prod                        # events service vs LabOS by status, creator emails
 *   yarn api:events-cutover sync --details-only | --full | --non-approved   # POST /v1/irl/events/sync
 *   yarn api:events-cutover --print-sql                               # the queries, to run by hand
 */
import axios from 'axios';
import { readFileSync, writeFileSync } from 'fs';
import { Client } from 'pg';
import {
  analyseServiceEvents,
  clientConfig,
  compareSnapshots,
  CutoverArgs,
  CutoverSnapshot,
  defaultSnapshotFile,
  describeServiceReport,
  describeSyncAnswer,
  parseArgs,
  Row,
  SERVICE_STATUS_GROUPS,
  syncBody,
  SyncMode,
  toCounts,
  USAGE,
} from './events-cutover.core';
import {
  CUTOVER_QUERIES,
  LIVE_SYNCED_EXTERNAL_IDS_SQL,
  printableSql,
  queryFor,
  STATUS_COLUMN_PROBE_SQL,
  SYNCED_EXTERNAL_IDS_BY_STATUS_SQL,
} from './events-cutover.queries';

const SERVICE_TIMEOUT_MS = 30000;
const SYNC_TIMEOUT_MS = 10 * 60 * 1000;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** `host:port/db` of the URL, never its password. */
function databaseLabel(url: string): string {
  const parsed = new URL(url);
  return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
}

/** Runs `work` in one read-only transaction: the database refuses any write. */
async function readOnly<T>(work: (client: Client, preMigration: boolean) => Promise<T>): Promise<T> {
  const url = requiredEnv('DATABASE_URL');
  console.error(`Database: ${databaseLabel(url)} (read-only transaction)`);
  const client = new Client(clientConfig(url));
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const probe = await client.query(STATUS_COLUMN_PROBE_SQL);
    const result = await work(client, probe.rows[0]?.migrated !== true);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function snapshot(env: string, out: string | null): Promise<number> {
  const taken = await readOnly(async (client, preMigration) => {
    const counts: Record<string, number> = {};
    const rows: Record<string, Row[]> = {};
    for (const query of CUTOVER_QUERIES) {
      const sql = queryFor(query, preMigration);
      if (!sql) continue;
      const result = await client.query(sql);
      if (query.kind === 'counts') Object.assign(counts, toCounts(result.rows[0]));
      else rows[String(query.number)] = result.rows;
    }
    return { counts, rows, preMigration };
  });

  const takenAt = new Date().toISOString();
  const result: CutoverSnapshot = {
    env,
    takenAt,
    mode: taken.preMigration ? 'pre-migration' : 'migrated',
    counts: taken.counts,
    rows: taken.rows,
  };
  const file = out ?? defaultSnapshotFile(env, takenAt);
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);

  console.log(`${env} (${result.mode}) at ${takenAt} → ${file}`);
  for (const [key, value] of Object.entries(result.counts)) console.log(`  ${key}: ${value}`);
  for (const [number, list] of Object.entries(result.rows)) console.log(`  query ${number}: ${list.length} rows`);
  return 0;
}

function compare(before: string, after: string): number {
  const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as CutoverSnapshot;
  const result = compareSnapshots(read(before), read(after));
  result.lines.forEach((line) => console.log(line));
  return result.ok ? 0 : 1;
}

async function serviceEvents(base: string, status: string): Promise<unknown[]> {
  const query = new URLSearchParams({ status, conference: '' });
  const response = await axios.get(`${base}/events?${query.toString()}`, {
    headers: process.env.IRL_DOMAIN ? { origin: process.env.IRL_DOMAIN } : {},
    timeout: SERVICE_TIMEOUT_MS,
  });
  const events = response.data?.events;
  if (!Array.isArray(events)) throw new Error('The events service answered without an `events` list');
  return events;
}

/**
 * Before the migrations: approved events against every synced event (LabOS had no status). After: each status
 * group against the LabOS events of the matching status. Exit 1 unless every group matches.
 */
async function service(env: string): Promise<number> {
  const base = requiredEnv('EVENT_SERVICE_URL').replace(/\/+$/, '');
  console.error(`Events service: ${new URL(base).host}`);

  const labos = await readOnly(async (client, preMigration) => {
    if (preMigration) {
      const result = await client.query(LIVE_SYNCED_EXTERNAL_IDS_SQL(true));
      return {
        preMigration,
        rows: result.rows.map((row) => ({ externalId: String(row.externalId), status: 'APPROVED' })),
      };
    }
    const result = await client.query(SYNCED_EXTERNAL_IDS_BY_STATUS_SQL);
    return {
      preMigration,
      rows: result.rows.map((row) => ({ externalId: String(row.externalId), status: String(row.status) })),
    };
  });

  const groups = labos.preMigration ? SERVICE_STATUS_GROUPS.slice(0, 1) : SERVICE_STATUS_GROUPS;
  let allMatch = true;
  for (const [index, group] of groups.entries()) {
    const events = await serviceEvents(base, group.serviceStatus);
    const ids = labos.rows.filter((row) => row.status === group.labosStatus).map((row) => row.externalId);
    const report = analyseServiceEvents(events, ids);
    allMatch = allMatch && report.match;
    const labosLabel = labos.preMigration ? 'live synced' : `live synced ${group.labosStatus}`;
    describeServiceReport(env, report, group.label, labosLabel, index === 0).forEach((line) => console.log(line));
  }
  console.log(allMatch ? `${env}: every status matches` : `${env}: MISMATCH`);
  return allMatch ? 0 : 1;
}

async function sync(mode: SyncMode): Promise<number> {
  const api = requiredEnv('API_URL').replace(/\/+$/, '');
  const token = requiredEnv('INTERNAL_AUTH_TOKEN');
  const body = syncBody(mode);
  console.log(`POST ${new URL(api).host}/v1/irl/events/sync ${JSON.stringify(body)}`);
  const response = await axios.post(`${api}/v1/irl/events/sync`, body, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: SYNC_TIMEOUT_MS,
  });
  const answer = describeSyncAnswer(response.data);
  console.log(answer.line);
  return answer.ok ? 0 : 1;
}

async function run(args: CutoverArgs): Promise<number> {
  switch (args.command) {
    case 'print-sql':
      console.log(printableSql());
      return 0;
    case 'snapshot':
      return snapshot(args.env, args.out);
    case 'compare':
      return compare(args.before, args.after);
    case 'service':
      return service(args.env);
    case 'sync':
      return sync(args.mode);
  }
}

async function main() {
  let args: CutoverArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  process.exitCode = await run(args);
}

if (require.main === module) {
  main().catch((error) => {
    const status = error?.response?.status;
    console.error(
      status ? `Failed: HTTP ${status} ${JSON.stringify(error.response.data)}` : `Failed: ${error.message}`
    );
    process.exit(1);
  });
}
