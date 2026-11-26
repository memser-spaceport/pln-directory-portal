/**
 * The pure part of `yarn api:events-cutover` (`docs/EVENTS_CUTOVER.md`): arguments, the snapshot shape, the verdict
 * of `compare`, and the reading of the events service's answer for `service`. No I/O here.
 */

export type CutoverCommand = 'snapshot' | 'compare' | 'service' | 'sync';

export type CutoverArgs =
  | { command: 'print-sql' }
  | { command: 'snapshot'; env: string; out: string | null }
  | { command: 'compare'; before: string; after: string }
  | { command: 'service'; env: string }
  | { command: 'sync'; mode: SyncMode };

export type SyncMode = 'details-only' | 'full' | 'non-approved';

const SYNC_FLAGS: Record<string, SyncMode> = {
  '--details-only': 'details-only',
  '--full': 'full',
  '--non-approved': 'non-approved',
};

/** The body of `POST /v1/irl/events/sync` for each mode. */
export function syncBody(mode: SyncMode): Record<string, boolean> {
  if (mode === 'details-only') return { detailsOnly: true };
  if (mode === 'non-approved') return { nonApproved: true };
  return {};
}

export const USAGE = `Usage:
  yarn api:events-cutover snapshot --env <dev|prod|...> [--out <file>]
  yarn api:events-cutover compare <before.json> <after.json>
  yarn api:events-cutover service --env <dev|prod|...>
  yarn api:events-cutover sync --details-only | --full | --non-approved
  yarn api:events-cutover --print-sql`;

function flagValue(argv: string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`);
  return value;
}

function requireEnv(argv: string[]): string {
  const env = flagValue(argv, '--env');
  if (!env) throw new Error('--env is required: it labels the snapshot, so dev and prod are never mixed up');
  return env;
}

export function parseArgs(argv: string[]): CutoverArgs {
  if (argv.includes('--print-sql')) return { command: 'print-sql' };
  const [command, ...rest] = argv;
  switch (command) {
    case 'snapshot':
      return { command, env: requireEnv(rest), out: flagValue(rest, '--out') };
    case 'compare': {
      const files = rest.filter((arg) => !arg.startsWith('--'));
      if (files.length !== 2) throw new Error('compare needs two snapshot files: <before.json> <after.json>');
      return { command, before: files[0], after: files[1] };
    }
    case 'service':
      return { command, env: requireEnv(rest) };
    case 'sync': {
      const modes = Object.keys(SYNC_FLAGS).filter((flag) => rest.includes(flag));
      if (modes.length !== 1) throw new Error('sync needs exactly one of --details-only, --full or --non-approved');
      return { command, mode: SYNC_FLAGS[modes[0]] };
    }
    default:
      throw new Error(command ? `Unknown command "${command}"` : 'No command given');
  }
}

export type Row = Record<string, unknown>;

export type CutoverSnapshot = {
  env: string;
  takenAt: string;
  /** `pre-migration` when the database has no `PLEvent.status` yet (phase 1, before). */
  mode: 'migrated' | 'pre-migration';
  counts: Record<string, number>;
  /** Rows of the `rows` queries, by query number. A query skipped in this mode is absent. */
  rows: Record<string, Row[]>;
};

/** The counts the Goal promises do not change: events, guest rows, gatherings and their links. */
export const GUARDED_COUNTS = [
  'live_events',
  'all_events',
  'guest_rows',
  'event_guest_rows',
  'live_gatherings',
  'live_location_associations',
  'member_and_team_links',
] as const;

/** Postgres `count(*)` comes back as a string (bigint); every count of a snapshot is a number. */
export function toCounts(row: Row | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(row ?? {})) counts[key] = Number(value);
  return counts;
}

export type CompareResult = { ok: boolean; lines: string[] };

export function compareSnapshots(before: CutoverSnapshot, after: CutoverSnapshot): CompareResult {
  if (before.env !== after.env) {
    return { ok: false, lines: [`Refused: the snapshots are of "${before.env}" and "${after.env}".`] };
  }
  const lines = [`${before.env}: ${before.takenAt} → ${after.takenAt}`];
  const lost: string[] = [];
  const guarded = new Set<string>(GUARDED_COUNTS);

  for (const key of GUARDED_COUNTS) {
    const was = before.counts[key];
    const now = after.counts[key];
    if (was === undefined || now === undefined) {
      lost.push(`${key}: missing in ${was === undefined ? 'before' : 'after'}`);
    } else if (was !== now) {
      lost.push(`${key}: ${was} → ${now}`);
    }
  }

  const other = Array.from(new Set([...Object.keys(before.counts), ...Object.keys(after.counts)])).filter(
    (key) => !guarded.has(key)
  );
  const changed = other.filter((key) => before.counts[key] !== after.counts[key]);

  if (lost.length) {
    lines.push('Changed counts that must stay the same:', ...lost.map((line) => `  ${line}`));
  } else {
    lines.push('no loss: every guarded count is the same');
  }
  if (changed.length) {
    lines.push(
      'For information (these may change on purpose):',
      ...changed.map((key) => `  ${key}: ${before.counts[key] ?? '-'} → ${after.counts[key] ?? '-'}`)
    );
  }
  const duplicates = after.rows['4']?.length ?? 0;
  if (duplicates)
    lines.push(`Query 4: ${duplicates} external ids are used by more than one live event (expected none)`);

  const perEvent = compareEvents(before.rows['9'], after.rows['9']);
  lines.push(...perEvent.lines);
  return { ok: lost.length === 0 && perEvent.ok, lines };
}

const MAX_LISTED = 20;
const isTrue = (value: unknown) => value === true || value === 't' || value === 'true';

/**
 * Event by event (query 9). A loss, which fails the compare: an event that was live and is now deleted or gone
 * while it had guests or was made in LabOS; an event moved to another gathering; fewer guests on an event; any
 * change to an event made in LabOS. Shown, not failed: a synced event with no guests deleted (the events service
 * deleted it), new events, name, date and slug changes, a gathering given to an event that had none.
 */
export function compareEvents(before: Row[] | undefined, after: Row[] | undefined): CompareResult {
  if (!before || !after) return { ok: true, lines: ['Per-event compare: skipped (a snapshot has no query 9)'] };
  const now = new Map(after.map((row) => [String(row.uid), row]));
  const was = new Map(before.map((row) => [String(row.uid), row]));
  const label = (row: Row) => `${String(row.name ?? '').slice(0, 40)} (${row.uid})`;
  const losses: string[] = [];
  const info: Record<string, string[]> = {
    'synced event with no guests deleted': [],
    'name, dates or slug changed': [],
    'gathering given': [],
  };

  for (const old of before) {
    if (isTrue(old.deleted)) continue;
    const cur = now.get(String(old.uid));
    const guests = Number(old.guests ?? 0);
    const madeInLabos = isTrue(old.made_in_labos);
    if (!cur || isTrue(cur.deleted)) {
      if (guests > 0 || madeInLabos) {
        losses.push(
          `${label(old)}: ${cur ? 'deleted' : 'gone'} (${guests} guests${madeInLabos ? ', made in LabOS' : ''})`
        );
      } else info['synced event with no guests deleted'].push(label(old));
      continue;
    }
    if (old.gathering_uid && cur.gathering_uid !== old.gathering_uid) {
      losses.push(`${label(old)}: moved to another gathering`);
    } else if (!old.gathering_uid && cur.gathering_uid) {
      info['gathering given'].push(label(old));
    }
    if (Number(cur.guests ?? 0) < guests) losses.push(`${label(old)}: guests ${guests} → ${cur.guests}`);
    const changed = ['name', 'start_date', 'end_date', 'slug'].filter((key) => String(old[key]) !== String(cur[key]));
    if (madeInLabos && (changed.length || Number(cur.links ?? 0) !== Number(old.links ?? 0))) {
      losses.push(`${label(old)}: made in LabOS but changed (${changed.join(', ') || 'links'})`);
    } else if (changed.length) info['name, dates or slug changed'].push(`${label(old)}: ${changed.join(', ')}`);
  }
  const added = after.filter((row) => !was.has(String(row.uid))).length;

  const lines = [
    losses.length
      ? `Per-event compare: ${losses.length} event(s) lost or moved:`
      : 'Per-event compare: no event lost or moved',
  ];
  losses.slice(0, MAX_LISTED).forEach((line) => lines.push(`  ${line}`));
  if (losses.length > MAX_LISTED) lines.push(`  and ${losses.length - MAX_LISTED} more`);
  lines.push(`For information: ${added} new events`);
  for (const [kind, list] of Object.entries(info)) {
    if (!list.length) continue;
    lines.push(
      `  ${kind}: ${list.length}${
        list.length > 5 ? ` (first 5: ${list.slice(0, 5).join('; ')})` : `: ${list.join('; ')}`
      }`
    );
  }
  return { ok: losses.length === 0, lines };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CREATOR_KEY = /creat|request|submit|author|owner|organi[sz]er/i;
const isPlainObject = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Field paths (`requestorEmail`, `createdBy.email`) that hold an email under a key that names the creator. */
export function creatorEmailFields(event: Row): string[] {
  const fields: string[] = [];
  for (const [key, value] of Object.entries(event)) {
    if (typeof value === 'string' && CREATOR_KEY.test(key) && EMAIL.test(value.trim())) fields.push(key);
    if (isPlainObject(value) && CREATOR_KEY.test(key)) {
      for (const [inner, innerValue] of Object.entries(value)) {
        if (typeof innerValue === 'string' && EMAIL.test(innerValue.trim())) fields.push(`${key}.${inner}`);
      }
    }
  }
  return fields;
}

export type ServiceReport = {
  serviceCount: number;
  labosCount: number;
  match: boolean;
  /** How many ids each side is missing. */
  missingInLabosTotal: number;
  missingInServiceTotal: number;
  /** At most `MAX_IDS` of each, so a broken answer does not flood the terminal. */
  missingInLabos: string[];
  missingInService: string[];
  /** Field paths and how many events carry them. Never a value. */
  creatorEmailFields: Record<string, number>;
};

export const MAX_IDS = 20;

/** The events service's approved events against LabOS's live synced external ids. */
export function analyseServiceEvents(serviceEvents: unknown[], labosExternalIds: string[]): ServiceReport {
  const events = serviceEvents.filter(isPlainObject);
  const serviceIds = new Set(
    events.map((event) => event.event_id).filter((id): id is string => typeof id === 'string')
  );
  const labosIds = new Set(labosExternalIds);
  const creator: Record<string, number> = {};
  events.forEach((event) => creatorEmailFields(event).forEach((field) => (creator[field] = (creator[field] ?? 0) + 1)));

  const missingInLabos = [...serviceIds].filter((id) => !labosIds.has(id));
  const missingInService = [...labosIds].filter((id) => !serviceIds.has(id));
  return {
    serviceCount: serviceIds.size,
    labosCount: labosIds.size,
    match: missingInLabos.length === 0 && missingInService.length === 0,
    missingInLabosTotal: missingInLabos.length,
    missingInServiceTotal: missingInService.length,
    missingInLabos: missingInLabos.slice(0, MAX_IDS),
    missingInService: missingInService.slice(0, MAX_IDS),
    creatorEmailFields: creator,
  };
}

/**
 * Which events of the events service each LabOS status must hold, one by one: the approved ones, the waiting ones
 * (old `SUBMITTED`) and the drafts (old `PENDING`, a name LabOS uses for "waiting"). Rejected events are not moved.
 */
export const SERVICE_STATUS_GROUPS = [
  { serviceStatus: 'APPROVED', labosStatus: 'APPROVED', label: 'approved' },
  { serviceStatus: 'SUBMITTED', labosStatus: 'PENDING', label: 'waiting (Submitted)' },
  { serviceStatus: 'PENDING', labosStatus: 'DRAFT', label: 'draft' },
] as const;

export function describeServiceReport(
  env: string,
  report: ServiceReport,
  label = 'approved',
  labosLabel = 'live synced',
  withCreatorFields = true
): string[] {
  const lines = [
    `${env}: events service ${report.serviceCount} ${label} events, LabOS ${report.labosCount} ${labosLabel} events: ${
      report.match ? 'match' : 'MISMATCH'
    }`,
  ];
  const more = (shown: number, total: number) => (total > shown ? `, and ${total - shown} more` : '');
  if (report.missingInLabosTotal) {
    lines.push(
      `  In the events service, not in LabOS (${report.missingInLabosTotal}): ${report.missingInLabos.join(', ')}${more(
        report.missingInLabos.length,
        report.missingInLabosTotal
      )}`
    );
  }
  if (report.missingInServiceTotal) {
    lines.push(
      `  In LabOS, not in the events service (${report.missingInServiceTotal}): ${report.missingInService.join(
        ', '
      )}${more(report.missingInService.length, report.missingInServiceTotal)}`
    );
  }
  if (!withCreatorFields) return lines;
  const fields = Object.entries(report.creatorEmailFields);
  lines.push(
    fields.length
      ? `Creator email fields: ${fields.map(([field, count]) => `${field} (${count} events)`).join(', ')}`
      : 'Creator email fields: none. Events from the events service get no submitter in LabOS.'
  );
  return lines;
}

/** The `sync` answer, as the operator should read it. */
export function describeSyncAnswer(body: unknown): { ok: boolean; line: string } {
  if (isPlainObject(body) && body.skipped === true) {
    return {
      ok: false,
      line: `Skipped: ${String(body.reason ?? 'EVENTS_LOCAL_SUBMIT_ENABLED is on, LabOS owns events')}`,
    };
  }
  return { ok: true, line: JSON.stringify(body) };
}

export function defaultSnapshotFile(env: string, takenAt: string): string {
  return `events-cutover-${env}-${takenAt.replace(/[:.]/g, '-')}.json`;
}

/**
 * libpq's `sslmode=require` (and `prefer`, `no-verify`) encrypts without checking the certificate, as the RDS
 * tunnel needs; node-postgres reads `require` as "verify". Those modes become `rejectUnauthorized: false`.
 */
export function clientConfig(url: string): { connectionString: string; ssl?: { rejectUnauthorized: false } } {
  const parsed = new URL(url);
  const mode = parsed.searchParams.get('sslmode');
  if (!mode || !['require', 'prefer', 'no-verify'].includes(mode)) return { connectionString: url };
  parsed.searchParams.delete('sslmode');
  return { connectionString: parsed.toString(), ssl: { rejectUnauthorized: false } };
}
