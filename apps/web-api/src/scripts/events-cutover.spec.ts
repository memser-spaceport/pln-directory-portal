import { readFileSync } from 'fs';
import * as path from 'path';
import {
  analyseServiceEvents,
  clientConfig,
  compareSnapshots,
  creatorEmailFields,
  CutoverSnapshot,
  describeServiceReport,
  describeSyncAnswer,
  GUARDED_COUNTS,
  MAX_IDS,
  parseArgs,
  SERVICE_STATUS_GROUPS,
  syncBody,
  toCounts,
} from './events-cutover.core';
import { CUTOVER_QUERIES, printableSql, queryFor } from './events-cutover.queries';

const COUNTS = Object.fromEntries(GUARDED_COUNTS.map((key, i) => [key, 100 + i]));

function snapshot(overrides: Partial<CutoverSnapshot> = {}): CutoverSnapshot {
  return {
    env: 'dev',
    takenAt: '2026-11-25T10:00:00.000Z',
    mode: 'migrated',
    counts: { ...COUNTS, live_synced_events: 682 },
    rows: { '4': [] },
    ...overrides,
  };
}

describe('events cutover CLI arguments', () => {
  it('reads each command', () => {
    expect(parseArgs(['snapshot', '--env', 'prod'])).toEqual({ command: 'snapshot', env: 'prod', out: null });
    expect(parseArgs(['snapshot', '--env', 'dev', '--out', 'a.json'])).toEqual({
      command: 'snapshot',
      env: 'dev',
      out: 'a.json',
    });
    expect(parseArgs(['compare', 'a.json', 'b.json'])).toEqual({
      command: 'compare',
      before: 'a.json',
      after: 'b.json',
    });
    expect(parseArgs(['service', '--env', 'dev'])).toEqual({ command: 'service', env: 'dev' });
    expect(parseArgs(['sync', '--details-only'])).toEqual({ command: 'sync', mode: 'details-only' });
    expect(parseArgs(['sync', '--full'])).toEqual({ command: 'sync', mode: 'full' });
    expect(parseArgs(['sync', '--non-approved'])).toEqual({ command: 'sync', mode: 'non-approved' });
    expect(parseArgs(['--print-sql'])).toEqual({ command: 'print-sql' });
  });

  it('refuses a sync with no mode or both, a snapshot without --env, and an unknown command', () => {
    expect(() => parseArgs(['sync'])).toThrow('exactly one');
    expect(() => parseArgs(['sync', '--full', '--details-only'])).toThrow('exactly one');
    expect(() => parseArgs(['sync', '--full', '--non-approved'])).toThrow('exactly one');
    expect(() => parseArgs(['snapshot'])).toThrow('--env is required');
    expect(() => parseArgs(['snapshot', '--env'])).toThrow('--env needs a value');
    expect(() => parseArgs(['compare', 'a.json'])).toThrow('two snapshot files');
    expect(() => parseArgs(['drop'])).toThrow('Unknown command');
    expect(() => parseArgs([])).toThrow('No command');
  });
});

describe('compareSnapshots', () => {
  it('says "no loss" when every guarded count is the same', () => {
    const result = compareSnapshots(snapshot(), snapshot({ takenAt: '2026-11-25T11:00:00.000Z' }));
    expect(result.ok).toBe(true);
    expect(result.lines).toContain('no loss: every guarded count is the same');
  });

  it('fails on a missing guest row and prints both values', () => {
    const after = snapshot({ counts: { ...COUNTS, guest_rows: COUNTS.guest_rows - 1, live_synced_events: 682 } });
    const result = compareSnapshots(snapshot(), after);
    expect(result.ok).toBe(false);
    expect(result.lines).toContain(`  guest_rows: ${COUNTS.guest_rows} → ${COUNTS.guest_rows - 1}`);
  });

  it('fails when a guarded count is missing from one snapshot', () => {
    const { live_gatherings, ...rest } = COUNTS;
    const result = compareSnapshots(snapshot(), snapshot({ counts: rest }));
    expect(live_gatherings).toBeDefined();
    expect(result.ok).toBe(false);
    expect(result.lines).toContain('  live_gatherings: missing in after');
  });

  it('reports other counts without failing', () => {
    const after = snapshot({ counts: { ...COUNTS, live_synced_events: 690 } });
    const result = compareSnapshots(snapshot(), after);
    expect(result.ok).toBe(true);
    expect(result.lines).toContain('  live_synced_events: 682 → 690');
  });

  it('refuses snapshots of different environments', () => {
    const result = compareSnapshots(snapshot(), snapshot({ env: 'prod' }));
    expect(result.ok).toBe(false);
    expect(result.lines[0]).toContain('Refused');
  });

  it('mentions duplicate external ids', () => {
    const after = snapshot({ rows: { '4': [{ externalId: 'x', events: '2' }] } });
    expect(compareSnapshots(snapshot(), after).lines.join('\n')).toContain('Query 4: 1 external ids');
  });

  it('turns Postgres bigint strings into numbers', () => {
    expect(toCounts({ live_events: '701', guest_rows: 12 })).toEqual({ live_events: 701, guest_rows: 12 });
  });
});

describe('analyseServiceEvents', () => {
  const events = (ids: string[]) => ids.map((event_id) => ({ event_id, event_name: 'x' }));

  it('matches when both sides hold the same ids', () => {
    const report = analyseServiceEvents(events(['a', 'b']), ['b', 'a']);
    expect(report).toMatchObject({
      serviceCount: 2,
      labosCount: 2,
      match: true,
      missingInLabos: [],
      missingInService: [],
    });
    expect(describeServiceReport('prod', report)[0]).toContain('match');
  });

  it('lists the ids missing on either side, at most 20 of each', () => {
    const many = Array.from({ length: 30 }, (_, i) => `s${i}`);
    const report = analyseServiceEvents(events([...many, 'both']), ['both', 'only-labos']);
    expect(report.match).toBe(false);
    expect(report.missingInLabos).toHaveLength(MAX_IDS);
    expect(report.missingInLabosTotal).toBe(30);
    expect(report.missingInService).toEqual(['only-labos']);
    const text = describeServiceReport('dev', report);
    expect(text[0]).toContain('MISMATCH');
    expect(text[1]).toContain('(30)');
    expect(text[1]).toContain('and 10 more');
  });

  it('names creator email fields and never prints an address', () => {
    const report = analyseServiceEvents(
      [
        { event_id: 'a', requestorEmail: 'host@example.org', contact_email: 'info@example.org' },
        { event_id: 'b', createdBy: { email: 'someone@example.org', name: 'Someone' } },
        { event_id: 'c', requestorEmail: 'not an email' },
      ],
      ['a', 'b', 'c']
    );
    expect(report.creatorEmailFields).toEqual({ requestorEmail: 1, 'createdBy.email': 1 });
    const text = describeServiceReport('dev', report).join('\n');
    expect(text).toContain('requestorEmail (1 events)');
    expect(text).not.toMatch(/@example\.org/);
  });

  it('says so when no event has a creator email', () => {
    expect(creatorEmailFields({ event_id: 'a', host: 'PL' })).toEqual([]);
    expect(describeServiceReport('dev', analyseServiceEvents(events(['a']), ['a'])).join('\n')).toContain(
      'Creator email fields: none'
    );
  });
});

describe('clientConfig', () => {
  it('encrypts without verifying for libpq require, and keeps verify modes as they are', () => {
    expect(clientConfig('postgresql://u:p@localhost:5433/db?sslmode=require')).toEqual({
      connectionString: 'postgresql://u:p@localhost:5433/db',
      ssl: { rejectUnauthorized: false },
    });
    expect(clientConfig('postgresql://u:p@h/db?sslmode=verify-full')).toEqual({
      connectionString: 'postgresql://u:p@h/db?sslmode=verify-full',
    });
    expect(clientConfig('postgresql://u:p@localhost:5432/db')).toEqual({
      connectionString: 'postgresql://u:p@localhost:5432/db',
    });
  });
});

describe('describeSyncAnswer', () => {
  it('passes the updated count through and fails on skipped', () => {
    expect(describeSyncAnswer({ updated: 12 })).toEqual({ ok: true, line: '{"updated":12}' });
    expect(describeSyncAnswer({ updated: 0, skipped: true, reason: 'EVENTS_LOCAL_SUBMIT_ENABLED is on' })).toEqual({
      ok: false,
      line: 'Skipped: EVENTS_LOCAL_SUBMIT_ENABLED is on',
    });
  });
});

describe('cutover queries', () => {
  const runbook = readFileSync(path.join(__dirname, '../../../../docs/EVENTS_CUTOVER.md'), 'utf8');

  it('are numbered 1 to 8, and the runbook names each by its number and title', () => {
    expect(CUTOVER_QUERIES.map((q) => q.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const query of CUTOVER_QUERIES) expect(runbook).toContain(`${query.number}. ${query.title}`);
  });

  it('read only', () => {
    for (const query of CUTOVER_QUERIES) {
      for (const sql of [query.sql, queryFor(query, true)].filter((s): s is string => !!s)) {
        expect(sql.trim()).toMatch(/^SELECT/);
        expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i);
      }
    }
  });

  it('before the migration skip query 6 and leave the migrated columns out', () => {
    expect(queryFor(CUTOVER_QUERIES[5], true)).toBeNull();
    for (const query of CUTOVER_QUERIES) {
      const sql = queryFor(query, true);
      if (sql) expect(sql).not.toMatch(/sourceTeamUid|submitterUid|\bstatus\b/);
    }
  });

  it('print with their numbers', () => {
    expect(printableSql()).toContain('-- 1. Events that came from the events service, by state.');
    expect(printableSql()).toContain('-- 8. Gatherings with upcoming events and no priority');
  });
});

describe('waiting events and drafts in the cutover tool (LAB-3327)', () => {
  it('sends the body of each sync mode', () => {
    expect(syncBody('details-only')).toEqual({ detailsOnly: true });
    expect(syncBody('full')).toEqual({});
    expect(syncBody('non-approved')).toEqual({ nonApproved: true });
  });

  it('checks approved, waiting and draft events, each against its LabOS status, and not rejected ones', () => {
    expect(SERVICE_STATUS_GROUPS.map((g) => [g.serviceStatus, g.labosStatus])).toEqual([
      ['APPROVED', 'APPROVED'],
      ['SUBMITTED', 'PENDING'],
      ['PENDING', 'DRAFT'],
    ]);
  });

  it('labels a status group in the report and prints the creator fields only when asked', () => {
    const report = analyseServiceEvents([{ event_id: 'a' }], ['a']);
    const lines = describeServiceReport('dev', report, 'draft', 'live synced DRAFT', false);
    expect(lines).toEqual(['dev: events service 1 draft events, LabOS 1 live synced DRAFT events: match']);
  });
});
