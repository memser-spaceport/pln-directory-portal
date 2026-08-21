jest.mock('../notifications/notification-service.client', () => ({
  NotificationServiceClient: class NotificationServiceClient {},
}));

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JobOpeningStatus, MemberApprovalState, JobSearchStatus } from '@prisma/client';
import { CreateJobApplicationSchema } from 'libs/contracts/src/schema/job-application';
import type { PrismaService } from '../shared/prisma.service';
import { JobOpeningsApplicationService } from './job-openings-application.service';

type PrismaMock = {
  member: { findUnique: jest.Mock };
  jobOpening: { findUnique: jest.Mock };
  jobApplication: { findUnique: jest.Mock; findMany: jest.Mock; create: jest.Mock };
  teamMemberRole: { findMany: jest.Mock };
};

const buildPrismaMock = (): PrismaMock => ({
  member: { findUnique: jest.fn() },
  jobOpening: { findUnique: jest.fn() },
  jobApplication: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
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
  memberApproval: { state: MemberApprovalState.APPROVED },
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
  teamMemberRoles: [{ mainTeam: true, team: { name: 'LabOS' } }],
};

const jobOpening = {
  uid: 'job-1',
  roleTitle: 'Staff Engineer',
  sourceLink: 'https://jobs.example/role',
  status: JobOpeningStatus.CONFIRMED,
  teamUid: 'team-1',
  team: { uid: 'team-1', name: 'Airship' },
};

const lead = { member: { uid: 'lead-1', name: 'Lead', email: 'lead@airship.com' } };

describe('JobOpeningsApplicationService', () => {
  let service: JobOpeningsApplicationService;
  let prisma: PrismaMock;
  let notificationServiceClient: { sendNotification: jest.Mock };

  beforeEach(() => {
    prisma = buildPrismaMock();
    notificationServiceClient = { sendNotification: jest.fn().mockResolvedValue({}) };
    service = new JobOpeningsApplicationService(
      prisma as unknown as PrismaService,
      notificationServiceClient as never
    );
    process.env.WEB_UI_BASE_URL = 'https://directory.test';
  });

  function mockHappyPath() {
    prisma.member.findUnique.mockResolvedValue(applicant);
    prisma.jobApplication.findUnique.mockResolvedValue(null);
    prisma.jobOpening.findUnique.mockResolvedValue(jobOpening);
    prisma.teamMemberRole.findMany.mockResolvedValue([
      lead,
      { member: { uid: 'lead-2', name: 'Lead Two', email: 'lead2@airship.com' } },
    ]);
    prisma.jobApplication.create.mockResolvedValue({
      uid: 'app-1',
      createdAt: new Date('2026-08-19T12:00:00.000Z'),
    });
  }

  it('applies when approved with role, status, and cover letter', async () => {
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
      })
    );
    const snapshot = prisma.jobApplication.create.mock.calls[0][0].data.profileSnapshot;
    expect(snapshot.jobSearchStatus).toBeUndefined();
    expect(snapshot.currentCompany).toBe('LabOS');
    expect(snapshot.role).toBe('Engineer');
  });

  it.each([
    MemberApprovalState.PENDING,
    MemberApprovalState.VERIFIED,
    MemberApprovalState.REJECTED,
  ])('rejects %s members without emailing', async (state) => {
    prisma.member.findUnique.mockResolvedValue({
      ...applicant,
      memberApproval: { state },
    });

    await expect(service.apply('job-1', 'ada@example.com', { coverLetter: 'Hi' })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(notificationServiceClient.sendNotification).not.toHaveBeenCalled();
    expect(prisma.jobApplication.create).not.toHaveBeenCalled();
  });

  it('rejects missing role or missing status', async () => {
    prisma.member.findUnique.mockResolvedValue({ ...applicant, role: '  ' });
    await expect(service.apply('job-1', 'ada@example.com', { coverLetter: 'Hi' })).rejects.toBeInstanceOf(
      BadRequestException
    );

    prisma.member.findUnique.mockResolvedValue({ ...applicant, jobSearchStatus: null });
    await expect(service.apply('job-1', 'ada@example.com', { coverLetter: 'Hi' })).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(notificationServiceClient.sendNotification).not.toHaveBeenCalled();
  });

  it('allows not-looking when a role is set', async () => {
    mockHappyPath();
    prisma.member.findUnique.mockResolvedValue({
      ...applicant,
      jobSearchStatus: JobSearchStatus.NOT_LOOKING,
    });

    await expect(service.apply('job-1', 'ada@example.com', { coverLetter: 'Hi' })).resolves.toMatchObject({
      uid: 'app-1',
    });
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
    expect(result.applications).toEqual([
      { uid: 'app-1', jobUid: 'job-1', appliedAt: '2026-08-19T12:00:00.000Z' },
    ]);
  });

  it('rejects empty or overlong cover letters at the contract boundary', () => {
    expect(CreateJobApplicationSchema.safeParse({ coverLetter: '   ' }).success).toBe(false);
    expect(CreateJobApplicationSchema.safeParse({ coverLetter: 'a'.repeat(2001) }).success).toBe(false);
    expect(CreateJobApplicationSchema.safeParse({ coverLetter: 'Hello' }).success).toBe(true);
  });
});
