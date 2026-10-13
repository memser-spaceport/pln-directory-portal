jest.mock('../members/members.service', () => ({ MembersService: class MembersService {} }));
jest.mock('ai', () => ({ generateText: jest.fn() }));
jest.mock('./emails/candidate-intro-email', () => {
  const actual = jest.requireActual('./emails/candidate-intro-email');
  return { ...actual, renderCandidateIntroEmail: jest.fn(actual.renderCandidateIntroEmail) };
});

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { JobOpeningStatus } from '@prisma/client';
import { JobMatchService } from './job-match.service';
import { JobMatchRunner } from './job-match-runner.service';
import { rolePosting, roleTextHash } from './job-match.logic';
import { renderCandidateIntroEmail } from './emails/candidate-intro-email';

const posting = {
  roleTitle: 'Backend Engineer',
  companyName: 'Prime Intellect',
  roleCategory: null,
  seniority: 'Senior',
  summary: null,
  descriptionHtml: '<p>Rust</p>',
  location: ['Remote'],
  workMode: null,
};

describe('JobMatchService', () => {
  const findMemberByEmail = jest.fn();
  const jobOpeningFindUnique = jest.fn();
  const teamMemberRoleFindFirst = jest.fn();
  const jobMatchRowFindFirst = jest.fn();
  const jobMatchRowFindMany = jest.fn();
  const memberFindMany = jest.fn();
  const memberFindUnique = jest.fn();
  const teamFindUnique = jest.fn();
  const contactFindMany = jest.fn();
  const contactCreate = jest.fn();
  const contactDelete = jest.fn();
  const overrideFindUnique = jest.fn();
  const overrideUpsert = jest.fn();
  const isEmailServiceEnabled = jest.fn();
  const sendHtmlEmail = jest.fn();

  const prisma = {
    jobOpening: { findUnique: jobOpeningFindUnique },
    teamMemberRole: { findFirst: teamMemberRoleFindFirst },
    jobMatchRow: { findFirst: jobMatchRowFindFirst, findMany: jobMatchRowFindMany },
    member: { findMany: memberFindMany, findUnique: memberFindUnique },
    team: { findUnique: teamFindUnique },
    jobMatchContact: { findMany: contactFindMany, create: contactCreate, delete: contactDelete },
    jobMatchCriteriaOverride: { findUnique: overrideFindUnique, upsert: overrideUpsert },
  };

  const service = new JobMatchService(
    prisma as never,
    { findMemberByEmail } as never,
    { isEmailServiceEnabled, sendHtmlEmail } as never
  );

  const env = { ...process.env };

  beforeEach(() => {
    jest.resetAllMocks();
    // resetAllMocks drops the pass-through implementation, so restore the real renderer.
    (renderCandidateIntroEmail as jest.Mock).mockImplementation(
      jest.requireActual('./emails/candidate-intro-email').renderCandidateIntroEmail
    );
    contactFindMany.mockResolvedValue([]);
    overrideFindUnique.mockResolvedValue(null);
    process.env.WEB_UI_BASE_URL = 'https://directory.example';
    process.env.SES_SOURCE_EMAIL = 'directory@example.com';
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it('refuses a caller who is not a current member of the hiring team', async () => {
    findMemberByEmail.mockResolvedValue({ uid: 'member-1', isDirectoryAdmin: false });
    jobOpeningFindUnique.mockResolvedValue({
      ...posting,
      uid: 'role-1',
      teamUid: 'team-1',
      status: JobOpeningStatus.CONFIRMED,
      publishedAt: new Date(),
    });
    teamMemberRoleFindFirst.mockResolvedValue(null);
    await expect(service.listForRole('role-1', 'person@example.com')).rejects.toBeInstanceOf(ForbiddenException);
    expect(jobMatchRowFindFirst).not.toHaveBeenCalled();
  });

  it('returns an empty list for a role that is not live', async () => {
    findMemberByEmail.mockResolvedValue({ uid: 'admin-1', isDirectoryAdmin: true });
    jobOpeningFindUnique.mockResolvedValue({
      ...posting,
      uid: 'role-1',
      teamUid: 'team-1',
      status: JobOpeningStatus.STALE,
      publishedAt: new Date(),
    });
    await expect(service.listForRole('role-1', 'admin@example.com')).resolves.toEqual({
      suggestions: [],
      criteria: [],
    });
    expect(jobMatchRowFindFirst).not.toHaveBeenCalled();
  });

  it('returns the stored top 5 for a live role without calling a model', async () => {
    findMemberByEmail.mockResolvedValue({ uid: 'member-1', isDirectoryAdmin: false });
    jobOpeningFindUnique.mockResolvedValue({
      ...posting,
      uid: 'role-1',
      teamUid: 'team-1',
      status: JobOpeningStatus.CONFIRMED,
      publishedAt: new Date(),
    });
    teamMemberRoleFindFirst.mockResolvedValue({ id: 1 });
    jobMatchRowFindFirst.mockResolvedValue({ runUid: 'run-1' });
    jobMatchRowFindMany.mockResolvedValue([
      {
        memberUid: 'cand-1',
        rank: 1,
        fit: 91,
        label: 'STRONG',
        blurb: 'Knows Go.',
        payload: [{ text: 'Go', matched: true }],
        interested: true,
        interestNote: 'Love this role.',
      },
    ]);
    memberFindMany.mockResolvedValue([
      { uid: 'cand-1', name: 'Ada Lovelace', role: 'Engineer', image: { url: 'https://img' } },
    ]);

    await expect(service.listForRole('role-1', 'lead@example.com')).resolves.toEqual({
      suggestions: [
        {
          memberUid: 'cand-1',
          name: 'Ada Lovelace',
          role: 'Engineer',
          imageUrl: 'https://img',
          fit: 91,
          label: 'Strong match',
          rank: 1,
          blurb: 'Knows Go.',
          criteria: [{ text: 'Go', matched: true }],
          interested: true,
          note: 'Love this role.',
          contactedAt: null,
        },
      ],
      criteria: [],
    });
    expect(jobMatchRowFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { kind: 'SUGGESTION', runUid: 'run-1', roleUid: 'role-1' },
        take: 5,
        orderBy: { rank: 'asc' },
      })
    );
  });

  it('returns note null for a member who is not interested, also if a note was stored (LAB-2802)', async () => {
    findMemberByEmail.mockResolvedValue({ uid: 'admin-1', isDirectoryAdmin: true });
    jobOpeningFindUnique.mockResolvedValue({
      ...posting,
      uid: 'role-1',
      teamUid: 'team-1',
      status: JobOpeningStatus.CONFIRMED,
      publishedAt: new Date(),
    });
    jobMatchRowFindFirst.mockResolvedValue({ runUid: 'run-1' });
    jobMatchRowFindMany.mockResolvedValue([
      {
        memberUid: 'cand-1',
        rank: 1,
        fit: 91,
        label: 'STRONG',
        blurb: null,
        payload: [],
        interested: false,
        interestNote: 'x',
      },
      {
        memberUid: 'cand-2',
        rank: 2,
        fit: 80,
        label: 'STRONG',
        blurb: null,
        payload: [],
        interested: true,
        interestNote: null,
      },
    ]);
    memberFindMany.mockResolvedValue([
      { uid: 'cand-1', name: 'Ada', role: null, image: null },
      { uid: 'cand-2', name: 'Grace', role: null, image: null },
    ]);

    const { suggestions } = await service.listForRole('role-1', 'admin@example.com');
    expect(suggestions.map((row) => [row.memberUid, row.interested, row.note])).toEqual([
      ['cand-1', false, null],
      ['cand-2', true, null],
    ]);
  });

  describe('suggestedCounts', () => {
    const live = { teamUid: 'team-1', status: JobOpeningStatus.CONFIRMED, publishedAt: new Date() };

    it('counts what the Suggested tab lists, for live roles only', async () => {
      jobMatchRowFindFirst.mockResolvedValue({ runUid: 'run-1' });
      jobMatchRowFindMany.mockResolvedValue([
        { memberUid: 'cand-1', rank: 1, fit: 91, label: 'STRONG' },
        { memberUid: 'cand-2', rank: 2, fit: 40, label: 'GOOD' },
        { memberUid: 'cand-gone', rank: 3, fit: 80, label: 'GOOD' },
      ]);
      memberFindMany.mockResolvedValue([
        { uid: 'cand-1', name: 'Ada', role: null, image: null },
        { uid: 'cand-2', name: 'Grace', role: null, image: null },
      ]);

      const counts = await service.suggestedCounts([
        { uid: 'role-1', ...live },
        { uid: 'role-hidden', ...live, status: JobOpeningStatus.STALE },
        { uid: 'role-draft', ...live, publishedAt: null },
      ]);

      expect([...counts]).toEqual([['role-1', 1]]);
      expect(jobMatchRowFindFirst).toHaveBeenCalledTimes(1);
    });

    it('leaves out a role the matcher has not run for', async () => {
      jobMatchRowFindFirst.mockResolvedValue(null);

      const counts = await service.suggestedCounts([{ uid: 'role-1', ...live }]);

      expect(counts.size).toBe(0);
    });
  });

  it('404s when the role does not exist', async () => {
    findMemberByEmail.mockResolvedValue({ uid: 'admin-1', isDirectoryAdmin: true });
    jobOpeningFindUnique.mockResolvedValue(null);
    await expect(service.listForRole('missing', 'admin@example.com')).rejects.toBeInstanceOf(NotFoundException);
  });
  describe('lead actions (LAB-2846)', () => {
    const criteria = ['Rust', '5+ years', 'Remote EU'];
    const liveJob = {
      ...posting,
      uid: 'role-1',
      teamUid: 'team-1',
      status: JobOpeningStatus.CONFIRMED,
      publishedAt: new Date(),
    };
    const hash = roleTextHash(rolePosting({ uid: 'role-1', ...posting }));
    const lead = { uid: 'lead-1', name: 'Ada Lead', email: 'lead@example.com', isDirectoryAdmin: false };
    const admin = { uid: 'admin-1', name: 'Admin', email: 'admin@example.com', isDirectoryAdmin: true };
    const now = Date.now();
    const roles = [
      { teamUid: 'team-1', memberUid: 'lead-1', teamLead: true, endDate: null as Date | null },
      { teamUid: 'team-1', memberUid: 'ex-lead', teamLead: true, endDate: new Date(now - 86_400_000) },
      { teamUid: 'team-1', memberUid: 'future-lead', teamLead: true, endDate: new Date(now + 86_400_000) },
      { teamUid: 'team-1', memberUid: 'member-1', teamLead: false, endDate: null as Date | null },
    ];

    function withTeamRoles() {
      // Evaluates the where clause the service sends, so the lead and endDate rules are tested, not assumed.
      teamMemberRoleFindFirst.mockImplementation(
        async ({ where }: { where: { teamUid: string; memberUid: string; teamLead?: boolean; OR: unknown } }) => {
          const hit = roles.find(
            (row) =>
              row.teamUid === where.teamUid &&
              row.memberUid === where.memberUid &&
              (where.teamLead === undefined || row.teamLead === where.teamLead) &&
              (row.endDate === null || row.endDate.getTime() >= Date.now())
          );
          expect(where.OR).toEqual([{ endDate: null }, { endDate: { gte: expect.any(Date) } }]);
          return hit ? { id: 1 } : null;
        }
      );
    }

    function withStored(options: { criteria?: string[] | null; suggested?: string[] } = {}) {
      const suggested = options.suggested ?? ['cand-1', 'cand-2'];
      jobMatchRowFindFirst.mockImplementation(async ({ where }: { where: { kind: string } }) => {
        if (where.kind === 'ROLE') return { runUid: 'run-1' };
        if (where.kind === 'CRITERIA')
          return options.criteria === null ? null : { payload: options.criteria ?? criteria };
        return null;
      });
      jobMatchRowFindMany.mockResolvedValue(
        suggested.map((memberUid, index) => ({
          memberUid,
          rank: index + 1,
          fit: 90 - index,
          label: 'STRONG',
          blurb: null,
          payload: [],
          interested: false,
          interestNote: null,
        }))
      );
      memberFindMany.mockResolvedValue(suggested.map((uid) => ({ uid, name: uid, role: null, image: null })));
    }

    beforeEach(() => {
      jobOpeningFindUnique.mockResolvedValue(liveJob);
      withTeamRoles();
      withStored();
    });

    describe('assertCanAct', () => {
      it('allows a current team lead', async () => {
        findMemberByEmail.mockResolvedValue(lead);
        await expect(service.assertCanAct(liveJob, 'lead@example.com')).resolves.toBe(lead);
        expect(teamMemberRoleFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ teamLead: true }) })
        );
      });

      it('allows a lead whose end date is in the future', async () => {
        const future = { ...lead, uid: 'future-lead' };
        findMemberByEmail.mockResolvedValue(future);
        await expect(service.assertCanAct(liveJob, 'f@example.com')).resolves.toBe(future);
      });

      it('refuses a lead whose end date has passed', async () => {
        findMemberByEmail.mockResolvedValue({ ...lead, uid: 'ex-lead' });
        await expect(service.assertCanAct(liveJob, 'ex@example.com')).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('allows a directory admin who is not on the team', async () => {
        findMemberByEmail.mockResolvedValue(admin);
        await expect(service.assertCanAct(liveJob, 'admin@example.com')).resolves.toBe(admin);
        expect(teamMemberRoleFindFirst).not.toHaveBeenCalled();
      });

      it('refuses a current member who is not a lead', async () => {
        findMemberByEmail.mockResolvedValue({ ...lead, uid: 'member-1' });
        await expect(service.assertCanAct(liveJob, 'm@example.com')).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('refuses an unknown caller and a caller without an email', async () => {
        findMemberByEmail.mockResolvedValue(null);
        await expect(service.assertCanAct(liveJob, 'who@example.com')).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.assertCanAct(liveJob, undefined)).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('lets only an admin act on a role without a team', async () => {
        findMemberByEmail.mockResolvedValue(lead);
        await expect(service.assertCanAct({ teamUid: null }, 'lead@example.com')).rejects.toBeInstanceOf(
          ForbiddenException
        );
        findMemberByEmail.mockResolvedValue(admin);
        await expect(service.assertCanAct({ teamUid: null }, 'admin@example.com')).resolves.toBe(admin);
      });
    });

    describe('listForRole', () => {
      beforeEach(() => findMemberByEmail.mockResolvedValue({ ...lead, uid: 'member-1' }));

      it('sets contactedAt for a contacted item and null for the others, reading this role only', async () => {
        const at = new Date('2026-10-13T10:00:00.000Z');
        contactFindMany.mockResolvedValue([{ memberUid: 'cand-2', createdAt: at }]);
        const { suggestions } = await service.listForRole('role-1', 'm@example.com');
        expect(suggestions.map((row) => [row.memberUid, row.contactedAt])).toEqual([
          ['cand-1', null],
          ['cand-2', '2026-10-13T10:00:00.000Z'],
        ]);
        expect(contactFindMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { roleUid: 'role-1', memberUid: { in: ['cand-1', 'cand-2'] } } })
        );
      });

      it('returns the posting criteria in order with a disabled one flagged off', async () => {
        overrideFindUnique.mockResolvedValue({ disabled: ['Remote EU'] });
        const { criteria: listed } = await service.listForRole('role-1', 'm@example.com');
        expect(listed).toEqual([
          { text: 'Rust', enabled: true },
          { text: '5+ years', enabled: true },
          { text: 'Remote EU', enabled: false },
        ]);
        expect(overrideFindUnique).toHaveBeenCalledWith(
          expect.objectContaining({ where: { roleUid_roleTextHash: { roleUid: 'role-1', roleTextHash: hash } } })
        );
      });

      it('returns no criteria when the current posting has no CRITERIA row', async () => {
        withStored({ criteria: null });
        const result = await service.listForRole('role-1', 'm@example.com');
        expect(result.criteria).toEqual([]);
        expect(overrideFindUnique).not.toHaveBeenCalled();
      });

      it("reads the newest CRITERIA row at the current posting's hash", async () => {
        await service.listForRole('role-1', 'm@example.com');
        expect(jobMatchRowFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { kind: 'CRITERIA', roleUid: 'role-1', roleTextHash: hash },
            orderBy: { createdAt: 'desc' },
          })
        );
      });
    });

    it('hashes a posting the same way as the runner (service and runner agree)', async () => {
      findMemberByEmail.mockResolvedValue(admin);
      await service.listForRole('role-1', 'admin@example.com');
      const serviceHash = jobMatchRowFindFirst.mock.calls.find(
        ([args]: [{ where: { kind: string } }]) => args.where.kind === 'CRITERIA'
      )[0].where.roleTextHash;

      const runnerRow = {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ payload: [...criteria, 'Postgres'] }),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        create: jest.fn(),
      };
      const runnerPrisma = {
        jobMatchRow: runnerRow,
        jobOpeningInterest: { findMany: jest.fn().mockResolvedValue([]) },
        teamInterest: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) => fn({ jobMatchRow: runnerRow })),
        jobMatchCriteriaOverride: { findMany: jest.fn().mockResolvedValue([]) },
        // The runner reads jobs with raw SQL; give it the same row, with location as the database returns it.
        $queryRaw: jest.fn(async (strings: TemplateStringsArray) =>
          Array.from(strings).join(' ').includes('"JobOpening"') ? [{ uid: 'role-1', ...posting }] : []
        ),
      };
      const runner = new JobMatchRunner(runnerPrisma as never, {} as never);
      await runner.processTeam('run-1', { uid: 'team-1', name: 'Team' });
      const runnerHashes = runnerPrisma.jobMatchCriteriaOverride.findMany.mock.calls[0][0].where.OR;
      expect(runnerHashes).toEqual([{ roleUid: 'role-1', roleTextHash: serviceHash }]);
      expect(runnerRow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { kind: 'CRITERIA', roleUid: 'role-1', roleTextHash: serviceHash } })
      );
    });

    describe('updateCriteria', () => {
      beforeEach(() => findMemberByEmail.mockResolvedValue(lead));

      it('404s for an unknown role', async () => {
        jobOpeningFindUnique.mockResolvedValue(null);
        await expect(service.updateCriteria('missing', [], 'lead@example.com')).rejects.toBeInstanceOf(
          NotFoundException
        );
        expect(overrideUpsert).not.toHaveBeenCalled();
      });

      it('403s for a member who is not a lead', async () => {
        findMemberByEmail.mockResolvedValue({ ...lead, uid: 'member-1' });
        await expect(service.updateCriteria('role-1', ['Rust'], 'm@example.com')).rejects.toBeInstanceOf(
          ForbiddenException
        );
        expect(overrideUpsert).not.toHaveBeenCalled();
      });

      it('409s when the current posting has no criteria', async () => {
        withStored({ criteria: null });
        await expect(service.updateCriteria('role-1', [], 'lead@example.com')).rejects.toBeInstanceOf(
          ConflictException
        );
        expect(overrideUpsert).not.toHaveBeenCalled();
      });

      it('400s for an unknown criterion', async () => {
        await expect(service.updateCriteria('role-1', ['Kubernetes'], 'lead@example.com')).rejects.toBeInstanceOf(
          BadRequestException
        );
        expect(overrideUpsert).not.toHaveBeenCalled();
      });

      it('400s when every criterion would be disabled', async () => {
        await expect(service.updateCriteria('role-1', criteria, 'lead@example.com')).rejects.toBeInstanceOf(
          BadRequestException
        );
        expect(overrideUpsert).not.toHaveBeenCalled();
      });

      it('trims, dedupes and upserts against the current posting hash', async () => {
        await expect(
          service.updateCriteria('role-1', [' Remote EU ', 'Remote EU'], 'lead@example.com')
        ).resolves.toEqual({
          criteria: [
            { text: 'Rust', enabled: true },
            { text: '5+ years', enabled: true },
            { text: 'Remote EU', enabled: false },
          ],
        });
        expect(overrideUpsert).toHaveBeenCalledWith({
          where: { roleUid_roleTextHash: { roleUid: 'role-1', roleTextHash: hash } },
          create: { roleUid: 'role-1', roleTextHash: hash, disabled: ['Remote EU'], updatedByUid: 'lead-1' },
          update: { disabled: ['Remote EU'], updatedByUid: 'lead-1' },
        });
      });

      it('re-enables everything with an empty list, on a role that is not live', async () => {
        jobOpeningFindUnique.mockResolvedValue({ ...liveJob, status: JobOpeningStatus.STALE });
        const result = await service.updateCriteria('role-1', [], 'lead@example.com');
        expect(result.criteria.every((item) => item.enabled)).toBe(true);
        expect(overrideUpsert).toHaveBeenCalledWith(
          expect.objectContaining({ update: expect.objectContaining({ disabled: [] }) })
        );
      });
    });

    describe('contactCandidate', () => {
      const createdAt = new Date('2026-10-13T12:00:00.000Z');

      beforeEach(() => {
        findMemberByEmail.mockResolvedValue(lead);
        memberFindUnique.mockResolvedValue({ email: 'cand@example.com' });
        teamFindUnique.mockResolvedValue({ name: 'Prime Team' });
        contactCreate.mockResolvedValue({ uid: 'contact-1', createdAt });
        contactDelete.mockResolvedValue({});
        isEmailServiceEnabled.mockReturnValue(true);
        sendHtmlEmail.mockResolvedValue({ MessageId: 'm-1' });
      });

      function expectNothingDone() {
        expect(contactCreate).not.toHaveBeenCalled();
        expect(sendHtmlEmail).not.toHaveBeenCalled();
      }

      it('404s for an unknown role', async () => {
        jobOpeningFindUnique.mockResolvedValue(null);
        await expect(service.contactCandidate('missing', 'cand-1', 'Hi', 'lead@example.com')).rejects.toBeInstanceOf(
          NotFoundException
        );
        expectNothingDone();
      });

      it('403s for a member who is not a lead', async () => {
        findMemberByEmail.mockResolvedValue({ ...lead, uid: 'member-1' });
        await expect(service.contactCandidate('role-1', 'cand-1', 'Hi', 'm@example.com')).rejects.toBeInstanceOf(
          ForbiddenException
        );
        expectNothingDone();
      });

      it('404s for a member who is not a current suggestion', async () => {
        await expect(service.contactCandidate('role-1', 'cand-9', 'Hi', 'lead@example.com')).rejects.toBeInstanceOf(
          NotFoundException
        );
        expectNothingDone();
      });

      it('404s when the role is not live', async () => {
        jobOpeningFindUnique.mockResolvedValue({ ...liveJob, status: JobOpeningStatus.STALE });
        await expect(service.contactCandidate('role-1', 'cand-1', 'Hi', 'lead@example.com')).rejects.toBeInstanceOf(
          NotFoundException
        );
        expectNothingDone();
      });

      it('400s when the candidate has no email', async () => {
        memberFindUnique.mockResolvedValue({ email: null });
        await expect(service.contactCandidate('role-1', 'cand-1', 'Hi', 'lead@example.com')).rejects.toBeInstanceOf(
          BadRequestException
        );
        expectNothingDone();
      });

      it('409s on a second contact and sends nothing', async () => {
        contactCreate.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
        await expect(service.contactCandidate('role-1', 'cand-1', 'Hi', 'lead@example.com')).rejects.toBeInstanceOf(
          ConflictException
        );
        expect(sendHtmlEmail).not.toHaveBeenCalled();
        expect(contactDelete).not.toHaveBeenCalled();
      });

      it('deletes the contact and 500s when the send fails', async () => {
        sendHtmlEmail.mockRejectedValue(new Error('ses down'));
        await expect(service.contactCandidate('role-1', 'cand-1', 'Hi', 'lead@example.com')).rejects.toBeInstanceOf(
          InternalServerErrorException
        );
        expect(contactDelete).toHaveBeenCalledWith({ where: { uid: 'contact-1' } });
      });

      it('keeps the contact and sends nothing when email is disabled', async () => {
        isEmailServiceEnabled.mockReturnValue(false);
        await expect(service.contactCandidate('role-1', 'cand-1', 'Hi', 'lead@example.com')).resolves.toEqual({
          contactedAt: createdAt.toISOString(),
        });
        expect(contactCreate).toHaveBeenCalled();
        expect(sendHtmlEmail).not.toHaveBeenCalled();
        expect(contactDelete).not.toHaveBeenCalled();
      });

      it('records the contact and emails the candidate with Reply-To set to the lead', async () => {
        await expect(
          service.contactCandidate('role-1', 'cand-1', 'Would love to chat.', 'lead@example.com')
        ).resolves.toEqual({ contactedAt: '2026-10-13T12:00:00.000Z' });
        expect(contactCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { roleUid: 'role-1', memberUid: 'cand-1', senderUid: 'lead-1', message: 'Would love to chat.' },
          })
        );
        expect(renderCandidateIntroEmail).toHaveBeenCalledWith({
          leadName: 'Ada Lead',
          leadEmail: 'lead@example.com',
          roleTitle: 'Backend Engineer',
          teamName: 'Prime Team',
          message: 'Would love to chat.',
          roleUrl: 'https://directory.example/jobs/openings/role-1',
          leadProfileUrl: 'https://directory.example/members/lead-1',
        });
        const rendered = (renderCandidateIntroEmail as jest.Mock).mock.results[0].value;
        expect(sendHtmlEmail).toHaveBeenCalledWith({
          from: 'directory@example.com',
          to: ['cand@example.com'],
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          replyTo: 'lead@example.com',
        });
        expect(contactDelete).not.toHaveBeenCalled();
      });

      it('lets an admin contact a candidate, with no Reply-To when the admin has no email', async () => {
        findMemberByEmail.mockResolvedValue({ ...admin, email: null });
        await service.contactCandidate('role-1', 'cand-1', 'Hi', 'admin@example.com');
        expect(sendHtmlEmail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: undefined }));
      });
    });
  });
});
