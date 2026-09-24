// MemberCvImportsService's dependency graph reaches an ESM-only package Jest will
// not parse; this spec drives the class through stubs at the module boundary.
jest.mock('../member-cv-imports/member-cv-imports.service', () => ({ MemberCvImportsService: class {} }));
jest.mock('../members/members.service', () => ({ MembersService: class {} }));
jest.mock('../teams/teams.service', () => ({ TeamsService: class {} }));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { MemberCvImportsService } from '../member-cv-imports/member-cv-imports.service';
import type { MembersService } from '../members/members.service';
import type { PrismaService } from '../shared/prisma.service';
import type { TeamsService } from '../teams/teams.service';
import { TeamHiringService } from './team-hiring.service';

const member = (uid: string, over: { avatar?: string | null; email?: string | null } = {}) => ({
  uid,
  name: `Member ${uid}`,
  email: over.email === undefined ? `${uid}@example.com` : over.email,
  image: over.avatar === null ? null : { url: over.avatar ?? `https://cdn/${uid}.png` },
  skills: [{ title: 'Rust' }],
  location: { city: 'Lisbon', country: 'Portugal', region: null },
  teamMemberRoles: [{ role: 'Platform Lead', mainTeam: true, team: { name: 'Filecoin Foundation' } }],
});

/** A row as the tally select returns it. */
const tally = (
  uid: string,
  jobOpeningUid: string,
  daysAgo: number,
  avatar: string | null = `https://cdn/${uid}.png`
) => ({
  uid,
  jobOpeningUid,
  createdAt: new Date(Date.UTC(2026, 8, 20 - daysAgo)),
  member: { image: avatar === null ? null : { url: avatar } },
});

describe('TeamHiringService', () => {
  let prisma: any;
  let teams: { isMemberTeamLead: jest.Mock };
  let members: { findMemberByEmail: jest.Mock };
  let cvImports: { getStoredCvFiles: jest.Mock };
  let service: TeamHiringService;

  beforeAll(() => {
    process.env.WEB_UI_BASE_URL = 'https://os.pl.xyz';
  });

  beforeEach(() => {
    prisma = {
      jobOpening: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      jobApplication: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), update: jest.fn() },
      jobOpeningInterest: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), update: jest.fn() },
      jobCandidateView: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
    };
    teams = { isMemberTeamLead: jest.fn().mockResolvedValue(false) };
    members = { findMemberByEmail: jest.fn() };
    cvImports = { getStoredCvFiles: jest.fn().mockResolvedValue(new Map()) };
    service = new TeamHiringService(
      prisma as unknown as PrismaService,
      teams as unknown as TeamsService,
      members as unknown as MembersService,
      cvImports as unknown as MemberCvImportsService
    );
  });

  describe('assertCanRead', () => {
    it('lets a team lead of that team in', async () => {
      members.findMemberByEmail.mockResolvedValue({ uid: 'm-lead', memberRoles: [] });
      teams.isMemberTeamLead.mockResolvedValue(true);

      await expect(service.assertCanRead('team-1', 'lead@example.com')).resolves.toBe('m-lead');
      expect(teams.isMemberTeamLead).toHaveBeenCalledWith('team-1', 'm-lead');
    });

    it('refuses an ordinary member of the same team', async () => {
      members.findMemberByEmail.mockResolvedValue({ uid: 'm-2', memberRoles: [] });

      await expect(service.assertCanRead('team-1', 'member@example.com')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuses another team's lead", async () => {
      members.findMemberByEmail.mockResolvedValue({ uid: 'm-3', memberRoles: [] });
      teams.isMemberTeamLead.mockImplementation(async (teamUid: string) => teamUid === 'team-2');

      await expect(service.assertCanRead('team-1', 'other@example.com')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets a directory admin in without a team-lead role', async () => {
      members.findMemberByEmail.mockResolvedValue({ uid: 'm-admin', memberRoles: [{ name: 'DIRECTORYADMIN' }] });

      await expect(service.assertCanRead('team-1', 'admin@example.com')).resolves.toBe('m-admin');
      expect(teams.isMemberTeamLead).not.toHaveBeenCalled();
    });

    it('refuses an email with no member record', async () => {
      members.findMemberByEmail.mockResolvedValue(null);

      await expect(service.assertCanRead('team-1', 'ghost@example.com')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('counts', () => {
    it('tallies both lists per role and counts this viewer’s unopened rows', async () => {
      prisma.jobOpening.findMany.mockResolvedValue([{ uid: 'job-1' }]);
      prisma.jobApplication.findMany.mockResolvedValue([
        tally('app-1', 'job-1', 1),
        tally('app-2', 'job-1', 2),
        tally('app-3', 'job-1', 3),
      ]);
      prisma.jobOpeningInterest.findMany.mockResolvedValue([tally('int-1', 'job-1', 4)]);
      // The viewer has opened one application only.
      prisma.jobCandidateView.findMany.mockResolvedValue([{ kind: 'APPLICATION', rowUid: 'app-1' }]);

      const out = await service.counts('team-1', 'm-lead');

      expect(out.counts).toEqual([
        {
          roleUid: 'job-1',
          applicantCount: 3,
          interestCount: 1,
          newCount: 3,
          newestAvatars: ['https://cdn/app-1.png', 'https://cdn/app-2.png', 'https://cdn/app-3.png'],
        },
      ]);
    });

    it('omits a role nobody answered instead of sending a zero row', async () => {
      prisma.jobOpening.findMany.mockResolvedValue([{ uid: 'job-1' }, { uid: 'job-empty' }]);
      prisma.jobApplication.findMany.mockResolvedValue([tally('app-1', 'job-1', 1)]);

      const out = await service.counts('team-1', 'm-lead');

      expect(out.counts.map((c) => c.roleUid)).toEqual(['job-1']);
    });

    it('asks only for board-visible roles of that team', async () => {
      await service.counts('team-1', 'm-lead');

      const where = prisma.jobOpening.findMany.mock.calls[0][0].where;
      expect(where.teamUid).toBe('team-1');
      expect(where.status.notIn).toEqual(expect.arrayContaining(['CLOSED_ROLE_FILLED', 'STALE']));
    });

    it('repeats no role description', async () => {
      prisma.jobOpening.findMany.mockResolvedValue([{ uid: 'job-1' }]);
      prisma.jobApplication.findMany.mockResolvedValue([tally('app-1', 'job-1', 1)]);

      const out = await service.counts('team-1', 'm-lead');

      expect(Object.keys(out.counts[0]).sort()).toEqual([
        'applicantCount',
        'interestCount',
        'newCount',
        'newestAvatars',
        'roleUid',
      ]);
    });

    it('takes the facepile newest first across both lists and skips missing pictures', async () => {
      prisma.jobOpening.findMany.mockResolvedValue([{ uid: 'job-1' }]);
      // Newest to oldest: int-new (0d, no picture), app-1 (1d), int-2 (2d), app-2 (3d).
      prisma.jobApplication.findMany.mockResolvedValue([tally('app-1', 'job-1', 1), tally('app-2', 'job-1', 3)]);
      prisma.jobOpeningInterest.findMany.mockResolvedValue([
        tally('int-new', 'job-1', 0, null),
        tally('int-2', 'job-1', 2),
      ]);

      const out = await service.counts('team-1', 'm-lead');

      expect(out.counts[0].newestAvatars).toEqual([
        'https://cdn/app-1.png',
        'https://cdn/int-2.png',
        'https://cdn/app-2.png',
      ]);
    });

    it('answers with an empty list when the team has no visible roles', async () => {
      const out = await service.counts('team-1', 'm-lead');

      expect(out).toEqual({ counts: [] });
      expect(prisma.jobApplication.findMany).not.toHaveBeenCalled();
    });
  });

  describe('roleApplicants', () => {
    const application = (uid: string, over: Record<string, unknown> = {}) => ({
      uid,
      coverLetter: 'Hello',
      createdAt: new Date('2026-09-01T10:00:00Z'),
      reviewedAt: null,
      reviewedByUid: null,
      member: member('m-1'),
      ...over,
    });

    beforeEach(() => {
      prisma.jobOpening.findFirst.mockResolvedValue({ uid: 'job-1' });
    });

    it('returns the frontend’s row shape, and nothing else', async () => {
      prisma.jobApplication.findMany.mockResolvedValue([application('app-1')]);

      const out = await service.roleApplicants('team-1', 'job-1', 'm-lead');

      expect(Object.keys(out.applications[0]).sort()).toEqual([
        'avatarUrl',
        'coverLetter',
        'createdAt',
        'currentCompany',
        'cv',
        'email',
        'headline',
        'location',
        'memberUid',
        'name',
        'profileUrl',
        'reviewed',
        'tags',
        'uid',
        'unseen',
      ]);
      expect(out.applications[0]).toMatchObject({
        uid: 'app-1',
        memberUid: 'm-1',
        email: 'm-1@example.com',
        profileUrl: 'https://os.pl.xyz/members/m-1',
        avatarUrl: 'https://cdn/m-1.png',
        headline: 'Platform Lead',
        currentCompany: 'Filecoin Foundation',
        location: 'Lisbon, Portugal',
        tags: ['Rust'],
        createdAt: '2026-09-01T10:00:00.000Z',
        coverLetter: 'Hello',
        unseen: true,
        reviewed: false,
      });
    });

    it('reports reviewed from the row and unseen from this viewer', async () => {
      prisma.jobApplication.findMany.mockResolvedValue([
        application('app-1', { reviewedAt: new Date('2026-09-02T10:00:00Z'), reviewedByUid: 'm-other' }),
      ]);
      prisma.jobCandidateView.findMany.mockResolvedValue([{ kind: 'APPLICATION', rowUid: 'app-1' }]);

      const out = await service.roleApplicants('team-1', 'job-1', 'm-lead');

      expect(out.applications[0]).toMatchObject({ reviewed: true, unseen: false });
    });

    it('names the CV on an application and never on an interest', async () => {
      prisma.jobApplication.findMany.mockResolvedValue([
        application('app-1'),
        application('app-2', { member: member('m-no-cv') }),
      ]);
      prisma.jobOpeningInterest.findMany.mockResolvedValue([
        {
          uid: 'int-1',
          createdAt: new Date('2026-09-03T10:00:00Z'),
          reviewedAt: null,
          reviewedByUid: null,
          member: member('m-1'),
        },
      ]);
      cvImports.getStoredCvFiles.mockResolvedValue(
        new Map([['m-1', { fileName: 'cv.pdf', size: 184320, uploadedAt: '2026-08-12T00:00:00.000Z' }]])
      );

      const out = await service.roleApplicants('team-1', 'job-1', 'm-lead');

      expect(out.applications[0].cv).toEqual({
        fileName: 'cv.pdf',
        size: 184320,
        uploadedAt: '2026-08-12T00:00:00.000Z',
      });
      expect(out.applications[1].cv).toBeNull();
      // The member HAS a stored CV; an interest still reports none.
      expect(out.interests[0].cv).toBeNull();
      expect(out.interests[0].coverLetter).toBeNull();
    });

    it('never signs a CV link for a list', async () => {
      prisma.jobApplication.findMany.mockResolvedValue([application('app-1')]);

      const out = await service.roleApplicants('team-1', 'job-1', 'm-lead');

      expect(JSON.stringify(out)).not.toContain('url');
    });

    it("404s on another team's role", async () => {
      prisma.jobOpening.findFirst.mockResolvedValue(null);

      await expect(service.roleApplicants('team-1', 'role-of-team-2', 'm-lead')).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe('setReviewed', () => {
    const owned = (reviewedAt: Date | null = null) => ({ reviewedAt, jobOpening: { teamUid: 'team-1' } });

    beforeEach(() => {
      members.findMemberByEmail.mockResolvedValue({ uid: 'm-lead', memberRoles: [] });
      teams.isMemberTeamLead.mockResolvedValue(true);
    });

    it('ticks an application and records who and when', async () => {
      prisma.jobApplication.findUnique.mockResolvedValue(owned());
      prisma.jobApplication.update.mockResolvedValue({ reviewedAt: new Date('2026-09-20T12:00:00Z') });

      const out = await service.setReviewed('applications', 'app-1', true, 'lead@example.com');

      expect(out).toEqual({ uid: 'app-1', reviewed: true });
      const data = prisma.jobApplication.update.mock.calls[0][0].data;
      expect(data.reviewedAt).toBeInstanceOf(Date);
      expect(data.reviewedByUid).toBe('m-lead');
    });

    it('unticks', async () => {
      prisma.jobApplication.findUnique.mockResolvedValue(owned(new Date('2026-09-01T10:00:00Z')));
      prisma.jobApplication.update.mockResolvedValue({ reviewedAt: null });

      const out = await service.setReviewed('applications', 'app-1', false, 'lead@example.com');

      expect(out).toEqual({ uid: 'app-1', reviewed: false });
      expect(prisma.jobApplication.update.mock.calls[0][0].data).toEqual({ reviewedAt: null, reviewedByUid: null });
    });

    it('reports no change when the row is already in that state', async () => {
      prisma.jobApplication.findUnique.mockResolvedValue(owned(new Date('2026-09-01T10:00:00Z')));

      const out = await service.setReviewed('applications', 'app-1', true, 'lead@example.com');

      expect(out).toEqual({ uid: 'app-1', reviewed: true });
      expect(prisma.jobApplication.update).not.toHaveBeenCalled();
    });

    it('writes an interest through its own table', async () => {
      prisma.jobOpeningInterest.findUnique.mockResolvedValue(owned());
      prisma.jobOpeningInterest.update.mockResolvedValue({ reviewedAt: new Date() });

      await service.setReviewed('interests', 'int-1', true, 'lead@example.com');

      expect(prisma.jobOpeningInterest.update).toHaveBeenCalled();
      expect(prisma.jobApplication.update).not.toHaveBeenCalled();
    });

    it('404s on a uid no row carries', async () => {
      prisma.jobApplication.findUnique.mockResolvedValue(null);

      await expect(service.setReviewed('applications', 'nope', true, 'lead@example.com')).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it('403s on a row belonging to a team the caller does not lead', async () => {
      prisma.jobApplication.findUnique.mockResolvedValue({ reviewedAt: null, jobOpening: { teamUid: 'team-2' } });
      teams.isMemberTeamLead.mockImplementation(async (teamUid: string) => teamUid === 'team-1');

      await expect(
        service.setReviewed('applications', 'app-of-team-2', true, 'lead@example.com')
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.jobApplication.update).not.toHaveBeenCalled();
    });
  });

  describe('markSeen', () => {
    beforeEach(() => {
      members.findMemberByEmail.mockResolvedValue({ uid: 'm-lead', memberRoles: [] });
      teams.isMemberTeamLead.mockResolvedValue(true);
      prisma.jobApplication.findUnique.mockResolvedValue({ reviewedAt: null, jobOpening: { teamUid: 'team-1' } });
    });

    it('records the open against this member only, and keeps the first stamp', async () => {
      prisma.jobCandidateView.upsert.mockResolvedValue({ seenAt: new Date('2026-09-10T10:00:00Z') });

      const out = await service.markSeen('applications', 'app-1', 'lead@example.com');

      expect(out).toEqual({ uid: 'app-1', seenAt: '2026-09-10T10:00:00.000Z' });
      const call = prisma.jobCandidateView.upsert.mock.calls[0][0];
      expect(call.where).toEqual({
        memberUid_kind_rowUid: { memberUid: 'm-lead', kind: 'APPLICATION', rowUid: 'app-1' },
      });
      expect(call.create).toEqual({ memberUid: 'm-lead', kind: 'APPLICATION', rowUid: 'app-1' });
      // An empty update is what makes the first seenAt stand.
      expect(call.update).toEqual({});
    });

    it('stores an interest under its own kind', async () => {
      prisma.jobApplication.findUnique.mockResolvedValue(null);
      prisma.jobOpeningInterest.findUnique.mockResolvedValue({ reviewedAt: null, jobOpening: { teamUid: 'team-1' } });
      prisma.jobCandidateView.upsert.mockResolvedValue({ seenAt: new Date() });

      await service.markSeen('interests', 'int-1', 'lead@example.com');

      expect(prisma.jobCandidateView.upsert.mock.calls[0][0].create.kind).toBe('JOB_INTEREST');
    });

    it('scopes the read of other leads’ views to the caller', async () => {
      prisma.jobOpening.findFirst.mockResolvedValue({ uid: 'job-1' });
      prisma.jobApplication.findMany.mockResolvedValue([
        {
          uid: 'app-1',
          coverLetter: null,
          createdAt: new Date(),
          reviewedAt: null,
          reviewedByUid: null,
          member: member('m-1'),
        },
      ]);

      await service.roleApplicants('team-1', 'job-1', 'm-other-lead');

      expect(prisma.jobCandidateView.findMany.mock.calls[0][0].where.memberUid).toBe('m-other-lead');
    });
  });
});
