import { ContactSupportService } from './contact-support.service';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { AwsService } from '../utils/aws/aws.service';
import { NotificationServiceClient } from '../notifications/notification-service.client';

jest.mock('../notifications/notification-service.client', () => ({
  NotificationServiceClient: jest.fn(),
}));
jest.mock('../utils/aws/aws.service', () => ({
  AwsService: jest.fn(),
}));
jest.mock('../shared/prisma.service', () => ({
  PrismaService: jest.fn(),
}));
jest.mock('../shared/log.service', () => ({
  LogService: jest.fn(),
}));

describe('ContactSupportService', () => {
  const create = jest.fn();
  const sendTelegramOutboxMessage = jest.fn();
  const logger = { info: jest.fn(), error: jest.fn() };
  let service: ContactSupportService;

  const telegramText = (): string => sendTelegramOutboxMessage.mock.calls[0][0].text;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.IS_EMAIL_ENABLED;
    create.mockResolvedValue({ uid: 'req-1' });
    sendTelegramOutboxMessage.mockResolvedValue(undefined);
    service = new ContactSupportService(
      { contactSupportRequest: { create } } as unknown as PrismaService,
      logger as unknown as LogService,
      {} as AwsService,
      { sendTelegramOutboxMessage } as unknown as NotificationServiceClient
    );
  });

  it('adds a Page line after the message when metadata.page is an http(s) URL', async () => {
    const message =
      '<p>Broken</p><p><img src="https://cdn.test/raw.png" data-annotations="%7B%7D" data-flat-src="https://cdn.test/flat.png"></p>';

    await expect(
      service.createSupportRequest({
        topic: 'LabOS Feedback',
        email: 'ada@example.com',
        name: 'Ada',
        message,
        metadata: { logged: true, uid: 'm1', page: 'https://directory.plnetwork.io/members/m1?a=1&b=2' },
      })
    ).resolves.toEqual({ uid: 'req-1' });

    const lines = telegramText().split('\n');
    const pageIndex = lines.indexOf('Page: https://directory.plnetwork.io/members/m1?a=1&amp;b=2');
    expect(pageIndex).toBeGreaterThan(lines.findIndex((line) => line.startsWith('Message: ')));
    expect(telegramText()).toContain('https://cdn.test/flat.png');
    expect(telegramText()).not.toContain('https://cdn.test/raw.png');
  });

  it('sends without a Page line when metadata.page is missing or not http(s)', async () => {
    await service.createSupportRequest({ topic: 'Bug', message: 'plain text' });
    await service.createSupportRequest({ topic: 'Bug', message: 'plain text', metadata: { page: 'about:blank' } });

    expect(sendTelegramOutboxMessage).toHaveBeenCalledTimes(2);
    for (const [payload] of sendTelegramOutboxMessage.mock.calls) {
      expect(payload.text).not.toContain('Page:');
      expect(payload.text).toContain('Message: plain text');
    }
  });

  it('saves the message and metadata as sent', async () => {
    const message = '<p><img src="https://cdn.test/raw.png" data-flat-src="https://cdn.test/flat.png"></p>';
    const metadata = { page: 'https://directory.plnetwork.io/home' };

    await service.createSupportRequest({ topic: 'LabOS Feedback', message, metadata });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ topic: 'LabOS Feedback', message, metadata }),
    });
  });

  it('still returns the request uid when the Telegram send fails', async () => {
    sendTelegramOutboxMessage.mockRejectedValue(new Error('down'));

    await expect(
      service.createSupportRequest({ topic: 'Bug', message: 'x', metadata: { page: 'https://x.test/' } })
    ).resolves.toEqual({ uid: 'req-1' });
    expect(logger.error).toHaveBeenCalled();
  });
});
