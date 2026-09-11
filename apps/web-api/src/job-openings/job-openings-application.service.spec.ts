jest.mock('../notifications/notification-service.client', () => ({
  NotificationServiceClient: class NotificationServiceClient {},
}));

import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JobOpeningStatus, JobSearchStatus } from '@prisma/client';
import { CreateJobApplicationSchema } from 'libs/contracts/src/schema/job-application';
import type { PrismaService } from '../shared/prisma.service';
import { PROTOCOL_LABS_TEAM_UID } from '../team-news/team-news-public-list.config';
import { JobOpeningsApplicationService } from './job-openings-application.service';

type PrismaMock = {
  member: { findUnique: jest.Mock; count: jest.Mock };
  jobOpening: { findUnique: jest.Mock };
  jobApplication: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    count: jest.Mock;
  };
  teamMemberRole: { findMany: jest.Mock };
};

const buildPrismaMock = (): PrismaMock => ({
  member: { findUnique: jest.fn(), count: jest.fn().mockResolvedValue(1) },
  jobOpening: { findUnique: jest.fn() },
  jobApplication: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    count: jest.fn().mockResolvedValue(8),
  },
  teamMemberRole: { findMany: jest.fn() },
});

const applicant = {
  uid: 'member-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  role: 'Engineer',
  currentCompany: null,
  jobSearchStatus: JobSearchStatus.NOT_LOOKING,
  bio: 'Bio',
  githubHandler: 'ada',
  linkedinHandler: 'ada-li',
  deletedAt: null,
  location: { city: 'London', country: 'UK', region: 'England' },
  skills: [{ title: 'TypeScript' }],
  experiences: [
    {
      title: 'Engineer',
      company: 'Analytical Engine',
      location: 'London',
      startDate: new Date('2020-01-01'),
      endDate: null,
      isCurrent: true,
      description: 'Math',
    },
  ],
  projectContributions: [
    {
      role: 'Contributor',
      description: 'Notes',
      currentProject: true,
      startDate: new Date('2021-01-01'),
      endDate: null,
      project: { name: 'Difference Engine' },
    },
  ],
  teamMemberRoles: [{ mainTeam: true, role: null, team: { name: 'LabOS' } }],
};

const jobOpening = {
  uid: 'job-1',
  roleTitle: 'Staff Engineer',
  sourceLink: 'https://jobs.example/role',
  status: JobOpeningStatus.CONFIRMED,
  teamUid: 'team-1',
  team: { uid: 'team-1', name: 'Airship', jobReferEmail: null as string | null, jobReferCcEmails: [] as string[] },
};

const lead = { member: { uid: 'lead-1', name: 'Lead', email: 'lead@airship.com' } };

describe('JobOpeningsApplicationService', () => {
  let service: JobOpeningsApplicationService;
  let prisma: PrismaMock;
  let notificationServiceClient: { sendNotification: jest.Mock };

  beforeEach(() => {
    prisma = buildPrismaMock();
    notificationServiceClient = { sendNotification: jest.fn().mockResolvedValue({}) };
    service = new JobOpeningsApplicationService(prisma as unknown as PrismaService, notificationServiceClient as never);
    process.env.WEB_UI_BASE_URL = 'https://directory.test';
  });

  function mockHappyPath(team: typeof jobOpening.team & { hasInactiveLeadEmails?: boolean } = jobOpening.team) {
    prisma.member.findUnique.mockResolvedValue(applicant);
    prisma.jobApplication.findUnique.mockResolvedValue(null);
    prisma.jobOpening.findUnique.mockResolvedValue({ ...jobOpening, teamUid: team.uid, team });
    prisma.teamMemberRole.findMany.mockResolvedValue([
      lead,
      { member: { uid: 'lead-2', name: 'Lead Two', email: 'lead2@airship.com' } },
    ]);
    prisma.jobApplication.create.mockResolvedValue({
      uid: 'app-1',
      createdAt: new Date('2026-08-19T12:00:00.000Z'),
    });
  }

  it('applies with role, status, and cover letter', async () => {
    mockHappyPath();

    const result = await service.apply('job-1', 'ada@example.com', { coverLetter: 'I would like this role.' });

    expect(result).toEqual({
      uid: 'app-1',
      jobUid: 'job-1',
      appliedAt: '2026-08-19T12:00:00.000Z',
    });
    expect(notificationServiceClient.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: 'JOB_BOARD_APPLICATION_EMAIL',
        recipientsInfo: {
          to: ['lead@airship.com'],
          cc: ['lead2@airship.com'],
          replyTo: 'ada@example.com',
        },
        deliveryPayload: {
          body: expect.objectContaining({
            applicant: {
              name: 'Ada Lovelace',
              profileUrl:
                'https://directory.test/members/member-1?utm_source=job_application_email&utm_medium=email&utm_content=applicant&job_uid=job-1',
              headline: 'Engineer, LabOS',
              location: 'London, UK',
              skills: ['TypeScript'],
            },
            roleTitle: 'Staff Engineer',
            teamName: 'Airship',
            applyUrl: 'https://directory.test/jobs?job=job-1',
          }),
        },
      })
    );
    const snapshot = prisma.jobApplication.create.mock.calls[0][0].data.profileSnapshot;
    expect(snapshot.jobSearchStatus).toBeUndefined();
    expect(snapshot.currentCompany).toBe('LabOS');
    expect(snapshot.role).toBe('Engineer');
    expect(prisma.jobApplication.count).not.toHaveBeenCalled();
  });

  it('tags the applicant card so the email click can be attributed', async () => {
    mockHappyPath();

    await service.apply('job-1', 'ada@example.com', { coverLetter: 'Hi' });

    const body = notificationServiceClient.sendNotification.mock.calls[0][0].deliveryPayload.body;
    expect(body.applicant.profileUrl).toBe(
      'https://directory.test/members/member-1?utm_source=job_application_email&utm_medium=email&utm_content=applicant&job_uid=job-1'
    );
    // The stored snapshot is a record of the application, not a link anyone
    // clicks — it keeps the plain URL.
    expect(prisma.jobApplication.create.mock.calls[0][0].data.profileSnapshot.profileUrl).toBe(
      'https://directory.test/members/member-1'
    );
  });

  it('sends immediately when the applicant profile is visible and stamps sentAt', async () => {
    mockHappyPath();

    await expect(service.apply('job-1', 'ada@example.com', { coverLetter: 'Hi' })).resolves.toMatchObject({
      jobUid: 'job-1',
    });

    expect(prisma.member.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ uid: 'member-1', OR: expect.any(Array) }) })
    );
    expect(notificationServiceClient.sendNotification).toHaveBeenCalledTimes(1);
    expect(prisma.jobApplication.create.mock.calls[0][0].data.sentAt).toBeInstanceOf(Date);
  });

  it('stores the application without emailing when the applicant profile is not visible', async () => {
    mockHappyPath();
    prisma.member.count.mockResolvedValue(0);

    await expect(service.apply('job-1', 'ada@example.com', { coverLetter: 'Hi' })).resolves.toEqual({
      uid: 'app-1',
      jobUid: 'job-1',
      appliedAt: '2026-08-19T12:00:00.000Z',
    });

    expect(notificationServiceClient.sendNotification).not.toHaveBeenCalled();
    expect(prisma.jobApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          memberUid: 'member-1',
          toEmail: 'lead@airship.com',
          ccEmails: ['lead2@airship.com'],
          sentAt: null,
        }),
      })
    );
  });

  describe('sendPendingApplications', () => {
    const pendingApplication = { uid: 'app-1', jobOpeningUid: 'job-1', coverLetter: 'Hi there' };

    it('claims the application before emailing so it can never be sent twice', async () => {
      prisma.jobApplication.findMany.mockResolvedValue([pendingApplication]);
      prisma.member.findUnique.mockResolvedValue(applicant);
      prisma.jobOpening.findUnique.mockResolvedValue(jobOpening);
      prisma.teamMemberRole.findMany.mockResolvedValue([lead]);
      const order: string[] = [];
      prisma.jobApplication.updateMany.mockImplementation(async () => {
        order.push('claim');
        return { count: 1 };
      });
      notificationServiceClient.sendNotification.mockImplementation(async () => {
        order.push('send');
        return {};
      });

      await service.sendPendingApplications('member-1');

      expect(order).toEqual(['claim', 'send']);
      expect(prisma.jobApplication.updateMany).toHaveBeenCalledTimes(1);
    });

    it('skips an application another run already claimed', async () => {
      prisma.jobApplication.findMany.mockResolvedValue([pendingApplication]);
      prisma.member.findUnique.mockResolvedValue(applicant);
      prisma.jobOpening.findUnique.mockResolvedValue(jobOpening);
      prisma.teamMemberRole.findMany.mockResolvedValue([lead]);
      prisma.jobApplication.updateMany.mockResolvedValue({ count: 0 });

      await service.sendPendingApplications('member-1');

      expect(notificationServiceClient.sendNotification).not.toHaveBeenCalled();
    });

    it('keeps the claim when the email fails instead of retrying later', async () => {
      prisma.jobApplication.findMany.mockResolvedValue([pendingApplication]);
      prisma.member.findUnique.mockResolvedValue(applicant);
      prisma.jobOpening.findUnique.mockResolvedValue(jobOpening);
      prisma.teamMemberRole.findMany.mockResolvedValue([lead]);
      notificationServiceClient.sendNotification.mockRejectedValue(new Error('timeout'));

      await expect(service.sendPendingApplications('member-1')).resolves.toBeUndefined();

      expect(prisma.jobApplication.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.jobApplication.updateMany.mock.calls[0][0].data.sentAt).toBeInstanceOf(Date);
    });

    it('emails unsent applications once the member profile is visible and stamps sentAt', async () => {
      prisma.jobApplication.findMany.mockResolvedValue([pendingApplication]);
      prisma.member.findUnique.mockResolvedValue(applicant);
      prisma.jobOpening.findUnique.mockResolvedValue(jobOpening);
      prisma.teamMemberRole.findMany.mockResolvedValue([lead]);

      await service.sendPendingApplications('member-1');

      expect(prisma.jobApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { memberUid: 'member-1', sentAt: null } })
      );
      expect(prisma.member.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { uid: 'member-1' } }));
      expect(notificationServiceClient.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientsInfo: expect.objectContaining({ to: ['lead@airship.com'], cc: [], replyTo: 'ada@example.com' }),
          deliveryPayload: { body: expect.objectContaining({ coverLetterHtml: expect.stringContaining('Hi there') }) },
        })
      );
      expect(prisma.jobApplication.updateMany).toHaveBeenCalledWith({
        where: { uid: 'app-1', sentAt: null },
        data: expect.objectContaining({
          toEmail: 'lead@airship.com',
          ccEmails: [],
          sentAt: expect.any(Date),
          profileSnapshot: expect.objectContaining({ memberUid: 'member-1' }),
        }),
      });
    });

    it('does nothing when there are no unsent applications', async () => {
      prisma.jobApplication.findMany.mockResolvedValue([]);

      await service.sendPendingApplications('member-1');

      expect(prisma.member.findUnique).not.toHaveBeenCalled();
      expect(notificationServiceClient.sendNotification).not.toHaveBeenCalled();
    });

    it('leaves applications unsent while the profile is still not visible', async () => {
      prisma.jobApplication.findMany.mockResolvedValue([pendingApplication]);
      prisma.member.findUnique.mockResolvedValue(applicant);
      prisma.member.count.mockResolvedValue(0);

      await service.sendPendingApplications('member-1');

      expect(notificationServiceClient.sendNotification).not.toHaveBeenCalled();
      expect(prisma.jobApplication.updateMany).not.toHaveBeenCalled();
    });

    it('skips a job that is now hidden and keeps the application unsent', async () => {
      prisma.jobApplication.findMany.mockResolvedValue([pendingApplication]);
      prisma.member.findUnique.mockResolvedValue(applicant);
      prisma.jobOpening.findUnique.mockResolvedValue({ ...jobOpening, status: JobOpeningStatus.STALE });

      await expect(service.sendPendingApplications('member-1')).resolves.toBeUndefined();

      expect(notificationServiceClient.sendNotification).not.toHaveBeenCalled();
      expect(prisma.jobApplication.updateMany).not.toHaveBeenCalled();
    });
  });

  /* The one account state that still cannot apply, and it never went through
     the approval check: a rejected member is soft-deleted, so `resolveApplicant`
     refuses them before anything else runs. Worth pinning now that the
     approval branch above is gone — otherwise nothing covers it. */
  it('refuses a soft-deleted member without emailing', async () => {
    prisma.member.findUnique.mockResolvedValue({ ...applicant, deletedAt: new Date('2026-01-01') });

    await expect(service.apply('job-1', 'ada@example.com', { coverLetter: 'Hi' })).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(notificationServiceClient.sendNotification).not.toHaveBeenCalled();
    expect(prisma.jobApplication.create).not.toHaveBeenCalled();
  });

  it('applies without a role or a job search status', async () => {
    mockHappyPath();
    prisma.member.findUnique.mockResolvedValue({ ...applicant, role: '  ', jobSearchStatus: null });

    await expect(service.apply('job-1', 'ada@example.com', { coverLetter: 'Hi' })).resolves.toMatchObject({
      uid: 'app-1',
    });
    expect(notificationServiceClient.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('returns 409 for a duplicate apply and does not send a second email', async () => {
    prisma.member.findUnique.mockResolvedValue(applicant);
    prisma.jobApplication.findUnique.mockResolvedValue({ uid: 'existing' });

    await expect(service.apply('job-1', 'ada@example.com', { coverLetter: 'Hi' })).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(notificationServiceClient.sendNotification).not.toHaveBeenCalled();
  });

  it('returns 404 for a hidden job', async () => {
    prisma.member.findUnique.mockResolvedValue(applicant);
    prisma.jobApplication.findUnique.mockResolvedValue(null);
    prisma.jobOpening.findUnique.mockResolvedValue({
      ...jobOpening,
      status: JobOpeningStatus.STALE,
    });

    await expect(service.apply('job-1', 'ada@example.com', { coverLetter: 'Hi' })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('excludes leads marked with an inactive email from the recipients query', async () => {
    mockHappyPath();

    await service.apply('job-1', 'ada@example.com', { coverLetter: 'Hi' });

    expect(prisma.teamMemberRole.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ member: expect.objectContaining({ hasInactiveEmail: false }) }),
      })
    );
  });

  it('returns 400 when the team is flagged with inactive lead emails', async () => {
    mockHappyPath({ ...jobOpening.team, hasInactiveLeadEmails: true });

    await expect(service.apply('job-1', 'ada@example.com', { coverLetter: 'Hi' })).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(prisma.teamMemberRole.findMany).not.toHaveBeenCalled();
    expect(notificationServiceClient.sendNotification).not.toHaveBeenCalled();
  });

  it('returns 400 when there are no team leads with email', async () => {
    prisma.member.findUnique.mockResolvedValue(applicant);
    prisma.jobApplication.findUnique.mockResolvedValue(null);
    prisma.jobOpening.findUnique.mockResolvedValue(jobOpening);
    prisma.teamMemberRole.findMany.mockResolvedValue([]);

    await expect(service.apply('job-1', 'ada@example.com', { coverLetter: 'Hi' })).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(notificationServiceClient.sendNotification).not.toHaveBeenCalled();
  });

  it('sends only to the Protocol Labs job-refer email and does not load team leads', async () => {
    mockHappyPath({
      uid: PROTOCOL_LABS_TEAM_UID,
      name: 'Protocol Labs',
      jobReferEmail: 'jobs@protocol.ai',
      jobReferCcEmails: [],
    });

    await service.apply('job-1', 'ada@example.com', { coverLetter: 'I would like this role.' });

    expect(notificationServiceClient.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientsInfo: {
          to: ['jobs@protocol.ai'],
          cc: [],
          replyTo: 'ada@example.com',
        },
        targetMeta: {
          emailId: 'jobs@protocol.ai',
          userId: PROTOCOL_LABS_TEAM_UID,
          userName: 'Protocol Labs',
        },
      })
    );
    expect(prisma.teamMemberRole.findMany).not.toHaveBeenCalled();
    expect(prisma.jobApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toEmail: 'jobs@protocol.ai',
          ccEmails: [],
        }),
      })
    );
  });

  it('CCs Protocol Labs job-refer CC emails when they are set', async () => {
    mockHappyPath({
      uid: PROTOCOL_LABS_TEAM_UID,
      name: 'Protocol Labs',
      jobReferEmail: 'jobs@protocol.ai',
      jobReferCcEmails: ['hiring@protocol.ai', ' talent@protocol.ai ', 'JOBS@protocol.ai', ''],
    });

    await service.apply('job-1', 'ada@example.com', { coverLetter: 'I would like this role.' });

    expect(notificationServiceClient.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientsInfo: {
          to: ['jobs@protocol.ai'],
          cc: ['hiring@protocol.ai', 'talent@protocol.ai'],
          replyTo: 'ada@example.com',
        },
      })
    );
    expect(prisma.jobApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toEmail: 'jobs@protocol.ai',
          ccEmails: ['hiring@protocol.ai', 'talent@protocol.ai'],
        }),
      })
    );
    expect(prisma.teamMemberRole.findMany).not.toHaveBeenCalled();
  });

  it('rejects a Protocol Labs apply when the job-refer email is missing', async () => {
    mockHappyPath({
      uid: PROTOCOL_LABS_TEAM_UID,
      name: 'Protocol Labs',
      jobReferEmail: null,
      jobReferCcEmails: [],
    });

    await expect(service.apply('job-1', 'ada@example.com', { coverLetter: 'Hi' })).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(notificationServiceClient.sendNotification).not.toHaveBeenCalled();
    expect(prisma.jobApplication.create).not.toHaveBeenCalled();
    expect(prisma.teamMemberRole.findMany).not.toHaveBeenCalled();
  });

  it('rejects a Protocol Labs apply when the job-refer email is blank', async () => {
    mockHappyPath({
      uid: PROTOCOL_LABS_TEAM_UID,
      name: 'Protocol Labs',
      jobReferEmail: '   ',
      jobReferCcEmails: [],
    });

    await expect(service.apply('job-1', 'ada@example.com', { coverLetter: 'Hi' })).rejects.toMatchObject({
      message: 'This job is not accepting in-app applications',
    });
    expect(notificationServiceClient.sendNotification).not.toHaveBeenCalled();
    expect(prisma.jobApplication.create).not.toHaveBeenCalled();
  });

  it('still emails team leads for a non-Protocol Labs team that has a job-refer email', async () => {
    mockHappyPath({ ...jobOpening.team, jobReferEmail: 'jobs@airship.com' });

    await service.apply('job-1', 'ada@example.com', { coverLetter: 'Hi' });

    expect(notificationServiceClient.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientsInfo: {
          to: ['lead@airship.com'],
          cc: ['lead2@airship.com'],
          replyTo: 'ada@example.com',
        },
      })
    );
    expect(prisma.teamMemberRole.findMany).toHaveBeenCalled();
    expect(prisma.jobApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toEmail: 'lead@airship.com',
          ccEmails: ['lead2@airship.com'],
        }),
      })
    );
  });

  it('requires an authenticated email', async () => {
    await expect(service.apply('job-1', undefined, { coverLetter: 'Hi' })).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('lists only the current member applications', async () => {
    prisma.member.findUnique.mockResolvedValue(applicant);
    prisma.jobApplication.findMany.mockResolvedValue([
      { uid: 'app-1', jobOpeningUid: 'job-1', createdAt: new Date('2026-08-19T12:00:00.000Z') },
    ]);

    const result = await service.listMine('ada@example.com');
    expect(prisma.jobApplication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { memberUid: 'member-1' } })
    );
    expect(result.applications).toEqual([{ uid: 'app-1', jobUid: 'job-1', appliedAt: '2026-08-19T12:00:00.000Z' }]);
  });

  it('rejects empty or overlong cover letters at the contract boundary', () => {
    expect(CreateJobApplicationSchema.safeParse({ coverLetter: '   ' }).success).toBe(false);
    expect(CreateJobApplicationSchema.safeParse({ coverLetter: 'a'.repeat(2001) }).success).toBe(false);
    expect(CreateJobApplicationSchema.safeParse({ coverLetter: 'Hello' }).success).toBe(true);
  });
});
