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
 *   yarn api:events-cutover service --env prod                        # events service vs LabOS, creator email fields
 *   yarn api:events-cutover sync --details-only | --full              # POST /v1/irl/events/sync
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
  toCounts,
  USAGE,
} from './events-cutover.core';
import {
  CUTOVER_QUERIES,
  LIVE_SYNCED_EXTERNAL_IDS_SQL,
  printableSql,
  queryFor,
  STATUS_COLUMN_PROBE_SQL,
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

async function service(env: string): Promise<number> {
  const base = requiredEnv('EVENT_SERVICE_URL').replace(/\/+$/, '');
  const query = new URLSearchParams({ status: 'APPROVED', conference: '' });
  console.error(`Events service: ${new URL(base).host}`);
  const response = await axios.get(`${base}/events?${query.toString()}`, {
    headers: process.env.IRL_DOMAIN ? { origin: process.env.IRL_DOMAIN } : {},
    timeout: SERVICE_TIMEOUT_MS,
  });
  const events = response.data?.events;
  if (!Array.isArray(events)) throw new Error('The events service answered without an `events` list');

  const ids = await readOnly(async (client, preMigration) => {
    const result = await client.query(LIVE_SYNCED_EXTERNAL_IDS_SQL(preMigration));
    return result.rows.map((row) => String(row.externalId));
  });
  const report = analyseServiceEvents(events, ids);
  describeServiceReport(env, report).forEach((line) => console.log(line));
  return report.match ? 0 : 1;
}

async function sync(mode: 'details-only' | 'full'): Promise<number> {
  const api = requiredEnv('API_URL').replace(/\/+$/, '');
  const token = requiredEnv('INTERNAL_AUTH_TOKEN');
  const body = mode === 'details-only' ? { detailsOnly: true } : {};
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
