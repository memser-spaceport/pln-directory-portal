import type { LogService } from '../shared/log.service';
import type { PrismaService } from '../shared/prisma.service';
import type { NotificationServiceClient } from '../notifications/notification-service.client';
import { MemberSignUpNotificationsService } from './member-sign-up-notifications.service';

const member = {
  uid: 'member-1',
  name: 'Ada',
  email: 'ada@example.com',
  role: null,
  linkedinHandler: null,
  signUpSource: null,
  signUpMedium: null,
  signUpCampaign: null,
  jobSearchStatus: null,
  teamMemberRoles: [],
  policyAssignmentsV2: [],
};

describe('MemberSignUpNotificationsService', () => {
  let findUnique: jest.Mock;
  let sendTelegramOutboxMessage: jest.Mock;
  let logError: jest.Mock;
  let service: MemberSignUpNotificationsService;

  beforeEach(() => {
    findUnique = jest.fn().mockResolvedValue(member);
    sendTelegramOutboxMessage = jest.fn().mockResolvedValue({ status: 'enqueued' });
    logError = jest.fn();
    service = new MemberSignUpNotificationsService(
      { member: { findUnique } } as unknown as PrismaService,
      { sendTelegramOutboxMessage } as unknown as NotificationServiceClient,
      { error: logError } as unknown as LogService
    );
  });

  it.each([
    ['notifySignUp', 'SIGN_UP', 'SIGN_UP_AND_VERIFIED'],
    ['notifyLinkedInVerified', 'LINKEDIN_VERIFIED', 'SIGN_UP_AND_VERIFIED'],
    ['notifyJobAspirantSignUp', 'JOB_ASPIRANT_SIGN_UP', 'JOB_ASPIRANT_SIGN_UP'],
  ] as const)('%s posts to the %s channel', async (method, event, channelType) => {
    await service[method]('member-1');

    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { uid: 'member-1' } }));
    expect(sendTelegramOutboxMessage).toHaveBeenCalledWith({
      channelType,
      text: expect.stringContaining('Ada'),
      meta: { source: 'member-sign-up', event, memberUid: 'member-1' },
    });
  });

  it('skips a test account', async () => {
    findUnique.mockResolvedValue({ ...member, email: 'qa@yopmail.com' });

    await service.notifySignUp('member-1');

    expect(sendTelegramOutboxMessage).not.toHaveBeenCalled();
  });

  it('skips a seeded bot', async () => {
    findUnique.mockResolvedValue({ ...member, signUpSource: 'system-trending-seed' });

    await service.notifySignUp('member-1');

    expect(sendTelegramOutboxMessage).not.toHaveBeenCalled();
  });

  it('logs a failed post instead of throwing', async () => {
    sendTelegramOutboxMessage.mockRejectedValue(new Error('Notification service error.'));

    await expect(service.notifySignUp('member-1')).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledWith(
      'Member sign-up Telegram post failed: event=SIGN_UP memberUid=member-1: Notification service error.'
    );
  });
});
