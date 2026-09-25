import { UnauthorizedException } from '@nestjs/common';
import { JobOpeningStatus } from '@prisma/client';
import { JobsListQueryParams } from 'libs/contracts/src/schema/job-opening';
import type { PrismaService } from '../shared/prisma.service';
import { HIDDEN_JOB_OPENING_STATUSES, JobOpeningsQueryService } from './job-openings-query.service';

const SAVED_BY_MEMBER_1 = { savedBy: { some: { memberUid: 'member-1' } } };

type Where = { status: unknown; teamUid: unknown; AND?: Record<string, unknown>[] };

describe('the saved scope in buildWhere', () => {
  const service = new JobOpeningsQueryService({} as PrismaService);
  const buildWhere = (raw: Record<string, unknown>, memberUid?: string) =>
    service['buildWhere'](JobsListQueryParams.parse(raw), {}, memberUid) as Where;

  it('narrows to the caller saves only when a member is passed', () => {
    expect(buildWhere({ saved: 'true' }, 'member-1').AND).toContainEqual(SAVED_BY_MEMBER_1);
    expect(buildWhere({ saved: 'true' }).AND).toBeUndefined();
    expect(buildWhere({}, 'member-1').AND).toContainEqual(SAVED_BY_MEMBER_1);
  });

  it('keeps the board visibility rules alongside it', () => {
    const where = buildWhere({ saved: 'true' }, 'member-1');

    expect(where.status).toEqual({ notIn: HIDDEN_JOB_OPENING_STATUSES });
    expect(where.teamUid).toEqual({ not: null });
  });

  it('composes with the rail filters and the search rather than replacing them', () => {
    const where = buildWhere({ saved: 'true', seniority: 'senior', q: 'engineer' }, 'member-1');

    expect(where.AND).toContainEqual(SAVED_BY_MEMBER_1);
    expect(where.AND).toContainEqual({ seniority: { in: ['senior'] } });
    expect(where.AND).toEqual(
      expect.arrayContaining([expect.objectContaining({ OR: expect.any(Array) })])
    );
  });

  it('survives facet overrides, because the scope is not a facet', () => {
    const where = service['buildWhere'](
      JobsListQueryParams.parse({ saved: 'true', seniority: 'senior' }),
      { dropSeniority: true },
      'member-1'
    ) as Where;

    expect(where.AND).toContainEqual(SAVED_BY_MEMBER_1);
    expect(where.AND).not.toContainEqual({ seniority: { in: ['senior'] } });
  });
});

describe('the saved scope on the board list', () => {
  const memberFindUnique = jest.fn();
  const teamCount = jest.fn();
  const jobOpeningCount = jest.fn();
  const jobOpeningFindMany = jest.fn();
  const jobOpeningGroupBy = jest.fn();
  const teamFindMany = jest.fn();
  const teamFocusAreaFindMany = jest.fn();
  const interestGroupBy = jest.fn();
  const interestFindMany = jest.fn();
  const teamInterestGroupBy = jest.fn();
  const teamInterestFindMany = jest.fn();

  const prismaMock = {
    member: { findUnique: memberFindUnique },
    team: { count: teamCount, findMany: teamFindMany },
    jobOpening: { count: jobOpeningCount, findMany: jobOpeningFindMany, groupBy: jobOpeningGroupBy },
    teamFocusArea: { findMany: teamFocusAreaFindMany },
    jobOpeningInterest: { groupBy: interestGroupBy, findMany: interestFindMany },
    teamInterest: { groupBy: teamInterestGroupBy, findMany: teamInterestFindMany },
  } as unknown as PrismaService;

  const service = new JobOpeningsQueryService(prismaMock);

  const role = {
    uid: 'job-1',
    teamUid: 'team-1',
    roleTitle: 'Engineer',
    roleCategory: 'Engineering',
    seniority: 'Senior',
    location: ['Remote'],
    workMode: 'Remote',
    sourceLink: null,
    descriptionHtml: null,
    postedDate: new Date('2026-09-19T10:00:00.000Z'),
    detectionDate: new Date('2026-09-19T10:00:00.000Z'),
    updatedAt: new Date('2026-09-19T10:00:00.000Z'),
    department: null,
    payMin: null,
    payMax: null,
    payCurrency: null,
    payPeriod: null,
    equityNote: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    memberFindUnique.mockResolvedValue({ uid: 'member-1', deletedAt: null });
    teamCount.mockResolvedValue(1);
    jobOpeningCount.mockResolvedValue(1);
    jobOpeningFindMany.mockResolvedValue([{ ...role, team: { name: 'Acme' } }]);
    jobOpeningGroupBy.mockResolvedValue([{ teamUid: 'team-1', _count: { _all: 1 } }]);
    teamFindMany.mockResolvedValue([
      {
        uid: 'team-1',
        name: 'Acme',
        jobReferEmail: 'jobs@acme.test',
        hasInactiveLeadEmails: false,
        logo: null,
        jobOpenings: [role],
      },
    ]);
    teamFocusAreaFindMany.mockResolvedValue([]);
    interestGroupBy.mockResolvedValue([]);
    interestFindMany.mockResolvedValue([]);
    teamInterestGroupBy.mockResolvedValue([]);
    teamInterestFindMany.mockResolvedValue([]);
  });

  const list = (raw: Record<string, unknown>, email?: string) =>
    service.listJobOpenings(JobsListQueryParams.parse(raw), email);

  /**
   * Every where the list was built from: the role count, the role select inside
   * the team read, and — on an alphabetical sort — the team read that pages
   * teams by name, which carries the same where under `jobOpenings.some`.
   */
  const wheres = (): Where[] => [
    ...jobOpeningCount.mock.calls.map((call) => call[0].where),
    ...teamFindMany.mock.calls.map(
      (call) => call[0].select?.jobOpenings?.where ?? call[0].where?.jobOpenings?.some
    ),
  ];

  it('refuses an anonymous caller instead of widening to the whole board', async () => {
    await expect(list({ saved: 'true' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jobOpeningCount).not.toHaveBeenCalled();
    expect(teamFindMany).not.toHaveBeenCalled();
  });

  it('refuses a session whose member is gone', async () => {
    memberFindUnique.mockResolvedValue({ uid: 'member-1', deletedAt: new Date() });

    await expect(list({ saved: 'true' }, 'gone@example.com')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jobOpeningCount).not.toHaveBeenCalled();
  });

  it('serves an anonymous unscoped list as before, with no member lookup', async () => {
    const result = await list({});

    expect(memberFindUnique).not.toHaveBeenCalled();
    expect(result.totalRoles).toBe(1);
    for (const where of wheres()) {
      expect(JSON.stringify(where)).not.toContain('savedBy');
    }
  });

  it('narrows every query behind the list, before the paging counts', async () => {
    await list({ saved: 'true' }, 'me@example.com');

    expect(wheres().length).toBeGreaterThan(0);
    for (const where of wheres()) {
      expect(where.AND).toContainEqual(SAVED_BY_MEMBER_1);
      expect(where.status).toEqual({ notIn: HIDDEN_JOB_OPENING_STATUSES });
      expect(where.teamUid).toEqual({ not: null });
    }
  });

  it('resolves the viewer once, reusing it for the interest stamps', async () => {
    await list({ saved: 'true' }, 'me@example.com');

    expect(memberFindUnique).toHaveBeenCalledTimes(1);
    expect(interestFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.anything() }));
  });

  it('composes with the rail filters, the search and the sort', async () => {
    await list({ saved: 'true', roleCategory: 'Engineering', q: 'eng', sort: 'company_az' }, 'me@example.com');

    for (const where of wheres()) {
      expect(where.AND).toContainEqual(SAVED_BY_MEMBER_1);
      expect(where.AND).toContainEqual({ roleCategory: { in: ['Engineering'] } });
    }
  });

  it('reports totals for the narrowed set', async () => {
    teamCount.mockResolvedValue(1);
    jobOpeningCount.mockResolvedValue(2);

    const result = await list({ saved: 'true' }, 'me@example.com');

    expect(result.totalRoles).toBe(2);
    expect(result.totalGroups).toBe(1);
    // The counts came from the scoped where, not from a second unscoped read.
    expect(jobOpeningCount.mock.calls[0][0].where.AND).toContainEqual(SAVED_BY_MEMBER_1);
    expect(teamCount.mock.calls[0][0].where.jobOpenings.some.AND).toContainEqual(SAVED_BY_MEMBER_1);
  });

  it('answers an empty board when nothing saved survives the filters', async () => {
    teamCount.mockResolvedValue(0);
    jobOpeningCount.mockResolvedValue(0);

    const result = await list({ saved: 'true', q: 'nothing' }, 'me@example.com');

    expect(result.groups).toEqual([]);
    expect(result.totalRoles).toBe(0);
  });

  it('keeps the role shape the board already serves', async () => {
    const result = await list({ saved: 'true' }, 'me@example.com');

    expect(result.groups[0].roles[0]).toEqual(
      expect.objectContaining({
        uid: 'job-1',
        roleTitle: 'Engineer',
        interestedCount: 0,
        viewerIsInterested: false,
      })
    );
  });

  it('leaves the unscoped board untouched for a signed-in member with saves', async () => {
    await list({}, 'me@example.com');

    for (const where of wheres()) {
      expect(JSON.stringify(where)).not.toContain('savedBy');
    }
  });

  it('leaves a team-scoped list untouched', async () => {
    await list({ teamUid: 'team-1' }, 'me@example.com');

    for (const where of wheres()) {
      expect(where.AND).toContainEqual({ teamUid: 'team-1' });
      expect(JSON.stringify(where)).not.toContain('savedBy');
    }
  });

  it('leaves the single-job read untouched', async () => {
    await service.getJobOpening('job-1', 'me@example.com');

    for (const where of wheres()) {
      expect(JSON.stringify(where)).not.toContain('savedBy');
    }
  });

  it('leaves job-alert digest matching untouched', async () => {
    jobOpeningFindMany.mockResolvedValue([]);

    await service.findNewMatchesSince(JobsListQueryParams.parse({ roleCategory: 'Engineering' }), null);

    const where = jobOpeningFindMany.mock.calls.at(-1)?.[0].where;
    expect(JSON.stringify(where)).not.toContain('savedBy');
  });

  it('never lets a hidden or teamless saved role through', async () => {
    await list({ saved: 'true' }, 'me@example.com');

    for (const where of wheres()) {
      expect((where.status as { notIn: JobOpeningStatus[] }).notIn).toContain(JobOpeningStatus.CLOSED_ROLE_FILLED);
      expect(where.teamUid).toEqual({ not: null });
    }
  });
});

describe('the saved scope on the facet counts', () => {
  const memberFindUnique = jest.fn();
  const jobOpeningGroupBy = jest.fn();
  const jobOpeningFindMany = jest.fn();
  const jobOpeningCount = jest.fn();
  const teamFocusAreaFindMany = jest.fn();

  const service = new JobOpeningsQueryService({
    member: { findUnique: memberFindUnique },
    jobOpening: { groupBy: jobOpeningGroupBy, findMany: jobOpeningFindMany, count: jobOpeningCount },
    teamFocusArea: { findMany: teamFocusAreaFindMany },
  } as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    memberFindUnique.mockResolvedValue({ uid: 'member-1', deletedAt: null });
    jobOpeningGroupBy.mockResolvedValue([]);
    jobOpeningFindMany.mockResolvedValue([]);
    jobOpeningCount.mockResolvedValue(0);
    teamFocusAreaFindMany.mockResolvedValue([]);
  });

  const filters = (raw: Record<string, unknown>, email?: string) =>
    service.getFilters(JobsListQueryParams.parse(raw), email);

  it('refuses an anonymous saved-scoped facet read', async () => {
    await expect(filters({ saved: 'true' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jobOpeningGroupBy).not.toHaveBeenCalled();
  });

  it('counts every facet inside the saved set', async () => {
    await filters({ saved: 'true' }, 'me@example.com');

    const used = [
      ...jobOpeningGroupBy.mock.calls.map((call) => call[0].where),
      ...jobOpeningFindMany.mock.calls.map((call) => call[0].where),
    ];
    expect(used.length).toBeGreaterThan(0);
    for (const where of used) {
      expect(where.AND).toContainEqual(SAVED_BY_MEMBER_1);
    }
  });

  it('still drops each facet own filter while staying inside the saved set', async () => {
    await filters({ saved: 'true', seniority: 'Senior' }, 'me@example.com');

    const seniorityWhere = jobOpeningGroupBy.mock.calls.find((call) => call[0].by?.[0] === 'seniority')?.[0].where;
    expect(seniorityWhere.AND).toContainEqual(SAVED_BY_MEMBER_1);
    expect(seniorityWhere.AND).not.toContainEqual({ seniority: { in: ['Senior'] } });

    const roleCategoryWhere = jobOpeningGroupBy.mock.calls.find((call) => call[0].by?.[0] === 'roleCategory')?.[0]
      .where;
    expect(roleCategoryWhere.AND).toContainEqual({ seniority: { in: ['Senior'] } });
  });

  it('counts the saves inside what the rail currently describes', async () => {
    jobOpeningCount.mockResolvedValue(4);

    const result = await filters({ seniority: 'Senior' }, 'me@example.com');

    expect(result.saved).toBe(4);
    const where = jobOpeningCount.mock.calls[0][0].where;
    expect(where.AND).toContainEqual(SAVED_BY_MEMBER_1);
    /* Unlike the seniority facet, this one keeps every other filter — the
       question is "how many of these would remain", not "what could you pick". */
    expect(where.AND).toContainEqual({ seniority: { in: ['Senior'] } });
  });

  it('counts the saves without the box being ticked, which is when it has something to say', async () => {
    jobOpeningCount.mockResolvedValue(7);

    const result = await filters({}, 'me@example.com');

    expect(result.saved).toBe(7);
    expect(jobOpeningCount.mock.calls[0][0].where.AND).toContainEqual(SAVED_BY_MEMBER_1);
  });

  it('offers no count to an anonymous caller rather than claiming zero', async () => {
    const result = await filters({});

    expect(result.saved).toBeUndefined();
    expect(jobOpeningCount).not.toHaveBeenCalled();
  });

  it('offers no count when the session belongs to a member who is gone', async () => {
    memberFindUnique.mockResolvedValue({ uid: 'member-1', deletedAt: new Date() });

    const result = await filters({}, 'me@example.com');

    expect(result.saved).toBeUndefined();
    expect(jobOpeningCount).not.toHaveBeenCalled();
  });

  it('serves anonymous facets as before when the scope is absent', async () => {
    await filters({});

    expect(memberFindUnique).not.toHaveBeenCalled();
    for (const call of jobOpeningGroupBy.mock.calls) {
      expect(JSON.stringify(call[0].where)).not.toContain('savedBy');
    }
  });
});
