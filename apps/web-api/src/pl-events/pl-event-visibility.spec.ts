import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { VISIBLE_PL_EVENT_WHERE, visiblePLEventSql, withoutPrivateEventFields } from './pl-event-visibility';

const SRC = join(__dirname, '..');
const READ =
  /\bpLEvent\s*\.\s*(findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|count|groupBy|aggregate)\s*\(/g;
const FRAGMENT = 'VISIBLE_PL_EVENT_WHERE';
const MARKER = 'pl-event-visibility:';
/** How many lines above a read its `pl-event-visibility:` comment may start. */
const MARKER_REACH = 4;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.ts$/.test(name) && !/\.(spec|test)\.ts$/.test(name) && !path.includes('/fixtures/') ? [path] : [];
  });
}

/** The text of a call's arguments, from the `(` at `open` to its matching `)`. */
function callArguments(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    if (source[i] === ')') depth -= 1;
    if (depth === 0) return source.slice(open, i + 1);
  }
  return source.slice(open);
}

type ReadSite = { file: string; line: number; method: string; ok: boolean };

/** Every `prisma.pLEvent` read in `source`, and whether it uses the shared filter or says why it does not. */
export function findEventReads(source: string, file: string): ReadSite[] {
  const lines = source.split('\n');
  const sites: ReadSite[] = [];
  for (const match of source.matchAll(READ)) {
    const start = match.index ?? 0;
    const line = source.slice(0, start).split('\n').length;
    const args = callArguments(source, start + match[0].length - 1);
    const above = lines.slice(Math.max(0, line - 1 - MARKER_REACH), line - 1).join('\n');
    sites.push({ file, line, method: match[1], ok: args.includes(FRAGMENT) || above.includes(MARKER) });
  }
  return sites;
}

describe('VISIBLE_PL_EVENT_WHERE', () => {
  it('is approved and not deleted', () => {
    expect(VISIBLE_PL_EVENT_WHERE).toEqual({ status: 'APPROVED', isDeleted: false });
    expect(visiblePLEventSql('e')).toBe(`e."status" = 'APPROVED' AND e."isDeleted" = false`);
    expect(() => visiblePLEventSql('e; DROP TABLE')).toThrow();
  });
});

describe('every PLEvent read uses the shared visibility filter', () => {
  const sites = sourceFiles(SRC).flatMap((path) => findEventReads(readFileSync(path, 'utf8'), relative(SRC, path)));

  it('finds the read call sites', () => {
    // A guard for the scanner itself: the readers named in the design all read `pLEvent`.
    const files = new Set(sites.map((site) => site.file));
    for (const file of [
      'pl-events/pl-events.service.ts',
      'pl-events/push/irl-gathering-push-notifications.processor.ts',
      'pl-events/push/irl-gathering-push-candidates.service.ts',
      'husky/tools/irl-events.tool.ts',
      'team-news/labos-digest-page.service.ts',
      'mcp/mcp-write-tools.ts',
    ]) {
      expect(files).toContain(file);
    }
    expect(sites.length).toBeGreaterThanOrEqual(25);
  });

  it('has no read without the fragment or a "pl-event-visibility:" reason', () => {
    const missing = sites.filter((site) => !site.ok).map((site) => `${site.file}:${site.line} pLEvent.${site.method}`);
    expect(missing).toEqual([]);
  });

  it('fails for a read without the fragment', () => {
    const bad = `const rows = await this.prisma.pLEvent.findMany({ where: { isDeleted: false } });`;
    expect(findEventReads(bad, 'x.ts')).toEqual([{ file: 'x.ts', line: 1, method: 'findMany', ok: false }]);

    const good = `const rows = await this.prisma.pLEvent.findMany({ where: { ...VISIBLE_PL_EVENT_WHERE, name } });`;
    expect(findEventReads(good, 'x.ts')[0].ok).toBe(true);

    const explained = `// pl-event-visibility: the sync matches its own events.\nawait prisma.pLEvent.findFirst({ where: { externalId } });`;
    expect(findEventReads(explained, 'x.ts')[0].ok).toBe(true);
  });
});

describe('withoutPrivateEventFields', () => {
  const event = (extra: Record<string, unknown> = {}) => ({
    uid: 'e1',
    slugURL: 'e1',
    startDate: new Date('2026-07-24T10:00:00Z'),
    additionalInfo: { details: { tags: [] } },
    submitterUid: 'm-1',
    sourceTeamUid: 't-1',
    reviewedAt: new Date(),
    reviewNote: 'spam?',
    privateDetails: { hostEmail: 'host@pl.xyz' },
    ...extra,
  });

  it('removes the private columns from an event row and keeps the rest', () => {
    const clean = withoutPrivateEventFields(event());
    expect(Object.keys(clean).sort()).toEqual(['additionalInfo', 'slugURL', 'startDate', 'uid']);
    expect(clean.startDate).toBeInstanceOf(Date);
  });

  it('reaches events nested under guests, gatherings and associations', () => {
    const nested = withoutPrivateEventFields({
      uid: 'loc-1',
      locationAssociations: [{ uid: 'a1', PLEvent: [event(), event({ uid: 'e2' })] }],
      eventGuests: [{ uid: 'g1', reviewNote: 'a guest note stays', event: event() }],
    });
    expect(JSON.stringify(nested)).not.toMatch(/m-1|host@pl.xyz|spam\?/);
    expect(nested.eventGuests[0].reviewNote).toBe('a guest note stays');
    expect(nested.locationAssociations[0].PLEvent.map((row) => row.uid)).toEqual(['e1', 'e2']);
  });

  it('leaves the input untouched', () => {
    const row = event();
    withoutPrivateEventFields([row]);
    expect(row.submitterUid).toBe('m-1');
  });
});
