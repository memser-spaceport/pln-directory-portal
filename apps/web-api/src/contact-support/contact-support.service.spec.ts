// Module factories keep Jest away from the AWS, notification and axios (ESM) imports.
jest.mock('axios', () => ({ create: jest.fn(() => ({ post: jest.fn() })) }));
jest.mock('../utils/aws/aws.service', () => ({ AwsService: jest.fn() }));
jest.mock('../notifications/notification-service.client', () => ({ NotificationServiceClient: jest.fn() }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: jest.fn() }));
jest.mock('../shared/log.service', () => ({ LogService: jest.fn() }));
jest.mock('../feedback-linear/feedback-linear-outbox.service', () => ({ FeedbackLinearOutboxService: jest.fn() }));

import { ContactSupportService } from './contact-support.service';

const ENV: Record<string, string> = {
  FEEDBACK_LINEAR_CLIENT_ID: 'cid',
  FEEDBACK_LINEAR_CLIENT_SECRET: 'secret',
  FEEDBACK_LINEAR_PLATFORM_TEAM_ID: 'lab-team',
  FEEDBACK_LINEAR_PLATFORM_STATE_ID: 'backlog-state',
  FEEDBACK_LINEAR_AI_APPS_PROJECT_ID: 'ai-apps-project',
  IS_EMAIL_ENABLED: 'false',
};

describe('ContactSupportService → Linear enqueue', () => {
  const saved: Record<string, string | undefined> = {};
  let prisma: { contactSupportRequest: { create: jest.Mock }; member: { findUnique: jest.Mock } };
  let telegram: { sendTelegramOutboxMessage: jest.Mock };
  let outbox: { enqueue: jest.Mock };
  let logger: { info: jest.Mock; error: jest.Mock };
  let service: ContactSupportService;

  function submit(overrides: Record<string, unknown> = {}) {
    return service.createSupportRequest({
      topic: 'Report a bug',
      email: 'Ada@B.co',
      name: 'Ada',
      message: '<p>Broken</p>',
      metadata: { uid: 'm1', logged: true, page: 'https://labos.test/x' },
      ...overrides,
    } as never);
  }

  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
    prisma = {
      contactSupportRequest: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ uid: 'cs1', createdAt: new Date(), ...data })),
      },
      member: { findUnique: jest.fn().mockResolvedValue({ email: 'ada@b.co' }) },
    };
    telegram = { sendTelegramOutboxMessage: jest.fn().mockResolvedValue(undefined) };
    outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
    logger = { info: jest.fn(), error: jest.fn() };
    service = new ContactSupportService(
      prisma as never,
      logger as never,
      {} as never,
      telegram as never,
      outbox as never
    );
  });

  afterEach(() => {
    for (const key of Object.keys(ENV)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it.each(['Give feedback', 'Share an idea', 'Report a bug', 'LabOS Feedback'])(
    'queues %s once, with no project',
    async (topic) => {
      await expect(submit({ topic })).resolves.toEqual({ uid: 'cs1' });
      expect(outbox.enqueue).toHaveBeenCalledTimes(1);
      expect(outbox.enqueue).toHaveBeenCalledWith({
        sourceType: 'CONTACT_SUPPORT',
        sourceUid: 'cs1',
        teamId: 'lab-team',
        projectId: null,
      });
    }
  );

  it('queues AI Apps Feedback into the AI Apps project', async () => {
    await submit({ topic: 'AI Apps Feedback' });
    expect(outbox.enqueue).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'ai-apps-project' }));
  });

  it.each(['Contact support', 'Ask a question', 'Something else'])('does not queue %s', async (topic) => {
    await submit({ topic });
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(telegram.sendTelegramOutboxMessage).toHaveBeenCalledTimes(1);
  });

  it('does not queue when the member email does not match', async () => {
    prisma.member.findUnique.mockResolvedValue({ email: 'someone@else.co' });
    await submit();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('does not queue when the member does not exist', async () => {
    prisma.member.findUnique.mockResolvedValue(null);
    await submit();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('does not queue without a member uid', async () => {
    await submit({ metadata: { logged: false } });
    expect(prisma.member.findUnique).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('does not queue without an email', async () => {
    await submit({ email: undefined });
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('does not queue when Linear is not configured', async () => {
    delete process.env.FEEDBACK_LINEAR_CLIENT_ID;
    await submit();
    expect(prisma.member.findUnique).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('still returns the uid and sends Telegram when queueing fails', async () => {
    outbox.enqueue.mockRejectedValue(new Error('db down'));
    await expect(submit()).resolves.toEqual({ uid: 'cs1' });
    expect(telegram.sendTelegramOutboxMessage).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to queue contact support request cs1 for Linear',
      expect.any(Error)
    );
  });

  it('still returns the uid when Telegram fails', async () => {
    telegram.sendTelegramOutboxMessage.mockRejectedValue(new Error('telegram down'));
    await expect(submit()).resolves.toEqual({ uid: 'cs1' });
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
  });
});
