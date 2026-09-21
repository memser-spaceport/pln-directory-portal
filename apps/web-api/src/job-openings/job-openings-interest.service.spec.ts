jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: class AnalyticsService {},
}));
jest.mock('../integration-keys/ats-push.service', () => ({ AtsPushService: class AtsPushService {} }));

import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JobOpeningStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { JobOpeningsInterestService } from './job-openings-interest.service';

describe('JobOpeningsInterestService', () => {
  let service: JobOpeningsInterestService;

  const memberFindUnique = jest.fn();
  const jobOpeningFindUnique = jest.fn();
  const interestFindUnique = jest.fn();
  const interestUpsert = jest.fn();
  const interestDeleteMany = jest.fn();
  const interestCount = jest.fn();
  const interestFindMany = jest.fn();
  const teamFindUnique = jest.fn();
  const teamInterestFindUnique = jest.fn();
  const teamInterestUpsert = jest.fn();
  const teamInterestCount = jest.fn();

  const prismaMock = {
    member: { findUnique: memberFindUnique },
    jobOpening: { findUnique: jobOpeningFindUnique },
    team: { findUnique: teamFindUnique },
    jobOpeningInterest: {
      findUnique: interestFindUnique,
      upsert: interestUpsert,
      deleteMany: interestDeleteMany,
      count: interestCount,
      findMany: interestFindMany,
    },
    teamInterest: {
      findUnique: teamInterestFindUnique,
      upsert: teamInterestUpsert,
      count: teamInterestCount,
    },
  } as unknown as PrismaService;

  const atsPushMock = { pushJobInterest: jest.fn(), pushTeamInterest: jest.fn() };
  const analyticsMock = { trackEvent: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    memberFindUnique.mockResolvedValue({ uid: 'member-1', deletedAt: null });
    jobOpeningFindUnique.mockResolvedValue({
      uid: 'job-1',
      roleTitle: 'Engineer',
      sourceLink: null,
      status: JobOpeningStatus.NEW,
      teamUid: 'team-1',
      team: { uid: 'team-1', name: 'Acme', jobReferEmail: null, jobReferCcEmails: [] },
    });
    interestFindUnique.mockResolvedValue(null);
    interestUpsert.mockResolvedValue({ uid: 'interest-1' });
    interestDeleteMany.mockResolvedValue({ count: 1 });
    interestCount.mockResolvedValue(2);
    interestFindMany.mockResolvedValue([]);
    teamFindUnique.mockResolvedValue({ uid: 'team-1' });
    teamInterestFindUnique.mockResolvedValue(null);
    teamInterestUpsert.mockResolvedValue({ uid: 'team-interest-1' });
    teamInterestCount.mockResolvedValue(1);
    service = new JobOpeningsInterestService(prismaMock, atsPushMock as never, analyticsMock as never);
  });

  describe('markInterest', () => {
    it('throws Unauthorized when no email is present', async () => {
      await expect(service.markInterest('job-1', undefined)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(interestUpsert).not.toHaveBeenCalled();
    });

    it('throws Unauthorized when the member cannot be resolved', async () => {
      memberFindUnique.mockResolvedValue(null);

      await expect(service.markInterest('job-1', 'a@b.com')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(interestUpsert).not.toHaveBeenCalled();
    });

    it('throws NotFound when the job opening is missing or hidden', async () => {
      jobOpeningFindUnique.mockResolvedValue(null);

      await expect(service.markInterest('missing', 'a@b.com')).rejects.toBeInstanceOf(NotFoundException);
      expect(interestUpsert).not.toHaveBeenCalled();
    });

    it('upserts interest and returns the updated count', async () => {
      const result = await service.markInterest('job-1', 'a@b.com');

      expect(interestUpsert).toHaveBeenCalledWith({
        where: { jobOpeningUid_memberUid: { jobOpeningUid: 'job-1', memberUid: 'member-1' } },
        create: { jobOpeningUid: 'job-1', memberUid: 'member-1' },
        update: {},
        select: { uid: true },
      });
      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'job-interest-recorded',
          distinctId: 'interest:interest-1',
          properties: expect.objectContaining({
            interest_uid: 'interest-1',
            job_uid: 'job-1',
            team_uid: 'team-1',
            origin: 'job-interest',
          }),
        })
      );
      expect(result).toEqual({ jobUid: 'job-1', interestedCount: 2, viewerIsInterested: true });
    });

    it('does not emit analytics when interest already exists', async () => {
      interestFindUnique.mockResolvedValue({ uid: 'interest-existing' });

      await service.markInterest('job-1', 'a@b.com');

      expect(analyticsMock.trackEvent).not.toHaveBeenCalled();
    });
  });

  describe('markTeamInterest', () => {
    it('records team interest on first mark only', async () => {
      await service.markTeamInterest('team-1', 'a@b.com', { message: 'Hello' });

      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'team-interest-recorded',
          distinctId: 'interest:team-interest-1',
          properties: {
            interest_uid: 'team-interest-1',
            team_uid: 'team-1',
            origin: 'team-interest',
          },
        })
      );
    });

    it('does not emit analytics when team interest already exists', async () => {
      teamInterestFindUnique.mockResolvedValue({ uid: 'team-interest-existing' });

      await service.markTeamInterest('team-1', 'a@b.com');

      expect(analyticsMock.trackEvent).not.toHaveBeenCalled();
    });
  });

  describe('removeInterest', () => {
    it('removes interest idempotently and returns viewerIsInterested false', async () => {
      interestCount.mockResolvedValue(1);

      const result = await service.removeInterest('job-1', 'a@b.com');

      expect(interestDeleteMany).toHaveBeenCalledWith({
        where: { jobOpeningUid: 'job-1', memberUid: 'member-1' },
      });
      expect(result).toEqual({ jobUid: 'job-1', interestedCount: 1, viewerIsInterested: false });
    });

    it('throws NotFound when the job opening is missing or hidden', async () => {
      jobOpeningFindUnique.mockResolvedValue(null);

      await expect(service.removeInterest('missing', 'a@b.com')).rejects.toBeInstanceOf(NotFoundException);
      expect(interestDeleteMany).not.toHaveBeenCalled();
    });
  });

  describe('listMine', () => {
    it('throws Unauthorized when no email is present', async () => {
      await expect(service.listMine(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('maps stored interests to the wire shape', async () => {
      const createdAt = new Date('2026-08-01T00:00:00.000Z');
      interestFindMany.mockResolvedValue([{ uid: 'interest-1', jobOpeningUid: 'job-1', createdAt }]);

      const result = await service.listMine('a@b.com');

      expect(interestFindMany).toHaveBeenCalledWith({
        where: { memberUid: 'member-1' },
        select: { uid: true, jobOpeningUid: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual({
        interests: [{ uid: 'interest-1', jobUid: 'job-1', interestedAt: createdAt.toISOString() }],
      });
    });
  });
});
