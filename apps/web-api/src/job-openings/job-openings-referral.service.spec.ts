jest.mock('../notifications/notification-service.client', () => ({
  NotificationServiceClient: class NotificationServiceClient {},
}));

import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JobOpeningStatus } from '@prisma/client';
import { CreateJobReferralSchema, JobReferralDraftQuerySchema } from 'libs/contracts/src/schema/job-referral';
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
  team: { uid: 'team-1', name: 'Airship', jobReferEmail: null as string | null, jobReferCcEmails: [] as string[] },
};

const memberRecipients = [
  { memberUid: lead.uid, name: lead.name },
  { memberUid: leadTwo.uid, name: leadTwo.name },
];

const referralInput = {
  referredMemberUid: referred.uid,
  recipients: memberRecipients,
  note: 'Please consider Grace for this role.',
  includeReferredMember: true,
};

describe('JobOpeningsReferralService', () => {
  let service: JobOpeningsReferralService;
  let prisma: PrismaMock;
  let notificationServiceClient: { sendNotification: jest.Mock };

  beforeEach(() => {
    prisma = buildPrismaMock();
    notificationServiceClient = { sendNotification: jest.fn().mockResolvedValue({}) };
    service = new JobOpeningsReferralService(prisma as unknown as PrismaService, notificationServiceClient as never);
    process.env.WEB_UI_BASE_URL = 'https://directory.test';
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
          replyTo: `${referrer.email}, ${referred.email}`,
          bcc: [],
        },
        deliveryPayload: {
          body: expect.objectContaining({
            applyUrl: 'https://directory.test/jobs?job=job-1',
            roleTitle: 'Staff Engineer',
            teamName: 'Airship',
          }),
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

  it('skips ccing the referred member and sends them a separate notice when not included', async () => {
    mockHappyPath();

    const result = await service.referJob('job-1', referrer.email, { ...referralInput, includeReferredMember: false });

    expect(result.cc).toEqual([leadTwo.email, referrer.email]);
    expect(result.cc).not.toContain(referred.email);
    expect(notificationServiceClient.sendNotification).toHaveBeenCalledTimes(2);
    expect(notificationServiceClient.sendNotification).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        templateName: 'JOB_BOARD_REFERRAL_EMAIL',
        recipientsInfo: {
          to: [lead.email],
          cc: [leadTwo.email, referrer.email],
          replyTo: referrer.email,
          bcc: [],
        },
      })
    );
    expect(notificationServiceClient.sendNotification).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        templateName: 'JOB_BOARD_REFERRAL_NOTICE_EMAIL',
        recipientsInfo: {
          to: [referred.email],
          replyTo: referrer.email,
        },
        deliveryPayload: {
          body: expect.objectContaining({
            referredFirstName: 'Grace',
            referrerFirstName: 'Ada',
            roleTitle: 'Staff Engineer',
            teamName: 'Airship',
          }),
        },
      })
    );
    expect(prisma.jobReferral.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ccEmails: [leadTwo.email, referrer.email],
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
          replyTo: `${referrer.email}, ${referred.email}`,
          bcc: [],
        },
      })
    );
    expect(prisma.member.findMany).not.toHaveBeenCalled();
    expect(result.cc).not.toContain(lead.email);
    expect(result.cc).not.toContain(leadTwo.email);
  });

  it('CCs team job-refer CC emails when they are set', async () => {
    mockHappyPath({
      ...jobOpening.team,
      jobReferEmail: 'jobs@airship.com',
      jobReferCcEmails: ['hiring@airship.com', ' JOBS@airship.com ', referrer.email, ''],
    });

    const result = await service.referJob('job-1', referrer.email, referralInput);

    expect(result.to).toBe('jobs@airship.com');
    expect(result.cc).toEqual(['hiring@airship.com', referrer.email, referred.email]);
    expect(notificationServiceClient.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientsInfo: {
          to: ['jobs@airship.com'],
          cc: ['hiring@airship.com', referrer.email, referred.email],
          replyTo: `${referrer.email}, ${referred.email}`,
          bcc: [],
        },
      })
    );
    expect(prisma.member.findMany).not.toHaveBeenCalled();
  });

  it('sends to the team job-refer email when recipients are omitted', async () => {
    mockHappyPath({ ...jobOpening.team, jobReferEmail: 'jobs@airship.com' });

    const result = await service.referJob('job-1', referrer.email, {
      referredMemberUid: referred.uid,
      recipients: [],
      note: 'Please consider Grace for this role.',
      includeReferredMember: true,
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
        includeReferredMember: true,
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

  describe('referring someone outside the network (LAB-2509)', () => {
    const externalPerson = {
      name: 'Nia Okafor',
      email: 'nia@outside.example',
      linkedinUrl: 'nia-okafor',
    };

    const externalReferralInput = {
      referredPerson: externalPerson,
      recipients: memberRecipients,
      note: 'Please consider Nia for this role.',
      includeReferredMember: true,
    };

    it('rejects a body with both referredMemberUid and referredPerson', () => {
      expect(
        CreateJobReferralSchema.safeParse({
          referredMemberUid: referred.uid,
          referredPerson: externalPerson,
          note: 'note',
        }).success
      ).toBe(false);
    });

    it('rejects a body with neither referredMemberUid nor referredPerson', () => {
      expect(CreateJobReferralSchema.safeParse({ note: 'note' }).success).toBe(false);
    });

    it('requires name, email, and linkedinUrl on referredPerson', () => {
      expect(
        CreateJobReferralSchema.safeParse({
          referredPerson: { name: 'Nia Okafor', email: 'nia@outside.example' },
          note: 'note',
        }).success
      ).toBe(false);
    });

    it('sends the referral email using the submitted name/email/LinkedIn, without a Member lookup', async () => {
      mockMembers();
      prisma.jobOpening.findUnique.mockResolvedValue(jobOpening);
      prisma.jobReferral.create.mockResolvedValue({ uid: 'ref-2', createdAt: new Date('2026-08-25T12:00:00.000Z') });

      const result = await service.referJob('job-1', referrer.email, externalReferralInput);

      expect(result.cc).toEqual([leadTwo.email, referrer.email, externalPerson.email]);
      // The referred person is never resolved against Member — referredPerson bypasses that
      // lookup entirely, so no findUnique call is ever made with the external person's email.
      expect(prisma.member.findUnique).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: externalPerson.email } })
      );
      expect(notificationServiceClient.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          templateName: 'JOB_BOARD_REFERRAL_EMAIL',
          deliveryPayload: {
            body: expect.objectContaining({
              referred: expect.objectContaining({
                name: externalPerson.name,
                profileUrl: 'https://www.linkedin.com/in/nia-okafor',
                headline: null,
                location: null,
                skills: [],
              }),
            }),
          },
          targetMeta: expect.objectContaining({
            emailId: externalPerson.email,
            userId: null,
            userName: externalPerson.name,
          }),
        })
      );
      expect(prisma.jobReferral.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            referredMemberUid: null,
            referredName: externalPerson.name,
            referredEmail: externalPerson.email,
            referredLinkedinUrl: 'https://www.linkedin.com/in/nia-okafor',
          }),
        })
      );
    });

    it('treats a full LinkedIn URL as-is, without re-prefixing it', async () => {
      mockMembers();
      prisma.jobOpening.findUnique.mockResolvedValue(jobOpening);
      prisma.jobReferral.create.mockResolvedValue({ uid: 'ref-3', createdAt: new Date('2026-08-25T12:00:00.000Z') });

      await service.referJob('job-1', referrer.email, {
        ...externalReferralInput,
        referredPerson: { ...externalPerson, linkedinUrl: 'https://linkedin.com/in/nia-okafor' },
      });

      expect(notificationServiceClient.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryPayload: {
            body: expect.objectContaining({
              referred: expect.objectContaining({ profileUrl: 'https://linkedin.com/in/nia-okafor' }),
            }),
          },
        })
      );
    });

    it('still treats an email matching an existing member as an outside referral', async () => {
      mockMembers();
      prisma.jobOpening.findUnique.mockResolvedValue(jobOpening);
      prisma.jobReferral.create.mockResolvedValue({ uid: 'ref-4', createdAt: new Date('2026-08-25T12:00:00.000Z') });

      await service.referJob('job-1', referrer.email, {
        ...externalReferralInput,
        referredPerson: { ...externalPerson, email: referred.email },
      });

      expect(prisma.jobReferral.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ referredMemberUid: null, referredEmail: referred.email }),
        })
      );
    });

    it('drafts a note for an outside person from their name alone, with no about-paragraph', async () => {
      mockMembers();
      prisma.jobOpening.findUnique.mockResolvedValue(jobOpening);

      const draft = await service.getReferralDraft('job-1', referrer.email, { referredName: externalPerson.name });

      expect(draft.referredName).toBe(externalPerson.name);
      expect(draft.referredTitle).toBeNull();
      expect(draft.referredCompany).toBeNull();
      expect(draft.note).toContain(`I'd like to refer ${externalPerson.name} for your Staff Engineer role.`);
      // Only the referrer's headline is resolved — there's no Member record to look up a
      // team role for an outside person.
      expect(prisma.teamMemberRole.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.teamMemberRole.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { memberUid: referrer.uid } })
      );
    });

    it('rejects a draft query with both referredMemberUid and referredName', () => {
      expect(
        JobReferralDraftQuerySchema.safeParse({ referredMemberUid: referred.uid, referredName: 'Nia Okafor' }).success
      ).toBe(false);
    });

    it('rejects a draft query with neither referredMemberUid nor referredName', () => {
      expect(JobReferralDraftQuerySchema.safeParse({}).success).toBe(false);
    });
  });
});
