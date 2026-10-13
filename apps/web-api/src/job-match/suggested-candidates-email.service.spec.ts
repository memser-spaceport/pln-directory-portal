// Preview files are not written to disk in tests; fs exports are not spy-able, so the module is mocked.
jest.mock('fs', () => ({ ...jest.requireActual('fs'), writeFileSync: jest.fn() }));

import * as fs from 'fs';
import { Logger } from '@nestjs/common';
import { SuggestedCandidatesEmailPreferenceService } from '../notification-settings/suggested-candidates-email-preference.service';
import { SuggestedCandidatesEmailService } from './suggested-candidates-email.service';
import { verifySuggestedCandidatesUnsubscribeToken } from './suggested-candidates-token.util';

/**
 * In-memory Prisma fake. It applies only the filters the service actually sends (lead flag, end date, deleted
 * member, missing email, NOT_LOOKING, ...), so dropping a filter from the service makes a test fail.
 */
type Row = {
  kind: 'ROLE' | 'SUGGESTION';
  runUid: string;
  roleUid: string;
  memberUid?: string;
  rank?: number;
  fit?: number;
  label?: 'STRONG' | 'GOOD';
  blurb?: string | null;
  createdAt: Date;
};

type SentEmail = { from: string; to: string[]; subject: string; html: string; text: string };

const day = (n: number) => new Date(Date.UTC(2026, 9, n));
const LIVE = { status: 'CONFIRMED', publishedAt: day(1) };

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
    { uid: 'role-1', roleTitle: 'Backend Engineer', companyName: 'Acme', teamUid: 'team-1', ...LIVE },
    { uid: 'role-2', roleTitle: 'Designer', companyName: 'Other', teamUid: 'team-2', ...LIVE },
    {
      uid: 'role-3',
      roleTitle: 'Closed role',
      companyName: 'Acme',
      teamUid: 'team-1',
      status: 'CLOSED_ROLE_FILLED',
      publishedAt: day(1),
    },
    { uid: 'role-4', roleTitle: 'Old news', companyName: 'Acme', teamUid: 'team-1', ...LIVE },
    { uid: 'role-5', roleTitle: 'Rust Engineer', companyName: 'Acme', teamUid: 'team-1', ...LIVE },
  ];

  const members: Record<
    string,
    { name: string; deletedAt: Date | null; jobSearchStatus?: string; email: string | null }
  > = {
    A: { name: 'Ada', deletedAt: null, email: 'a@x' },
    B: { name: 'Bob', deletedAt: null, jobSearchStatus: 'ACTIVELY_LOOKING', email: 'b@x' },
    C: { name: 'Cy', deletedAt: null, jobSearchStatus: 'NOT_LOOKING', email: 'c@x' },
    D: { name: 'Di', deletedAt: null, email: 'd@x' },
    E: { name: 'Ed', deletedAt: day(2), email: 'e@x' },
    G: { name: 'Gus', deletedAt: null, email: 'g@x' },
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
  const sends: { uid: string; runUid: string; roleUid: string; recipientUid: string }[] = [];
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
    jobMatchEmailSend: {
      findMany: jest.fn(async ({ where }) =>
        sends.filter((send) => send.runUid === where.runUid && send.roleUid === where.roleUid)
      ),
      create: jest.fn(async ({ data }) => {
        if (
          sends.some(
            (send) =>
              send.runUid === data.runUid && send.roleUid === data.roleUid && send.recipientUid === data.recipientUid
          )
        ) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const row = { uid: `send-${++sendSeq}`, ...data };
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
  const service = new SuggestedCandidatesEmailService(
    prisma as never,
    aws as never,
    new SuggestedCandidatesEmailPreferenceService(prisma as never)
  );
  return { service, prisma, aws, sends, settings };
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

  it('emails only current, opted-in leads of live allowlisted roles with new suggestions, one email per role', async () => {
    const { service, aws, sends } = world();
    const result = await service.sendForRun('run-1');

    // L1 gets role-1 and role-5. L2 opted out (skipped twice). L3 former, L4 deleted, L5 no email, M1 not a lead.
    // role-2 (team-2, not allowlisted), role-3 (closed) and role-4 (nothing new) send nothing.
    expect(recipients(aws)).toEqual([
      'l1@x:1 new suggested candidate for Backend Engineer',
      'l1@x:2 new suggested candidates for Rust Engineer',
    ]);
    expect(result).toEqual({ runUid: 'run-1', dryRun: false, sent: 2, skipped: 2 });
    expect(sends.map((send) => `${send.roleUid}:${send.recipientUid}`).sort()).toEqual(['role-1:L1', 'role-5:L1']);
    expect(emails(aws)[0].from).toBe('directory@example.com');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('suggested-candidates email done: run run-1'));
  });

  it('names only new, listed, looking candidates in rank order and states the listed total', async () => {
    const { service, aws } = world();
    await service.sendForRun('run-1');
    const role1 = emailFor(aws, 'Backend');
    // A was suggested last run, C is "Not looking", E is deleted, D is below the threshold: only B is new.
    expect(role1.text).toContain('Bob');
    for (const name of ['Ada', 'Cy', 'Ed', 'Di']) expect(role1.text).not.toContain(name);
    expect(role1.text).toContain('lists 3 in total');
    expect(role1.text).not.toMatch(/NOT_LOOKING|ACTIVELY_LOOKING|looking/i);

    const role5 = emailFor(aws, 'Rust');
    expect(role5.text.indexOf('Gus')).toBeLessThan(role5.text.indexOf('Hal'));
    expect(role5.text).toContain('Hi Lead One');
    expect(role5.text).toContain('Acme Labs');
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
    expect(recipients(aws).filter((r) => r.startsWith('l2@x'))).toHaveLength(2);
  });

  it('does not repeat a send for the same run, role and lead', async () => {
    const { service, aws } = world();
    await service.sendForRun('run-1');
    aws.sendHtmlEmail.mockClear();
    await expect(service.sendForRun('run-1')).resolves.toMatchObject({ sent: 0, skipped: 4 });
    expect(aws.sendHtmlEmail).not.toHaveBeenCalled();
  });

  it('skips a lead whose claim another send already took (P2002)', async () => {
    const { service, aws, prisma } = world();
    prisma.jobMatchEmailSend.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    const result = await service.sendForRun('run-1');
    expect(aws.sendHtmlEmail).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ sent: 1, skipped: 3 });
  });

  it('drops the claim when SES fails, so the next send retries', async () => {
    const { service, aws, sends } = world();
    aws.sendHtmlEmail.mockRejectedValueOnce(new Error('SES down'));
    const first = await service.sendForRun('run-1');
    expect(first).toMatchObject({ sent: 1, skipped: 3 });
    expect(sends).toHaveLength(1);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('SES down'));

    aws.sendHtmlEmail.mockClear();
    const second = await service.sendForRun('run-1');
    expect(second.sent).toBe(1);
    expect(aws.sendHtmlEmail).toHaveBeenCalledTimes(1);
    expect(sends).toHaveLength(2);
  });

  it('dry run logs each recipient and role, and sends and records nothing (no secret or base URL needed)', async () => {
    process.env.JOB_MATCH_EMAIL_DRY_RUN = 'true';
    delete process.env.SUGGESTED_CANDIDATES_TOKEN_SECRET;
    delete process.env.WEB_UI_BASE_URL;
    delete process.env.APPLICATION_BASE_URL;
    const { service, aws, sends, prisma } = world();
    await expect(service.sendForRun('run-1')).resolves.toEqual({ runUid: 'run-1', dryRun: true, sent: 2, skipped: 2 });
    expect(aws.sendHtmlEmail).not.toHaveBeenCalled();
    expect(prisma.jobMatchEmailSend.create).not.toHaveBeenCalled();
    expect(sends).toHaveLength(0);
    expect(log).toHaveBeenCalledWith(
      'DRY RUN would email L1 l1@x about role role-1 "Backend Engineer" (team team-1): 1 new of 3'
    );
    expect(log).toHaveBeenCalledWith(
      'DRY RUN would email L1 l1@x about role role-5 "Rust Engineer" (team team-1): 2 new of 2'
    );
  });

  it('writes a preview and records nothing when IS_EMAIL_ENABLED is off', async () => {
    const { service, aws, sends } = world();
    aws.isEmailServiceEnabled.mockReturnValue(false);
    await expect(service.sendForRun('run-1')).resolves.toMatchObject({ sent: 2, dryRun: false });
    expect(aws.sendHtmlEmail).not.toHaveBeenCalled();
    expect(sends).toHaveLength(0);
    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(String(writeFile.mock.calls[0][1])).toContain('/settings/email/unsubscribed?token=');
  });

  it('aborts a real send when the token secret is missing', async () => {
    delete process.env.SUGGESTED_CANDIDATES_TOKEN_SECRET;
    const { service, aws, sends } = world();
    await expect(service.sendForRun('run-1')).rejects.toThrow(/SUGGESTED_CANDIDATES_TOKEN_SECRET/);
    expect(aws.sendHtmlEmail).not.toHaveBeenCalled();
    expect(sends).toHaveLength(0);
  });

  it('logs and swallows an error from the event handler', async () => {
    delete process.env.SUGGESTED_CANDIDATES_TOKEN_SECRET;
    const { service } = world();
    await expect(
      service.onRunCompleted({ runUid: 'run-1', runDate: '2026-10-12', completedAt: day(12).toISOString() })
    ).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('suggested-candidates email for run run-1 failed'));
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
