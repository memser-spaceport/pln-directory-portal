import { JobOpeningStatus } from '@prisma/client';
import { JobTeamSchema, JobsListQueryParams } from 'libs/contracts/src/schema/job-opening';
import type { PrismaService } from '../shared/prisma.service';
import { PROTOCOL_LABS_TEAM_UID } from '../team-news/team-news-public-list.config';
import { HIDDEN_JOB_OPENING_STATUSES, JobOpeningsQueryService } from './job-openings-query.service';
import { isInAppApplyAvailable } from './pin-protocol-labs-team';

/**
 * `buildWhere` is private and every public method around it fans out into a dozen
 * Prisma calls, so it's reached by name with a stub client. Queries are pushed through
 * `JobsListQueryParams.parse` rather than hand-built, so these also cover the contract
 * half of the team filter — a `teamUid` the schema silently dropped would fail here.
 */
describe('JobOpeningsQueryService.buildWhere', () => {
  const service = new JobOpeningsQueryService({} as PrismaService);
  const buildWhere = (raw: Record<string, unknown>) =>
    service['buildWhere'](JobsListQueryParams.parse(raw)) as {
      status: unknown;
      teamUid: unknown;
      AND?: Record<string, unknown>[];
    };

  it('keeps the team scope out of the top level so it cannot clobber `teamUid: not null`', () => {
    const where = buildWhere({ teamUid: 'team-1' });

    // Both must survive: the base excludes unlinked postings, the AND narrows to one team.
    expect(where.teamUid).toEqual({ not: null });
    expect(where.AND).toContainEqual({ teamUid: 'team-1' });
  });

  it('still excludes closed and stale postings when scoped to a team', () => {
    const where = buildWhere({ teamUid: 'team-1' });

    expect(where.status).toEqual({ notIn: HIDDEN_JOB_OPENING_STATUSES });
    expect(HIDDEN_JOB_OPENING_STATUSES).toContain(JobOpeningStatus.CLOSED_ROLE_FILLED);
  });

  it('adds no team clause when teamUid is absent', () => {
    const where = buildWhere({});

    expect(where.AND).toBeUndefined();
    expect(where.teamUid).toEqual({ not: null });
  });

  it('composes with the other filters rather than replacing them', () => {
    const where = buildWhere({ teamUid: 'team-1', seniority: 'senior' });

    expect(where.AND).toContainEqual({ teamUid: 'team-1' });
    expect(where.AND).toContainEqual({ seniority: { in: ['senior'] } });
  });

  it('scopes to one opening when jobUid is set, without clobbering the team-not-null base', () => {
    const where = buildWhere({ jobUid: 'role-1' });

    expect(where.teamUid).toEqual({ not: null });
    expect(where.AND).toContainEqual({ uid: 'role-1' });
  });

  it('composes jobUid with a team scope', () => {
    const where = buildWhere({ teamUid: 'team-1', jobUid: 'role-1' });

    expect(where.AND).toContainEqual({ teamUid: 'team-1' });
    expect(where.AND).toContainEqual({ uid: 'role-1' });
  });

  it('survives facet overrides, because the team scope is not a facet', () => {
    const where = service['buildWhere'](JobsListQueryParams.parse({ teamUid: 'team-1', seniority: 'senior' }), {
      dropSeniority: true,
    }) as { AND?: Record<string, unknown>[] };

    expect(where.AND).toContainEqual({ teamUid: 'team-1' });
    expect(where.AND).not.toContainEqual({ seniority: { in: ['senior'] } });
  });
});

describe('JobOpeningsQueryService.loadInterestStamps', () => {
  const groupBy = jest.fn();
  const findMany = jest.fn();
  const service = new JobOpeningsQueryService({
    jobOpeningInterest: { groupBy, findMany },
  } as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty maps without querying when there are no job uids', async () => {
    const result = await service['loadInterestStamps']([]);

    expect(groupBy).not.toHaveBeenCalled();
    expect(result.counts.size).toBe(0);
    expect(result.viewerInterested.size).toBe(0);
  });

  it('builds counts from groupBy and skips the viewer lookup when there is no viewer', async () => {
    groupBy.mockResolvedValue([{ jobOpeningUid: 'job-1', _count: { _all: 3 } }]);

    const result = await service['loadInterestStamps'](['job-1', 'job-2']);

    expect(groupBy).toHaveBeenCalledWith({
      by: ['jobOpeningUid'],
      where: { jobOpeningUid: { in: ['job-1', 'job-2'] } },
      _count: { _all: true },
    });
    expect(findMany).not.toHaveBeenCalled();
    expect(result.counts.get('job-1')).toBe(3);
    expect(result.viewerInterested.size).toBe(0);
  });

  it('marks the viewer-interested set from the viewer-scoped rows', async () => {
    groupBy.mockResolvedValue([{ jobOpeningUid: 'job-1', _count: { _all: 1 } }]);
    findMany.mockResolvedValue([{ jobOpeningUid: 'job-1' }]);

    const result = await service['loadInterestStamps'](['job-1'], 'member-1');

    expect(findMany).toHaveBeenCalledWith({
      where: { jobOpeningUid: { in: ['job-1'] }, memberUid: 'member-1' },
      select: { jobOpeningUid: true },
    });
    expect(result.viewerInterested.has('job-1')).toBe(true);
  });
});

describe('JobOpeningsQueryService.resolveViewerMemberUid', () => {
  const findUnique = jest.fn();
  const service = new JobOpeningsQueryService({ member: { findUnique } } as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns undefined when no email is given', async () => {
    await expect(service['resolveViewerMemberUid'](undefined)).resolves.toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('returns undefined when the member is missing or deleted', async () => {
    findUnique.mockResolvedValueOnce(null);
    await expect(service['resolveViewerMemberUid']('a@b.com')).resolves.toBeUndefined();

    findUnique.mockResolvedValueOnce({ uid: 'member-1', deletedAt: new Date() });
    await expect(service['resolveViewerMemberUid']('a@b.com')).resolves.toBeUndefined();
  });

  it('returns the member uid for an active member', async () => {
    findUnique.mockResolvedValueOnce({ uid: 'member-1', deletedAt: null });

    await expect(service['resolveViewerMemberUid']('a@b.com')).resolves.toBe('member-1');
  });
});

describe('JobTeamSchema inAppApplyAvailable', () => {
  const team = {
    uid: 'team-1',
    name: 'Airship',
    logoUrl: null,
    focusAreas: [],
    subFocusAreas: [],
    jobReferEmail: null as string | null,
  };

  it('requires inAppApplyAvailable on the jobs-list team', () => {
    expect(JobTeamSchema.safeParse(team).success).toBe(false);
    expect(JobTeamSchema.safeParse({ ...team, inAppApplyAvailable: true }).success).toBe(true);
  });

  it('maps Protocol Labs availability from the job-refer email', () => {
    expect(isInAppApplyAvailable({ teamUid: PROTOCOL_LABS_TEAM_UID, name: 'Protocol Labs', jobReferEmail: null })).toBe(
      false
    );
    expect(
      isInAppApplyAvailable({
        teamUid: PROTOCOL_LABS_TEAM_UID,
        name: 'Protocol Labs',
        jobReferEmail: 'jobs@protocol.ai',
      })
    ).toBe(true);
    expect(isInAppApplyAvailable({ teamUid: team.uid, name: team.name, jobReferEmail: null })).toBe(true);
  });
});
