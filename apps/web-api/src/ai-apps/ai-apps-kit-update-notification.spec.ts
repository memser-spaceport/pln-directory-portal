jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: class PushNotificationsService {},
}));

import { PushNotificationCategory } from '@prisma/client';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { PrismaService } from '../shared/prisma.service';
import { AiAppsKitUpdateNotificationService, compareKitVersions } from './ai-apps-kit-update-notification.service';
import { AI_APPS_STARTER_KIT_VERSION } from './ai-apps.constants';

/**
 * The stored `starter_kit_updated` notifications are the only record of what was announced. `$transaction` runs
 * one callback at a time, standing in for the Postgres advisory lock that serializes API instances.
 */
describe('AiAppsKitUpdateNotificationService', () => {
  let stored: { category: PushNotificationCategory; metadata: Record<string, unknown> }[];
  let lock: Promise<unknown>;
  const queryRaw = jest.fn();
  const notificationCreate = jest.fn();
  let service: AiAppsKitUpdateNotificationService;

  const tx = {
    $queryRaw: queryRaw,
    pushNotification: {
      findMany: jest.fn(async ({ where }) =>
        stored
          .filter((n) => n.category === where.category && n.metadata.trigger === where.metadata.equals)
          .map((n) => ({ metadata: n.metadata }))
      ),
    },
  };

  const prisma = {
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => {
      const run = lock.then(() => fn(tx));
      lock = run.catch(() => undefined);
      return run;
    }),
  } as unknown as PrismaService;

  const announce = (version: string) => ({
    category: PushNotificationCategory.AI_APP,
    metadata: { eventType: 'ai_app_starter_kit', trigger: 'starter_kit_updated', version },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    stored = [];
    lock = Promise.resolve();
    notificationCreate.mockImplementation(async (dto) => {
      stored.push({ category: dto.category, metadata: dto.metadata });
      return { uid: `n-${stored.length}` };
    });
    service = new AiAppsKitUpdateNotificationService(prisma, {
      create: notificationCreate,
    } as unknown as PushNotificationsService);
  });

  it('broadcasts a never-announced version to AI Apps access holders, opening the Add your AI App modal', async () => {
    await expect(service.announceCurrentVersion('1.17')).resolves.toBe('sent');

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(notificationCreate).toHaveBeenCalledTimes(1);
    expect(notificationCreate).toHaveBeenCalledWith({
      category: PushNotificationCategory.AI_APP,
      title: 'AI Apps',
      description: "AI Apps Starter Kit — updated to v1.17. Review what's new!",
      linkText: 'Get the starter kit →',
      link: '/pl-infra/ai-apps?dialog=addAiApp',
      isPublic: false,
      requiredPermissions: ['ai_apps.read', 'ai_apps.write'],
      metadata: { eventType: 'ai_app_starter_kit', trigger: 'starter_kit_updated', version: '1.17' },
    });
  });

  it('defaults to the current AI_APPS_STARTER_KIT_VERSION', async () => {
    await service.announceCurrentVersion();

    expect(notificationCreate.mock.calls[0][0].metadata.version).toBe(AI_APPS_STARTER_KIT_VERSION);
  });

  it('sends nothing on a restart with an already announced version', async () => {
    stored.push(announce('1.17'));

    await expect(service.announceCurrentVersion('1.17')).resolves.toBe('already-announced');
    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it('sends nothing after a rollback to an older version', async () => {
    stored.push(announce('1.17'));

    await expect(service.announceCurrentVersion('1.16')).resolves.toBe('already-announced');
    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it('announces a newer version even when older ones were announced', async () => {
    stored.push(announce('1.9'), announce('1.17'));

    await expect(service.announceCurrentVersion('1.18')).resolves.toBe('sent');
    expect(notificationCreate).toHaveBeenCalledTimes(1);
  });

  it('ignores other AI Apps notifications', async () => {
    stored.push({ category: PushNotificationCategory.AI_APP, metadata: { trigger: 'deploy_succeeded' } });

    await expect(service.announceCurrentVersion('1.17')).resolves.toBe('sent');
  });

  it('sends one notification when two instances start at once', async () => {
    const outcomes = await Promise.all([
      service.announceCurrentVersion('1.17'),
      service.announceCurrentVersion('1.17'),
    ]);

    expect(outcomes.sort()).toEqual(['already-announced', 'sent']);
    expect(notificationCreate).toHaveBeenCalledTimes(1);
  });

  it('stores nothing when the send fails, so the next start retries', async () => {
    notificationCreate.mockRejectedValueOnce(new Error('db down'));

    await expect(service.announceCurrentVersion('1.17')).rejects.toThrow('db down');
    await expect(service.announceCurrentVersion('1.17')).resolves.toBe('sent');
    expect(notificationCreate).toHaveBeenCalledTimes(2);
  });

  it('runs on application bootstrap without blocking or throwing, logging failures as a warning', async () => {
    jest.spyOn(service, 'announceCurrentVersion').mockRejectedValue(new Error('lock timeout'));
    const warn = jest
      .spyOn((service as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn')
      .mockImplementation(() => undefined);

    expect(() => service.onApplicationBootstrap()).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('lock timeout'));
  });
});

describe('compareKitVersions', () => {
  it.each([
    ['1.17', '1.9', 1],
    ['1.9', '1.17', -1],
    ['1.17', '1.17', 0],
    ['2.0', '1.99', 1],
    ['1.17', '1.17.1', -1],
  ])('compares %s with %s', (a, b, expected) => {
    expect(compareKitVersions(a, b)).toBe(expected);
  });
});
