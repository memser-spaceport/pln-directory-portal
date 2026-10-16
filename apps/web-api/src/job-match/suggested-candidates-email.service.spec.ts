// Preview files are not written to disk in tests; fs exports are not spy-able, so the module is mocked.
jest.mock('fs', () => ({ ...jest.requireActual('fs'), writeFileSync: jest.fn() }));
// The real analytics service pulls in the PostHog client; the service only calls trackEvent on the instance.
jest.mock('../analytics/service/analytics.service', () => ({ AnalyticsService: class AnalyticsService {} }));

import * as fs from 'fs';
import { Logger } from '@nestjs/common';
import { SuggestedCandidatesEmailPreferenceService } from '../notification-settings/suggested-candidates-email-preference.service';
import { currentRoleTextHash, type MatchJob } from './job-match.logic';
import { SuggestedCandidatesEmailService, locationText } from './suggested-candidates-email.service';
import { verifySuggestedCandidatesUnsubscribeToken } from './suggested-candidates-token.util';

/**
 * In-memory Prisma fake. It applies only the filters the service actually sends (lead flag, end date, deleted
 * member, missing email, NOT_LOOKING, ...), so dropping a filter from the service makes a test fail.
 */
type Row = {
  kind: 'ROLE' | 'SUGGESTION' | 'CRITERIA';
  runUid: string;
  roleUid: string;
  memberUid?: string;
  rank?: number;
  fit?: number;
  label?: 'STRONG' | 'GOOD';
  blurb?: string | null;
  payload?: unknown;
  roleTextHash?: string;
  createdAt: Date;
};

type SentEmail = { from: string; to: string[]; subject: string; html: string; text: string };

const day = (n: number) => new Date(Date.UTC(2026, 9, n));
const LIVE = { status: 'CONFIRMED', publishedAt: day(1) };
/** The posting fields the criteria hash is built from (MATCH_JOB_SELECT). */
const POSTING = {
  roleCategory: null,
  seniority: null,
  summary: null,
  descriptionHtml: '<p>Build things.</p>',
  location: [] as string[],
  workMode: null,
};
/** Every suggestion's stored criteria marks, unless a test gives its own. */
const MARKS = [
  { text: 'Writes Rust in production', matched: false },
  { text: 'Has run a distributed system', matched: true },
];

function world() {
  const rows: Row[] = [];
  const role = (runUid: string, roleUid: string, createdAt: Date) =>
    rows.push({ kind: 'ROLE', runUid, roleUid, createdAt });
  const suggest = (runUid: string, roleUid: string, list: [string, number, 'STRONG' | 'GOOD' | undefined][]) =>
    list.forEach(([memberUid, fit, label], index) =>
      rows.push({
        kind: 'SUGGESTION',
        runUid,
        roleUid,
        memberUid,
        rank: index + 1,
        fit,
        label,
        blurb: `${memberUid} blurb`,
        payload: MARKS,
        createdAt: day(1),
      })
    );

  // role-1: previous run suggested A; this run lists A, B, C (C is "Not looking"), E is deleted, D is below 50.
  role('run-0', 'role-1', day(5));
  suggest('run-0', 'role-1', [['A', 90, 'STRONG']]);
  role('run-1', 'role-1', day(12));
  suggest('run-1', 'role-1', [
    ['A', 85, 'STRONG'],
    ['B', 60, 'GOOD'],
    ['C', 55, 'GOOD'],
    ['E', 70, 'GOOD'],
    ['D', 40, undefined],
  ]);
  // role-2: other team, not allowlisted.
  role('run-1', 'role-2', day(12));
  suggest('run-1', 'role-2', [['B', 80, 'STRONG']]);
  // role-3: closed after the run.
  role('run-1', 'role-3', day(12));
  suggest('run-1', 'role-3', [['B', 80, 'STRONG']]);
  // role-4: everything was suggested last run.
  role('run-0', 'role-4', day(5));
  suggest('run-0', 'role-4', [['B', 60, 'GOOD']]);
  role('run-1', 'role-4', day(12));
  suggest('run-1', 'role-4', [['B', 61, 'GOOD']]);
  // role-5: first run for the role.
  role('run-1', 'role-5', day(12));
  suggest('run-1', 'role-5', [
    ['G', 75, 'GOOD'],
    ['H', 88, 'STRONG'],
  ]);

  const jobs = [
    { uid: 'role-1', roleTitle: 'Backend Engineer', companyName: 'Acme', teamUid: 'team-1', ...POSTING, ...LIVE },
    { uid: 'role-2', roleTitle: 'Designer', companyName: 'Other', teamUid: 'team-2', ...POSTING, ...LIVE },
    {
      uid: 'role-3',
      roleTitle: 'Closed role',
      companyName: 'Acme',
      teamUid: 'team-1',
      ...POSTING,
      status: 'CLOSED_ROLE_FILLED',
      publishedAt: day(1),
    },
    { uid: 'role-4', roleTitle: 'Old news', companyName: 'Acme', teamUid: 'team-1', ...POSTING, ...LIVE },
    { uid: 'role-5', roleTitle: 'Rust Engineer', companyName: 'Acme', teamUid: 'team-1', ...POSTING, ...LIVE },
  ];

  // The role's current criteria (labelled), and an older posting's row whose labels must not be used.
  const criteriaRow = (roleUid: string, payload: unknown, hash: string, createdAt: Date) =>
    rows.push({ kind: 'CRITERIA', runUid: 'run-1', roleUid, payload, roleTextHash: hash, createdAt });
  const role1 = jobs.find((job) => job.uid === 'role-1') as unknown as MatchJob;
  criteriaRow(
    'role-1',
    [
      { statement: 'Writes Rust in production', label: 'Rust' },
      { statement: 'Has run a distributed system', label: 'Distributed systems' },
    ],
    currentRoleTextHash(role1),
    day(10)
  );
  criteriaRow('role-1', [{ statement: 'Has run a distributed system', label: 'Stale label' }], 'old-hash', day(11));

  const members: Record<
    string,
    {
      name: string;
      deletedAt: Date | null;
      jobSearchStatus?: string;
      email: string | null;
      location?: { city: string | null; country: string | null } | null;
    }
  > = {
    A: { name: 'Ada', deletedAt: null, email: 'a@x' },
    B: {
      name: 'Bob',
      deletedAt: null,
      jobSearchStatus: 'ACTIVELY_LOOKING',
      email: 'b@x',
      location: { city: 'Boston', country: 'United States' },
    },
    C: { name: 'Cy', deletedAt: null, jobSearchStatus: 'NOT_LOOKING', email: 'c@x' },
    D: { name: 'Di', deletedAt: null, email: 'd@x' },
    E: { name: 'Ed', deletedAt: day(2), email: 'e@x' },
    G: { name: 'Gus', deletedAt: null, email: 'g@x', location: { city: '  ', country: 'Germany' } },
    H: { name: 'Hal', deletedAt: null, email: 'h@x' },
    L1: { name: 'Lead One', deletedAt: null, email: 'l1@x' },
    L2: { name: 'Lead Two', deletedAt: null, email: 'l2@x' },
    L3: { name: 'Former Lead', deletedAt: null, email: 'l3@x' },
    L4: { name: 'Deleted Lead', deletedAt: day(3), email: 'l4@x' },
    L5: { name: 'No Email Lead', deletedAt: null, email: null },
    M1: { name: 'Member', deletedAt: null, email: 'm1@x' },
  };
  const teamRoles = [
    { teamUid: 'team-1', memberUid: 'L1', teamLead: true, endDate: null as Date | null },
    { teamUid: 'team-1', memberUid: 'L2', teamLead: true, endDate: null },
    { teamUid: 'team-1', memberUid: 'L3', teamLead: true, endDate: day(1) },
    { teamUid: 'team-1', memberUid: 'L4', teamLead: true, endDate: null },
    { teamUid: 'team-1', memberUid: 'L5', teamLead: true, endDate: null },
    { teamUid: 'team-1', memberUid: 'M1', teamLead: false, endDate: null },
    { teamUid: 'team-2', memberUid: 'L1', teamLead: true, endDate: null },
  ];
  const settings = new Map<string, boolean>([['L2', false]]);
  type Send = {
    uid: string;
    runUid: string;
    roleUid: string;
    recipientUid: string;
    kind: 'FIRST' | 'NEW' | 'REMINDER';
    memberUids: string[];
    candidateCount?: number;
    sentAt: Date;
  };
  // What L1 was already emailed (LAB-2837 feedback): about A for role-1, about B for role-4 — both last run.
  const sends: Send[] = [
    {
      uid: 'send-0a',
      runUid: 'run-0',
      roleUid: 'role-1',
      recipientUid: 'L1',
      kind: 'FIRST',
      memberUids: ['A'],
      sentAt: day(5),
    },
    {
      uid: 'send-0b',
      runUid: 'run-0',
      roleUid: 'role-4',
      recipientUid: 'L1',
      kind: 'FIRST',
      memberUids: ['B'],
      sentAt: day(5),
    },
  ];
  /** Who a lead of the team already contacted, per role. */
  const contacts: { roleUid: string; memberUid: string }[] = [];
  let sendSeq = 0;

  const prisma = {
    jobMatchRun: { findFirst: jest.fn() },
    jobOpening: {
      findMany: jest.fn(async ({ where }) => jobs.filter((job) => where.uid.in.includes(job.uid))),
    },
    team: { findUnique: jest.fn(async ({ where }) => ({ name: where.uid === 'team-1' ? 'Acme Labs' : 'Other' })) },
    jobMatchRow: {
      findMany: jest.fn(async ({ where, take }) => {
        let list = rows.filter(
          (row) =>
            row.kind === where.kind &&
            (where.runUid === undefined || row.runUid === where.runUid) &&
            (where.roleUid === undefined || row.roleUid === where.roleUid)
        );
        if (where.kind === 'SUGGESTION') list = list.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
        return take ? list.slice(0, take) : list;
      }),
      findFirst: jest.fn(async ({ where }) => {
        const list = rows
          .filter(
            (row) =>
              row.kind === where.kind &&
              row.roleUid === where.roleUid &&
              (where.roleTextHash === undefined || row.roleTextHash === where.roleTextHash) &&
              (!where.runUid?.not || row.runUid !== where.runUid.not) &&
              (!where.createdAt?.lt || row.createdAt < where.createdAt.lt)
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return list[0] ?? null;
      }),
    },
    member: {
      findMany: jest.fn(async ({ where }) =>
        where.uid.in
          .filter((uid: string) => members[uid])
          .filter((uid: string) => where.deletedAt !== null || members[uid].deletedAt === null)
          .filter((uid: string) => !where.jobSearchStatus || members[uid].jobSearchStatus === where.jobSearchStatus)
          .map((uid: string) => ({
            uid,
            name: members[uid].name,
            role: 'Engineer',
            image: { url: `https://img/${uid}` },
            location: members[uid].location ?? null,
          }))
      ),
    },
    teamMemberRole: {
      findMany: jest.fn(async ({ where }) => {
        const now = Date.now();
        return teamRoles
          .filter((tm) => tm.teamUid === where.teamUid)
          .filter((tm) => where.teamLead !== true || tm.teamLead)
          .filter((tm) => !where.OR || tm.endDate === null || tm.endDate.getTime() >= now)
          .filter((tm) => where.member?.deletedAt !== null || members[tm.memberUid].deletedAt === null)
          .filter((tm) => where.member?.email?.not !== null || members[tm.memberUid].email !== null)
          .map((tm) => ({ member: { uid: tm.memberUid, ...members[tm.memberUid] } }));
      }),
    },
    notificationSetting: {
      findMany: jest.fn(async ({ where }) =>
        where.memberUid.in
          .filter((uid: string) => settings.get(uid) === where.suggestedCandidatesEmailEnabled)
          .map((memberUid: string) => ({ memberUid }))
      ),
    },
    jobMatchContact: {
      findMany: jest.fn(async ({ where }) =>
        contacts.filter((row) => row.roleUid === where.roleUid && where.memberUid.in.includes(row.memberUid))
      ),
    },
    jobMatchEmailSend: {
      findMany: jest.fn(async ({ where, orderBy }) => {
        const list = sends.filter((send) => send.roleUid === where.roleUid);
        // Newest first is what the service asks for; returning them oldest first otherwise catches a dropped orderBy.
        return orderBy?.sentAt === 'desc'
          ? [...list].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
          : [...list].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
      }),
      create: jest.fn(async ({ data }) => {
        if (
          sends.some(
            (send) =>
              send.runUid === data.runUid && send.roleUid === data.roleUid && send.recipientUid === data.recipientUid
          )
        ) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const row = { uid: `send-${++sendSeq}`, sentAt: day(12), ...data };
        sends.push(row);
        return { uid: row.uid };
      }),
      delete: jest.fn(async ({ where }) => {
        const index = sends.findIndex((send) => send.uid === where.uid);
        if (index >= 0) sends.splice(index, 1);
        return {};
      }),
    },
  };
  const aws = {
    isEmailServiceEnabled: jest.fn(() => true),
    sendHtmlEmail: jest.fn<Promise<unknown>, [SentEmail]>(async () => ({ MessageId: 'x' })),
  };
  const analytics = { trackEvent: jest.fn<Promise<void>, [unknown]>(async () => undefined) };
  const service = new SuggestedCandidatesEmailService(
    prisma as never,
    aws as never,
    new SuggestedCandidatesEmailPreferenceService(prisma as never),
    analytics as never
  );
  return { service, prisma, aws, sends, settings, analytics, contacts };
}

describe('SuggestedCandidatesEmailService', () => {
  const env = { ...process.env };
  let log: jest.SpyInstance;
  let errorLog: jest.SpyInstance;
  const writeFile = fs.writeFileSync as jest.Mock;

  beforeEach(() => {
    process.env.JOB_MATCH_EMAIL_TEAM_UIDS = 'team-1';
    delete process.env.JOB_MATCH_EMAIL_DRY_RUN;
    process.env.SUGGESTED_CANDIDATES_TOKEN_SECRET = 'test-secret';
    process.env.WEB_UI_BASE_URL = 'https://directory.example/';
    process.env.SES_SOURCE_EMAIL = 'directory@example.com';
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    writeFile.mockClear();
  });

  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });

  const emails = (aws: { sendHtmlEmail: jest.Mock<Promise<unknown>, [SentEmail]> }) =>
    aws.sendHtmlEmail.mock.calls.map(([args]) => args);
  const recipients = (aws: { sendHtmlEmail: jest.Mock<Promise<unknown>, [SentEmail]> }) =>
    emails(aws)
      .map((args) => `${args.to[0]}:${args.subject}`)
      .sort();
  const emailFor = (aws: { sendHtmlEmail: jest.Mock<Promise<unknown>, [SentEmail]> }, title: string) => {
    const found = emails(aws).find((args) => args.subject.includes(title));
    if (!found) throw new Error(`no email about ${title}`);
    return found;
  };

  it('sends nothing and says so when the allowlist is empty', async () => {
    for (const value of [undefined, '', ' , ']) {
      if (value === undefined) delete process.env.JOB_MATCH_EMAIL_TEAM_UIDS;
      else process.env.JOB_MATCH_EMAIL_TEAM_UIDS = value;
      const { service, aws, prisma } = world();
      await expect(service.sendForRun('run-1')).resolves.toEqual({
        runUid: 'run-1',
        dryRun: false,
        sent: 0,
        skipped: 0,
      });
      expect(aws.sendHtmlEmail).not.toHaveBeenCalled();
      expect(prisma.jobMatchRow.findMany).not.toHaveBeenCalled();
    }
    expect(log).toHaveBeenCalledWith('suggested-candidates email: no allowlisted teams');
  });

  it('emails only current, opted-in leads of live allowlisted roles, one email per role, of the kind each needs', async () => {
    const { service, aws, sends } = world();
    const result = await service.sendForRun('run-1');

    // L1: role-1 "new" (B; A was emailed last run), role-4 a reminder (B was emailed, nobody new), role-5 "first".
    // L2 opted out (skipped thrice). L3 former, L4 deleted, L5 no email, M1 not a lead. role-2 (team-2, not
    // allowlisted) and role-3 (closed) send nothing.
    expect(recipients(aws)).toEqual([
      'l1@x:1 new match for Backend Engineer',
      'l1@x:Top matches for your Rust Engineer role',
      'l1@x:Your top matches for Old news are waiting',
    ]);
    expect(result).toEqual({ runUid: 'run-1', dryRun: false, sent: 3, skipped: 3 });
    expect(
      sends
        .filter((send) => send.runUid === 'run-1')
        .map(
          (send) =>
            `${send.roleUid}:${send.recipientUid}:${send.kind}:${send.memberUids.join(',')}:${send.candidateCount}`
        )
        .sort()
    ).toEqual(['role-1:L1:NEW:B:1', 'role-4:L1:REMINDER:B:1', 'role-5:L1:FIRST:G,H:2']);
    expect(emails(aws)[0].from).toBe('directory@example.com');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('suggested-candidates email done: run run-1'));
  });

  it('emails leads of every team when the allowlist is *', async () => {
    process.env.JOB_MATCH_EMAIL_TEAM_UIDS = '*';
    const { service, aws } = world();
    const result = await service.sendForRun('run-1');

    // As above, plus role-2: team-2 is not listed by uid, but * lets it through. role-3 is still closed.
    expect(recipients(aws)).toEqual([
      'l1@x:1 new match for Backend Engineer',
      'l1@x:Top matches for your Designer role',
      'l1@x:Top matches for your Rust Engineer role',
      'l1@x:Your top matches for Old news are waiting',
    ]);
    expect(result).toEqual({ runUid: 'run-1', dryRun: false, sent: 4, skipped: 3 });
  });

  it('names only new, listed, looking candidates in rank order', async () => {
    const { service, aws } = world();
    await service.sendForRun('run-1');
    const role1 = emailFor(aws, 'Backend');
    // A was emailed to L1 last run, C is "Not looking", E is deleted, D is below the threshold: only B is new.
    expect(role1.text).toContain('Bob');
    // Each candidate opens a line of their name, then " · Strong match" for a Strong one (LAB-2837 feedback);
    // a bare substring check would trip on "Edit criteria".
    const cardLine = (name: string) => new RegExp(`^${name}( · Strong match)?$`, 'm');
    expect(role1.text).toMatch(cardLine('Bob'));
    for (const name of ['Ada', 'Cy', 'Ed', 'Di']) expect(role1.text).not.toMatch(cardLine(name));
    expect(role1.text).toContain('All top matches for this role');
    expect(role1.text).not.toMatch(/NOT_LOOKING|ACTIVELY_LOOKING|looking/i);
    // A is listed and was already seen; C is listed but "Not looking", so it is not counted.
    expect(role1.text).toContain("Plus 1 match you've already seen is still on the list.");

    const role5 = emailFor(aws, 'Rust');
    expect(role5.text.indexOf('Gus')).toBeLessThan(role5.text.indexOf('Hal'));
    expect(role5.text).toContain('Hi Lead,');
    expect(role5.text).toContain('Acme Labs');
  });

  /* LAB-2837 feedback: the kind is judged against what each lead was already emailed for the role. */
  describe('first, new or reminder', () => {
    const sendsOf = (sends: { runUid: string; roleUid: string; recipientUid: string; kind: string }[]) =>
      sends
        .filter((send) => send.runUid === 'run-1')
        .map((send) => `${send.roleUid}:${send.recipientUid}:${send.kind}`);

    it('leaves contacted people out of a reminder, and sends none when everyone was contacted', async () => {
      const { service, aws, contacts, sends } = world();
      contacts.push({ roleUid: 'role-4', memberUid: 'B' });
      await service.sendForRun('run-1');
      expect(recipients(aws).some((r) => r.includes('Old news'))).toBe(false);
      expect(sendsOf(sends)).not.toContain('role-4:L1:REMINDER');
    });

    it('sends one reminder, then nothing until someone new appears', async () => {
      const { service, aws, sends } = world();
      // Pushed after the first, so a service that forgot to sort newest first would read the first as latest.
      sends.push({
        uid: 'send-r',
        runUid: 'run-0b',
        roleUid: 'role-4',
        recipientUid: 'L1',
        kind: 'REMINDER',
        memberUids: ['B'],
        sentAt: day(8),
      });
      await service.sendForRun('run-1');
      expect(recipients(aws).some((r) => r.includes('Old news'))).toBe(false);
    });

    it('judges each lead by their own emails: a co-lead never emailed gets a first', async () => {
      const { service, aws, settings } = world();
      settings.set('L2', true);
      await service.sendForRun('run-1');
      expect(recipients(aws)).toEqual(
        expect.arrayContaining([
          'l1@x:1 new match for Backend Engineer',
          'l2@x:Top matches for your Backend Engineer role',
        ])
      );
    });

    it('treats a send row from before kinds existed (no members) as no history', async () => {
      const { service, aws, sends } = world();
      sends.splice(0, sends.length, {
        uid: 'legacy',
        runUid: 'run-0',
        roleUid: 'role-1',
        recipientUid: 'L1',
        kind: 'FIRST',
        memberUids: [],
        sentAt: day(5),
      });
      await service.sendForRun('run-1');
      expect(recipients(aws)).toContain('l1@x:Top matches for your Backend Engineer role');
    });
  });

  describe('card details (LAB-2865)', () => {
    it("gives each card the member's location and the stored criteria, labelled from the role's current posting", async () => {
      const { service, aws } = world();
      await service.sendForRun('run-1');
      const { text, html } = emailFor(aws, 'Backend');
      expect(text).toContain(
        '\nBob\nEngineer\nBoston, United States\nWhy we suggested:\n' +
          '✓ Distributed systems: Has run a distributed system\n– Rust: Writes Rust in production (not met)\n'
      );
      // The newer CRITERIA row belongs to an older posting (another hash): its label is never used.
      expect(html).not.toContain('Stale label');
    });

    it('shows unlabelled statements when the role has no criteria row, and skips blank location parts', async () => {
      const { service, aws } = world();
      await service.sendForRun('run-1');
      const { text } = emailFor(aws, 'Rust');
      expect(text).toContain('\nGus\nEngineer\nGermany\nWhy we suggested:\n');
      expect(text).toContain('✓ Has run a distributed system\n– Writes Rust in production (not met)\n');
      expect(text).toContain('Hal · Strong match\nEngineer\nWhy we suggested:');
    });

    it('reads no criteria in a dry run', async () => {
      process.env.JOB_MATCH_EMAIL_DRY_RUN = 'true';
      const { service, prisma } = world();
      await service.sendForRun('run-1');
      const kinds = prisma.jobMatchRow.findFirst.mock.calls.map(([args]) => args.where.kind);
      expect(kinds).not.toContain('CRITERIA');
    });
  });

  describe('locationText', () => {
    it.each([
      [{ city: 'Boston', country: 'United States' }, 'Boston, United States'],
      [{ city: null, country: 'Germany' }, 'Germany'],
      [{ city: 'Lisbon', country: '' }, 'Lisbon'],
      [{ city: ' ', country: ' ' }, null],
      [null, null],
      [undefined, null],
    ])('%j -> %j', (location, expected) => {
      expect(locationText(location)).toBe(expected);
    });
  });

  it('links to email preferences and a working unsubscribe token for the lead', async () => {
    const { service, aws } = world();
    await service.sendForRun('run-1');
    const { text } = emails(aws)[0];
    expect(text).toContain('https://directory.example/settings/email\n');
    const match = text.match(/https:\/\/directory\.example\/settings\/email\/unsubscribed\?token=(\S+)/);
    if (!match) throw new Error('no unsubscribe link');
    expect(verifySuggestedCandidatesUnsubscribeToken(decodeURIComponent(match[1])).memberUid).toBe('L1');
  });

  it('emails a lead without a settings row and skips one who opted out', async () => {
    const { service, aws, settings } = world();
    settings.set('L2', true);
    await service.sendForRun('run-1');
    // L2 was never emailed about any role, so each email is a "first".
    expect(recipients(aws).filter((r) => r.startsWith('l2@x'))).toEqual([
      'l2@x:Top matches for your Backend Engineer role',
      'l2@x:Top matches for your Old news role',
      'l2@x:Top matches for your Rust Engineer role',
    ]);
  });

  it('does not repeat a send for the same run, role and lead', async () => {
    const { service, aws } = world();
    await service.sendForRun('run-1');
    aws.sendHtmlEmail.mockClear();
    await expect(service.sendForRun('run-1')).resolves.toMatchObject({ sent: 0, skipped: 6 });
    expect(aws.sendHtmlEmail).not.toHaveBeenCalled();
  });

  it('skips a lead whose claim another send already took (P2002)', async () => {
    const { service, aws, prisma } = world();
    prisma.jobMatchEmailSend.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    const result = await service.sendForRun('run-1');
    expect(aws.sendHtmlEmail).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ sent: 2, skipped: 4 });
  });

  it('drops the claim when SES fails, so the next send retries', async () => {
    const { service, aws, sends } = world();
    aws.sendHtmlEmail.mockRejectedValueOnce(new Error('SES down'));
    const thisRun = () => sends.filter((send) => send.runUid === 'run-1');
    const first = await service.sendForRun('run-1');
    expect(first).toMatchObject({ sent: 2, skipped: 4 });
    expect(thisRun()).toHaveLength(2);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('SES down'));

    aws.sendHtmlEmail.mockClear();
    const second = await service.sendForRun('run-1');
    expect(second.sent).toBe(1);
    expect(aws.sendHtmlEmail).toHaveBeenCalledTimes(1);
    expect(thisRun()).toHaveLength(3);
  });

  it('dry run logs each recipient and role, and sends and records nothing (no secret or base URL needed)', async () => {
    process.env.JOB_MATCH_EMAIL_DRY_RUN = 'true';
    delete process.env.SUGGESTED_CANDIDATES_TOKEN_SECRET;
    delete process.env.WEB_UI_BASE_URL;
    delete process.env.APPLICATION_BASE_URL;
    const { service, aws, sends, prisma } = world();
    await expect(service.sendForRun('run-1')).resolves.toEqual({ runUid: 'run-1', dryRun: true, sent: 3, skipped: 3 });
    expect(aws.sendHtmlEmail).not.toHaveBeenCalled();
    expect(prisma.jobMatchEmailSend.create).not.toHaveBeenCalled();
    expect(sends.filter((send) => send.runUid === 'run-1')).toHaveLength(0);
    expect(log).toHaveBeenCalledWith(
      'DRY RUN would email L1 l1@x about role role-1 "Backend Engineer" (team team-1): new, 1 named of 3 listed'
    );
    expect(log).toHaveBeenCalledWith(
      'DRY RUN would email L1 l1@x about role role-4 "Old news" (team team-1): reminder, 1 named of 1 listed'
    );
    expect(log).toHaveBeenCalledWith(
      'DRY RUN would email L1 l1@x about role role-5 "Rust Engineer" (team team-1): first, 2 named of 2 listed'
    );
  });

  it('writes a preview and records nothing when IS_EMAIL_ENABLED is off', async () => {
    const { service, aws, sends } = world();
    aws.isEmailServiceEnabled.mockReturnValue(false);
    await expect(service.sendForRun('run-1')).resolves.toMatchObject({ sent: 3, dryRun: false });
    expect(aws.sendHtmlEmail).not.toHaveBeenCalled();
    expect(sends.filter((send) => send.runUid === 'run-1')).toHaveLength(0);
    expect(writeFile).toHaveBeenCalledTimes(3);
    expect(String(writeFile.mock.calls[0][1])).toContain('/settings/email/unsubscribed?token=');
  });

  it('aborts a real send when the token secret is missing', async () => {
    delete process.env.SUGGESTED_CANDIDATES_TOKEN_SECRET;
    const { service, aws, sends } = world();
    await expect(service.sendForRun('run-1')).rejects.toThrow(/SUGGESTED_CANDIDATES_TOKEN_SECRET/);
    expect(aws.sendHtmlEmail).not.toHaveBeenCalled();
    expect(sends.filter((send) => send.runUid === 'run-1')).toHaveLength(0);
  });

  it('logs and swallows an error from the event handler', async () => {
    delete process.env.SUGGESTED_CANDIDATES_TOKEN_SECRET;
    const { service } = world();
    await expect(
      service.onRunCompleted({ runUid: 'run-1', runDate: '2026-10-12', completedAt: day(12).toISOString() })
    ).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('suggested-candidates email for run run-1 failed'));
  });

  describe('analytics (LAB-2853)', () => {
    const sentEvent = (recipientUid: string, roleUid: string, kind: string, candidateCount: number) => ({
      name: 'suggested-candidates-email-sent',
      distinctId: recipientUid,
      properties: {
        role_uid: roleUid,
        team_uid: 'team-1',
        run_uid: 'run-1',
        email_kind: kind,
        candidate_count: candidateCount,
      },
    });

    it('tracks one suggested-candidates-email-sent per delivered email, to the lead, with its kind', async () => {
      const { service, analytics } = world();
      await service.sendForRun('run-1');
      expect(analytics.trackEvent).toHaveBeenCalledTimes(3);
      expect(analytics.trackEvent).toHaveBeenCalledWith(sentEvent('L1', 'role-1', 'new', 1));
      expect(analytics.trackEvent).toHaveBeenCalledWith(sentEvent('L1', 'role-4', 'reminder', 1));
      expect(analytics.trackEvent).toHaveBeenCalledWith(sentEvent('L1', 'role-5', 'first', 2));
    });

    it('tracks nothing for a dry run or a preview', async () => {
      process.env.JOB_MATCH_EMAIL_DRY_RUN = 'true';
      const dry = world();
      await dry.service.sendForRun('run-1');
      expect(dry.analytics.trackEvent).not.toHaveBeenCalled();

      delete process.env.JOB_MATCH_EMAIL_DRY_RUN;
      const preview = world();
      preview.aws.isEmailServiceEnabled.mockReturnValue(false);
      await preview.service.sendForRun('run-1');
      expect(preview.analytics.trackEvent).not.toHaveBeenCalled();
    });

    it('tracks nothing for a failed or already-claimed send', async () => {
      const { service, aws, analytics, prisma } = world();
      aws.sendHtmlEmail.mockRejectedValueOnce(new Error('SES down'));
      prisma.jobMatchEmailSend.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
      // role-1's claim is taken, role-4's send fails: only role-5 is delivered and tracked.
      await expect(service.sendForRun('run-1')).resolves.toMatchObject({ sent: 1, skipped: 5 });
      expect(analytics.trackEvent).toHaveBeenCalledTimes(1);
      expect(analytics.trackEvent).toHaveBeenCalledWith(sentEvent('L1', 'role-5', 'first', 2));
    });

    it('still sends and counts every email when tracking throws or rejects, and logs the failure', async () => {
      const { service, aws, analytics, sends } = world();
      analytics.trackEvent
        .mockImplementationOnce(() => {
          throw new Error('posthog exploded');
        })
        .mockRejectedValueOnce(new Error('posthog unreachable'));
      await expect(service.sendForRun('run-1')).resolves.toMatchObject({ sent: 3, skipped: 3 });
      expect(aws.sendHtmlEmail).toHaveBeenCalledTimes(3);
      expect(sends.filter((send) => send.runUid === 'run-1')).toHaveLength(3);
      await new Promise((resolve) => setImmediate(resolve));
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('posthog exploded'));
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('posthog unreachable'));
    });
  });

  describe('completedRun', () => {
    it('reads the given run only when COMPLETED, else the latest COMPLETED run', async () => {
      const { service, prisma } = world();
      prisma.jobMatchRun.findFirst.mockResolvedValue({ uid: 'run-1' });
      await service.completedRun('run-1');
      expect(prisma.jobMatchRun.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { uid: 'run-1', status: 'COMPLETED' } })
      );
      await service.completedRun();
      expect(prisma.jobMatchRun.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { status: 'COMPLETED' }, orderBy: { runDate: 'desc' } })
      );
    });
  });
});
