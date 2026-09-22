jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: class AnalyticsService {},
}));

import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JobOpeningStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { ANALYTICS_EVENTS } from '../utils/constants';
import { JobOpeningsSavedService } from './job-openings-saved.service';

describe('JobOpeningsSavedService', () => {
  let service: JobOpeningsSavedService;

  const memberFindUnique = jest.fn();
  const jobOpeningFindUnique = jest.fn();
  const savedFindUnique = jest.fn();
  const savedUpsert = jest.fn();
  const savedDeleteMany = jest.fn();
  const savedFindMany = jest.fn();

  const prismaMock = {
    member: { findUnique: memberFindUnique },
    jobOpening: { findUnique: jobOpeningFindUnique },
    savedJobOpening: {
      findUnique: savedFindUnique,
      upsert: savedUpsert,
      deleteMany: savedDeleteMany,
      findMany: savedFindMany,
    },
  } as unknown as PrismaService;

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
    savedFindUnique.mockResolvedValue(null);
    savedUpsert.mockResolvedValue({ uid: 'save-1' });
    savedDeleteMany.mockResolvedValue({ count: 1 });
    savedFindMany.mockResolvedValue([]);

    service = new JobOpeningsSavedService(prismaMock, analyticsMock as never);
  });

  describe('save', () => {
    it('records the save and answers with the viewer flag', async () => {
      await expect(service.save('job-1', 'me@example.com')).resolves.toEqual({
        jobUid: 'job-1',
        viewerHasSaved: true,
      });

      expect(savedUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jobOpeningUid_memberUid: { jobOpeningUid: 'job-1', memberUid: 'member-1' } },
          create: { jobOpeningUid: 'job-1', memberUid: 'member-1' },
          update: {},
        })
      );
    });

    it('leaves the first save time alone when the same job is saved again', async () => {
      savedFindUnique.mockResolvedValue({ uid: 'save-1' });

      await expect(service.save('job-1', 'me@example.com')).resolves.toEqual({
        jobUid: 'job-1',
        viewerHasSaved: true,
      });

      // An empty `update` is what holds createdAt still; nothing else may be written.
      expect(savedUpsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
    });

    it('records one analytics event on a first save and none on a repeat', async () => {
      await service.save('job-1', 'me@example.com');

      expect(analyticsMock.trackEvent).toHaveBeenCalledTimes(1);
      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: ANALYTICS_EVENTS.JOB_BOARD.SAVE_RECORDED,
          distinctId: 'save:save-1',
          properties: expect.objectContaining({ save_uid: 'save-1', job_uid: 'job-1', team_uid: 'team-1' }),
        })
      );

      analyticsMock.trackEvent.mockClear();
      savedFindUnique.mockResolvedValue({ uid: 'save-1' });
      await service.save('job-1', 'me@example.com');

      expect(analyticsMock.trackEvent).not.toHaveBeenCalled();
    });

    it('refuses a job that is not on the board', async () => {
      jobOpeningFindUnique.mockResolvedValue(null);
      await expect(service.save('nope', 'me@example.com')).rejects.toBeInstanceOf(NotFoundException);

      jobOpeningFindUnique.mockResolvedValue({
        uid: 'job-1',
        roleTitle: 'Engineer',
        sourceLink: null,
        status: JobOpeningStatus.CLOSED_ROLE_FILLED,
        teamUid: 'team-1',
        team: { uid: 'team-1', name: 'Acme', jobReferEmail: null, jobReferCcEmails: [] },
      });
      await expect(service.save('job-1', 'me@example.com')).rejects.toBeInstanceOf(NotFoundException);

      jobOpeningFindUnique.mockResolvedValue({
        uid: 'job-1',
        roleTitle: 'Engineer',
        sourceLink: null,
        status: JobOpeningStatus.NEW,
        teamUid: null,
        team: null,
      });
      await expect(service.save('job-1', 'me@example.com')).rejects.toBeInstanceOf(NotFoundException);

      expect(savedUpsert).not.toHaveBeenCalled();
    });

    it('refuses an anonymous, unknown or soft-deleted member', async () => {
      await expect(service.save('job-1', undefined)).rejects.toBeInstanceOf(UnauthorizedException);

      memberFindUnique.mockResolvedValue(null);
      await expect(service.save('job-1', 'ghost@example.com')).rejects.toBeInstanceOf(UnauthorizedException);

      memberFindUnique.mockResolvedValue({ uid: 'member-1', deletedAt: new Date() });
      await expect(service.save('job-1', 'gone@example.com')).rejects.toBeInstanceOf(UnauthorizedException);

      expect(savedUpsert).not.toHaveBeenCalled();
    });

    it('does not gate on approval state', async () => {
      // The member row is all the gate reads: no approval join, no approval field.
      await service.save('job-1', 'pending@example.com');

      expect(memberFindUnique).toHaveBeenCalledWith({
        where: { email: 'pending@example.com' },
        select: { uid: true, deletedAt: true },
      });
    });
  });

  describe('unsave', () => {
    it('removes the caller own save and answers with the viewer flag', async () => {
      await expect(service.unsave('job-1', 'me@example.com')).resolves.toEqual({
        jobUid: 'job-1',
        viewerHasSaved: false,
      });

      expect(savedDeleteMany).toHaveBeenCalledWith({
        where: { jobOpeningUid: 'job-1', memberUid: 'member-1' },
      });
    });

    it('is a no-op when nothing was saved', async () => {
      savedDeleteMany.mockResolvedValue({ count: 0 });

      await expect(service.unsave('job-1', 'me@example.com')).resolves.toEqual({
        jobUid: 'job-1',
        viewerHasSaved: false,
      });
    });

    it('works on a job that has since closed, and never looks the job up', async () => {
      jobOpeningFindUnique.mockResolvedValue({
        uid: 'job-1',
        roleTitle: 'Engineer',
        sourceLink: null,
        status: JobOpeningStatus.CLOSED_ROLE_FILLED,
        teamUid: 'team-1',
        team: { uid: 'team-1', name: 'Acme', jobReferEmail: null, jobReferCcEmails: [] },
      });

      await expect(service.unsave('job-1', 'me@example.com')).resolves.toEqual({
        jobUid: 'job-1',
        viewerHasSaved: false,
      });
      expect(jobOpeningFindUnique).not.toHaveBeenCalled();
    });

    it('refuses an anonymous caller', async () => {
      await expect(service.unsave('job-1', undefined)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(savedDeleteMany).not.toHaveBeenCalled();
    });

    it('records no analytics event', async () => {
      await service.unsave('job-1', 'me@example.com');
      expect(analyticsMock.trackEvent).not.toHaveBeenCalled();
    });
  });

  describe('listMine', () => {
    it('returns the caller saves newest first, with the save time', async () => {
      savedFindMany.mockResolvedValue([
        { uid: 'save-2', jobOpeningUid: 'job-2', createdAt: new Date('2026-09-19T10:00:00.000Z') },
        { uid: 'save-1', jobOpeningUid: 'job-1', createdAt: new Date('2026-09-13T10:00:00.000Z') },
      ]);

      await expect(service.listMine('me@example.com')).resolves.toEqual({
        savedJobs: [
          { uid: 'save-2', jobUid: 'job-2', savedAt: '2026-09-19T10:00:00.000Z' },
          { uid: 'save-1', jobUid: 'job-1', savedAt: '2026-09-13T10:00:00.000Z' },
        ],
      });

      expect(savedFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } })
      );
    });

    it('asks only for the caller saves whose job is still on the board', async () => {
      await service.listMine('me@example.com');

      const where = savedFindMany.mock.calls[0][0].where;
      expect(where.memberUid).toBe('member-1');
      expect(where.jobOpening.teamUid).toEqual({ not: null });
      expect(where.jobOpening.status.notIn).toEqual(
        expect.arrayContaining([JobOpeningStatus.CLOSED_ROLE_FILLED, JobOpeningStatus.STALE])
      );
    });

    it('answers an empty list rather than a refusal when nothing is saved', async () => {
      await expect(service.listMine('me@example.com')).resolves.toEqual({ savedJobs: [] });
    });

    it('refuses an anonymous caller', async () => {
      await expect(service.listMine(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(savedFindMany).not.toHaveBeenCalled();
    });

    it('never widens the read past the caller', async () => {
      await service.listMine('me@example.com');

      expect(savedFindMany.mock.calls[0][0].where.memberUid).toBe('member-1');
    });
  });
});
