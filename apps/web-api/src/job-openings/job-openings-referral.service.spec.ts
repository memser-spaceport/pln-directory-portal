jest.mock('../notifications/notification-service.client', () => ({
  NotificationServiceClient: class NotificationServiceClient {},
}));

import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JobOpeningStatus } from '@prisma/client';
import { CreateJobReferralSchema } from 'libs/contracts/src/schema/job-referral';
import type { PrismaService } from '../shared/prisma.service';
import { JobOpeningsReferralService } from './job-openings-referral.service';

type PrismaMock = {
  member: { findUnique: jest.Mock; findMany: jest.Mock };
  jobOpening: { findUnique: jest.Mock };
  jobReferral: { create: jest.Mock };
  teamMemberRole: { findFirst: jest.Mock };
};

const buildPrismaMock = (): PrismaMock => ({
  member: { findUnique: jest.fn(), findMany: jest.fn() },
  jobOpening: { findUnique: jest.fn() },
  jobReferral: { create: jest.fn() },
  teamMemberRole: { findFirst: jest.fn().mockResolvedValue(null) },
});

const referrer = {
  uid: 'referrer-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  deletedAt: null,
  location: { city: 'London', country: 'United Kingdom' },
  skills: [{ title: 'Mathematics' }],
};

const referred = {
  uid: 'referred-1',
  name: 'Grace Hopper',
  email: 'grace@example.com',
  deletedAt: null,
  location: { city: 'Arlington', country: 'United States' },
  skills: [{ title: 'Compilers' }],
};

const lead = { uid: 'lead-1', name: 'Lead One', email: 'lead@airship.com', deletedAt: null };
const leadTwo = { uid: 'lead-2', name: 'Lead Two', email: 'lead2@airship.com', deletedAt: null };

const jobOpening = {
  uid: 'job-1',
  roleTitle: 'Staff Engineer',
  sourceLink: 'https://jobs.example/role',
  status: JobOpeningStatus.CONFIRMED,
  teamUid: 'team-1',
  team: { uid: 'team-1', name: 'Airship', jobReferEmail: null as string | null },
};

const memberRecipients = [
  { memberUid: lead.uid, name: lead.name },
  { memberUid: leadTwo.uid, name: leadTwo.name },
];

const referralInput = {
  referredMemberUid: referred.uid,
  recipients: memberRecipients,
  note: 'Please consider Grace for this role.',
};

describe('JobOpeningsReferralService', () => {
  let service: JobOpeningsReferralService;
  let prisma: PrismaMock;
  let notificationServiceClient: { sendNotification: jest.Mock };

  beforeEach(() => {
    prisma = buildPrismaMock();
    notificationServiceClient = { sendNotification: jest.fn().mockResolvedValue({}) };
    service = new JobOpeningsReferralService(prisma as unknown as PrismaService, notificationServiceClient as never);
  });

  function mockMembers() {
    prisma.member.findUnique.mockImplementation(({ where }: { where: { email?: string; uid?: string } }) => {
      if (where.email === referrer.email) return Promise.resolve(referrer);
      if (where.uid === referred.uid) return Promise.resolve(referred);
      return Promise.resolve(null);
    });
    prisma.member.findMany.mockResolvedValue([lead, leadTwo]);
  }

  function mockHappyPath(team = jobOpening.team) {
    mockMembers();
    prisma.jobOpening.findUnique.mockResolvedValue({ ...jobOpening, team });
    prisma.jobReferral.create.mockResolvedValue({
      uid: 'ref-1',
      createdAt: new Date('2026-08-25T12:00:00.000Z'),
    });
  }

  it('sends to selected members when the team has no job-refer email', async () => {
    mockHappyPath();

    const result = await service.referJob('job-1', referrer.email, referralInput);

    expect(result).toEqual({
      uid: 'ref-1',
      jobUid: 'job-1',
      to: lead.email,
      cc: [leadTwo.email, referrer.email, referred.email],
      sentAt: '2026-08-25T12:00:00.000Z',
    });
    expect(notificationServiceClient.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: 'JOB_BOARD_REFERRAL_EMAIL',
        recipientsInfo: {
          to: [lead.email],
          cc: [leadTwo.email, referrer.email, referred.email],
        },
      })
    );
    expect(prisma.jobReferral.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toEmail: lead.email,
          ccEmails: [leadTwo.email, referrer.email, referred.email],
        }),
      })
    );
  });

  it('sends only to the team job-refer email and ignores body recipients', async () => {
    mockHappyPath({ ...jobOpening.team, jobReferEmail: 'jobs@airship.com' });

    const result = await service.referJob('job-1', referrer.email, referralInput);

    expect(result.to).toBe('jobs@airship.com');
    expect(result.cc).toEqual([referrer.email, referred.email]);
    expect(notificationServiceClient.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientsInfo: {
          to: ['jobs@airship.com'],
          cc: [referrer.email, referred.email],
        },
      })
    );
    expect(prisma.member.findMany).not.toHaveBeenCalled();
    expect(result.cc).not.toContain(lead.email);
    expect(result.cc).not.toContain(leadTwo.email);
  });

  it('sends to the team job-refer email when recipients are omitted', async () => {
    mockHappyPath({ ...jobOpening.team, jobReferEmail: 'jobs@airship.com' });

    const result = await service.referJob('job-1', referrer.email, {
      referredMemberUid: referred.uid,
      recipients: [],
      note: 'Please consider Grace for this role.',
    });

    expect(result.to).toBe('jobs@airship.com');
    expect(result.cc).toEqual([referrer.email, referred.email]);
    expect(prisma.member.findMany).not.toHaveBeenCalled();
  });

  it('returns 400 when there is no job-refer email and no recipients', async () => {
    mockHappyPath();

    await expect(
      service.referJob('job-1', referrer.email, {
        referredMemberUid: referred.uid,
        recipients: [],
        note: 'Please consider Grace for this role.',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(notificationServiceClient.sendNotification).not.toHaveBeenCalled();
    expect(prisma.jobReferral.create).not.toHaveBeenCalled();
  });

  it('uses member recipients again after the job-refer email is cleared', async () => {
    mockHappyPath({ ...jobOpening.team, jobReferEmail: null });

    const result = await service.referJob('job-1', referrer.email, referralInput);

    expect(result.to).toBe(lead.email);
    expect(result.cc).toEqual([leadTwo.email, referrer.email, referred.email]);
    expect(prisma.member.findMany).toHaveBeenCalled();
  });

  it('requires an authenticated email', async () => {
    await expect(service.referJob('job-1', undefined, referralInput)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows omitted recipients at the contract boundary', () => {
    expect(
      CreateJobReferralSchema.safeParse({
        referredMemberUid: referred.uid,
        note: 'Please consider Grace for this role.',
      }).success
    ).toBe(true);
    expect(
      CreateJobReferralSchema.parse({
        referredMemberUid: referred.uid,
        note: 'Please consider Grace for this role.',
      }).recipients
    ).toEqual([]);
    expect(
      CreateJobReferralSchema.safeParse({
        referredMemberUid: referred.uid,
        recipients: memberRecipients,
        note: 'Please consider Grace for this role.',
      }).success
    ).toBe(true);
  });
});
