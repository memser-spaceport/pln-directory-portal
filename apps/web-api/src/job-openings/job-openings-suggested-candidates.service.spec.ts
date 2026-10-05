jest.mock('../members/members.service', () => ({ MembersService: class MembersService {} }));

import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JobOpeningStatus } from '@prisma/client';
import type { MembersService } from '../members/members.service';
import { PrismaService } from '../shared/prisma.service';
import { JobOpeningsSuggestedCandidatesService } from './job-openings-suggested-candidates.service';

const CRITERIA = ['Rust', 'Senior', 'Remote EU', 'Distributed systems'];

const marks = (...matched: boolean[]) => CRITERIA.map((criterion, index) => ({ criterion, matched: matched[index] }));

const row = (uid: string, score: number, extra: Partial<{ company: string; teamUid: string }> = {}) => ({
  score,
  criteriaResults: marks(true, true, score >= 0.75, score >= 1),
  member: {
    uid,
    name: `Member ${uid}`,
    role: 'Engineer',
    image: null,
    experiences: extra.company ? [{ company: extra.company }] : [],
    teamMemberRoles: extra.teamUid ? [{ teamUid: extra.teamUid }] : [],
  },
});

describe('JobOpeningsSuggestedCandidatesService', () => {
  const jobOpeningFindUnique = jest.fn();
  const setFindUnique = jest.fn();
  const candidateFindMany = jest.fn();
  const findMemberByEmail = jest.fn();

  const prismaMock = {
    jobOpening: { findUnique: jobOpeningFindUnique },
    jobOpeningCandidateSuggestionSet: { findUnique: setFindUnique },
    jobOpeningSuggestedCandidate: { findMany: candidateFindMany },
  } as unknown as PrismaService;

  let service: JobOpeningsSuggestedCandidatesService;
  const originalWebUiBase = process.env.WEB_UI_BASE_URL;

  beforeAll(() => {
    process.env.WEB_UI_BASE_URL = 'https://directory.example';
  });

  afterAll(() => {
    if (originalWebUiBase === undefined) delete process.env.WEB_UI_BASE_URL;
    else process.env.WEB_UI_BASE_URL = originalWebUiBase;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jobOpeningFindUnique.mockResolvedValue({
      uid: 'job-1',
      status: JobOpeningStatus.NEW,
      teamUid: 'team-1',
      team: { uid: 'team-1', name: 'Acme' },
    });
    setFindUnique.mockResolvedValue({ criteria: CRITERIA, computedAt: new Date('2026-10-05T10:00:00Z') });
    candidateFindMany.mockResolvedValue([row('m1', 1), row('m2', 0.75), row('m3', 0.5)]);
    findMemberByEmail.mockResolvedValue({
      uid: 'lead-1',
      deletedAt: null,
      isDirectoryAdmin: false,
      teamMemberRoles: [{ teamUid: 'team-1', endDate: null }],
    });
    service = new JobOpeningsSuggestedCandidatesService(prismaMock, {
      findMemberByEmail,
    } as unknown as MembersService);
  });

  it('returns the stored suggestions best first, each with criteria marks and a label', async () => {
    const result = await service.listForRole('job-1', 'lead@acme.com');

    expect(result.jobUid).toBe('job-1');
    expect(result.criteria).toEqual(CRITERIA);
    expect(result.computedAt).toBe('2026-10-05T10:00:00.000Z');
    expect(result.items.map((item) => [item.rank, item.member.uid, item.label])).toEqual([
      [1, 'm1', 'STRONG_MATCH'],
      [2, 'm2', 'GOOD_MATCH'],
      [3, 'm3', 'GOOD_MATCH'],
    ]);
    expect(result.items[1].criteria).toEqual(marks(true, true, true, false));
    expect(result.items[0].member).toEqual({
      uid: 'm1',
      name: 'Member m1',
      imageUrl: null,
      role: 'Engineer',
      profileUrl: expect.stringContaining('https://directory.example/'),
    });
    expect(candidateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobOpeningUid: 'job-1', member: { deletedAt: null } },
        orderBy: { rank: 'asc' },
      })
    );
  });

  it('never returns more than 5', async () => {
    candidateFindMany.mockResolvedValue(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((uid) => row(uid, 1)));
    const result = await service.listForRole('job-1', 'lead@acme.com');
    expect(result.items).toHaveLength(5);
    expect(result.items.map((item) => item.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it('leaves out members of the hiring team and people who previously worked there, even if stored', async () => {
    candidateFindMany.mockResolvedValue([
      row('joined-since', 1, { teamUid: 'team-1' }),
      row('alumni', 1, { company: ' ACME ' }),
      row('m2', 0.75),
    ]);

    const result = await service.listForRole('job-1', 'lead@acme.com');

    expect(result.items.map((item) => [item.rank, item.member.uid])).toEqual([[1, 'm2']]);
  });

  it('never returns a candidate below the weak-match floor', async () => {
    candidateFindMany.mockResolvedValue([row('m1', 0.75), row('weak', 0.25)]);
    const result = await service.listForRole('job-1', 'lead@acme.com');
    expect(result.items.map((item) => item.member.uid)).toEqual(['m1']);
  });

  it.each([JobOpeningStatus.STALE, JobOpeningStatus.CLOSED_ROLE_FILLED, JobOpeningStatus.CLOSED_DUPLICATE])(
    'returns no suggestions for a role that is not live (%s)',
    async (status) => {
      jobOpeningFindUnique.mockResolvedValue({
        uid: 'job-1',
        status,
        teamUid: 'team-1',
        team: { uid: 'team-1', name: 'Acme' },
      });

      const result = await service.listForRole('job-1', 'lead@acme.com');

      expect(result).toEqual({ jobUid: 'job-1', criteria: [], computedAt: null, items: [] });
      expect(candidateFindMany).not.toHaveBeenCalled();
    }
  );

  it('returns no suggestions before the first computation', async () => {
    setFindUnique.mockResolvedValue(null);
    const result = await service.listForRole('job-1', 'lead@acme.com');
    expect(result.items).toEqual([]);
  });

  it('refuses a signed-in user who is not on the hiring team', async () => {
    findMemberByEmail.mockResolvedValue({
      uid: 'other',
      deletedAt: null,
      isDirectoryAdmin: false,
      teamMemberRoles: [{ teamUid: 'team-2', endDate: null }],
    });
    await expect(service.listForRole('job-1', 'someone@else.com')).rejects.toBeInstanceOf(ForbiddenException);
    expect(candidateFindMany).not.toHaveBeenCalled();
  });

  it('refuses a former member of the hiring team', async () => {
    findMemberByEmail.mockResolvedValue({
      uid: 'former',
      deletedAt: null,
      isDirectoryAdmin: false,
      teamMemberRoles: [{ teamUid: 'team-1', endDate: new Date('2020-01-01') }],
    });
    await expect(service.listForRole('job-1', 'former@acme.com')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a caller with no member profile', async () => {
    findMemberByEmail.mockResolvedValue(null);
    await expect(service.listForRole('job-1', 'nobody@x.com')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an anonymous caller', async () => {
    await expect(service.listForRole('job-1', undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jobOpeningFindUnique).not.toHaveBeenCalled();
  });

  it('lets a Directory admin who is not on the team read the suggestions', async () => {
    findMemberByEmail.mockResolvedValue({ uid: 'admin', deletedAt: null, isDirectoryAdmin: true, teamMemberRoles: [] });
    const result = await service.listForRole('job-1', 'admin@pl.network');
    expect(result.items).toHaveLength(3);
  });

  it('answers 404 for an unknown role', async () => {
    jobOpeningFindUnique.mockResolvedValue(null);
    await expect(service.listForRole('nope', 'lead@acme.com')).rejects.toBeInstanceOf(NotFoundException);
  });
});
