import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JobOpeningStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { JobOpeningsInterestService } from './job-openings-interest.service';

describe('JobOpeningsInterestService', () => {
  let service: JobOpeningsInterestService;

  const memberFindUnique = jest.fn();
  const jobOpeningFindUnique = jest.fn();
  const interestUpsert = jest.fn();
  const interestDeleteMany = jest.fn();
  const interestCount = jest.fn();
  const interestFindMany = jest.fn();

  const prismaMock = {
    member: { findUnique: memberFindUnique },
    jobOpening: { findUnique: jobOpeningFindUnique },
    jobOpeningInterest: {
      upsert: interestUpsert,
      deleteMany: interestDeleteMany,
      count: interestCount,
      findMany: interestFindMany,
    },
  } as unknown as PrismaService;

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
    interestUpsert.mockResolvedValue({});
    interestDeleteMany.mockResolvedValue({ count: 1 });
    interestCount.mockResolvedValue(2);
    interestFindMany.mockResolvedValue([]);
    service = new JobOpeningsInterestService(prismaMock);
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
      });
      expect(result).toEqual({ jobUid: 'job-1', interestedCount: 2, viewerIsInterested: true });
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
