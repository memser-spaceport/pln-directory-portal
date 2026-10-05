jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: class PushNotificationsService {},
}));

import { PushNotificationCategory } from '@prisma/client';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { PrismaService } from '../shared/prisma.service';
import { AiAppsStarterKitAnnouncementService } from './ai-apps-starter-kit-announcement.service';
import { AI_APPS_STARTER_KIT_VERSION } from './ai-apps.constants';

/**
 * LAB-2721: on a production API start, a starter kit version nobody was told about yet is broadcast once to AI Apps
 * access holders; restarts, a second instance, other environments and failures send nothing extra and never throw.
 */
describe('AiAppsStarterKitAnnouncementService', () => {
  const announcementCreate = jest.fn();
  const announcementDeleteMany = jest.fn();
  const notificationCreate = jest.fn();

  const prismaMock = {
    aiAppStarterKitAnnouncement: { create: announcementCreate, deleteMany: announcementDeleteMany },
  } as unknown as PrismaService;
  const pushNotificationsMock = { create: notificationCreate } as unknown as PushNotificationsService;

  let service: AiAppsStarterKitAnnouncementService;

  beforeEach(() => {
    jest.clearAllMocks();
    announcementCreate.mockResolvedValue({ id: 1, version: '1.17' });
    announcementDeleteMany.mockResolvedValue({ count: 1 });
    notificationCreate.mockResolvedValue({ uid: 'notification-1' });
    service = new AiAppsStarterKitAnnouncementService(prismaMock, pushNotificationsMock);
  });

  const uniqueViolation = () =>
    Object.assign(new Error('Unique constraint failed on the fields: (`version`)'), {
      code: 'P2002',
    });

  it('first production start with a new version records it and sends one broadcast to AI Apps access holders', async () => {
    await expect(service.announceCurrentVersion('1.17', 'production')).resolves.toBe('sent');

    expect(announcementCreate).toHaveBeenCalledTimes(1);
    expect(announcementCreate).toHaveBeenCalledWith({ data: { version: '1.17' } });
    expect(notificationCreate).toHaveBeenCalledTimes(1);
    expect(notificationCreate).toHaveBeenCalledWith({
      category: PushNotificationCategory.NEW_FEATURE,
      title: 'AI Apps',
      description: "AI Apps Starter Kit — updated to v1.17. Review what's new!",
      linkText: 'Get the starter kit →',
      link: '/pl-infra/ai-apps?dialog=addAiApp',
      isPublic: false,
      requiredPermissions: ['ai_apps.read', 'ai_apps.write'],
      metadata: {
        eventType: 'ai_app_starter_kit',
        trigger: 'starter_kit_updated',
        version: '1.17',
        link: '/pl-infra/ai-apps?dialog=addAiApp',
      },
    });
    expect(announcementDeleteMany).not.toHaveBeenCalled();
  });

  it('targets the audience by permission only: no single recipient, not public', async () => {
    await service.announceCurrentVersion('1.17', 'production');

    const dto = notificationCreate.mock.calls[0][0];
    expect(dto.recipientUid).toBeUndefined();
    expect(dto.isPublic).toBe(false);
    expect(dto.requiredPermissions).toEqual(['ai_apps.read', 'ai_apps.write']);
  });

  it('defaults to the current AI_APPS_STARTER_KIT_VERSION', async () => {
    await service.announceCurrentVersion(undefined, 'production');

    expect(announcementCreate).toHaveBeenCalledWith({ data: { version: AI_APPS_STARTER_KIT_VERSION } });
    expect(notificationCreate.mock.calls[0][0].metadata.version).toBe(AI_APPS_STARTER_KIT_VERSION);
  });

  it('a restart with an already announced version sends nothing', async () => {
    announcementCreate.mockRejectedValue(uniqueViolation());

    await expect(service.announceCurrentVersion('1.17', 'production')).resolves.toBe('already-announced');

    expect(notificationCreate).not.toHaveBeenCalled();
    expect(announcementDeleteMany).not.toHaveBeenCalled();
  });

  it('two instances starting at once on a new version send exactly one broadcast (lost insert race skips)', async () => {
    announcementCreate.mockResolvedValueOnce({ id: 1, version: '1.17' }).mockRejectedValueOnce(uniqueViolation());

    const outcomes = await Promise.all([
      service.announceCurrentVersion('1.17', 'production'),
      service.announceCurrentVersion('1.17', 'production'),
    ]);

    expect(outcomes.sort()).toEqual(['already-announced', 'sent']);
    expect(notificationCreate).toHaveBeenCalledTimes(1);
    expect(announcementDeleteMany).not.toHaveBeenCalled();
  });

  it.each([undefined, 'development', 'staging', 'local'])(
    'outside production (%s) nothing is recorded or sent',
    async (environment) => {
      await expect(service.announceCurrentVersion('1.17', environment)).resolves.toBe('not-production');

      expect(announcementCreate).not.toHaveBeenCalled();
      expect(notificationCreate).not.toHaveBeenCalled();
    }
  );

  it('a send failure logs a warning, does not throw, and removes the record so the next start retries', async () => {
    notificationCreate.mockRejectedValue(new Error('websocket down'));
    const warn = jest.spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn');
    warn.mockImplementation(() => undefined);

    await expect(service.announceCurrentVersion('1.17', 'production')).resolves.toBe('failed');

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('websocket down'));
    expect(announcementDeleteMany).toHaveBeenCalledWith({ where: { version: '1.17' } });
  });

  it('a failure removing the record after a failed send is logged and does not throw', async () => {
    notificationCreate.mockRejectedValue(new Error('websocket down'));
    announcementDeleteMany.mockRejectedValue(new Error('db gone'));
    const warn = jest.spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn');
    warn.mockImplementation(() => undefined);

    await expect(service.announceCurrentVersion('1.17', 'production')).resolves.toBe('failed');

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('db gone'));
  });

  it('a failure in the version check logs a warning, sends nothing and does not throw', async () => {
    announcementCreate.mockRejectedValue(new Error('connection refused'));
    const warn = jest.spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn');
    warn.mockImplementation(() => undefined);

    await expect(service.announceCurrentVersion('1.17', 'production')).resolves.toBe('failed');

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('connection refused'));
    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it('runs the check on application bootstrap without blocking or throwing', async () => {
    const announce = jest.spyOn(service, 'announceCurrentVersion').mockRejectedValue(new Error('unexpected'));
    const warn = jest.spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn');
    warn.mockImplementation(() => undefined);

    expect(() => service.onApplicationBootstrap()).not.toThrow();
    expect(announce).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setImmediate(resolve));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unexpected'));
  });
});
