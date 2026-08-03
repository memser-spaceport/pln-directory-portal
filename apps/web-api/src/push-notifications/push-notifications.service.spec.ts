// Mocked as modules, not instances: the service's own imports chain into
// websocket.gateway/axios (ESM) and other heavy graphs jest can't transform.
// Same pattern as roadmap-pins.service.spec.ts.
jest.mock('../websocket/websocket.service', () => ({
  WebSocketService: jest.fn(),
}));
jest.mock('../notifications/notification-service.client', () => ({
  NotificationServiceClient: jest.fn(),
}));
jest.mock('../pl-events/pl-event-guests.service', () => ({
  PLEventGuestsService: jest.fn(),
}));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({
  AccessControlV2Service: jest.fn(),
}));

import type { PrismaService } from '../shared/prisma.service';
import type { WebSocketService } from '../websocket/websocket.service';
import type { NotificationServiceClient } from '../notifications/notification-service.client';
import type { PLEventGuestsService } from '../pl-events/pl-event-guests.service';
import type { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { PushNotificationsService } from './push-notifications.service';

describe('PushNotificationsService.markAllAsRead', () => {
  let service: PushNotificationsService;

  const pushNotificationFindMany = jest.fn();
  const pushNotificationUpdateMany = jest.fn();
  const readStatusCreateMany = jest.fn();
  const transaction = jest.fn();
  const notifyCount = jest.fn();
  const hasPermission = jest.fn();

  const prismaMock = {
    pushNotification: {
      findMany: pushNotificationFindMany,
      updateMany: pushNotificationUpdateMany,
    },
    pushNotificationReadStatus: {
      createMany: readStatusCreateMany,
    },
    $transaction: transaction,
  } as unknown as PrismaService;

  const webSocketMock = { notifyCount } as unknown as WebSocketService;
  const accessControlMock = { hasPermission } as unknown as AccessControlV2Service;

  beforeEach(() => {
    jest.clearAllMocks();
    // findMany is called public-first, gated-second; default both to empty.
    pushNotificationFindMany.mockResolvedValue([]);
    pushNotificationUpdateMany.mockResolvedValue({ count: 0 });
    readStatusCreateMany.mockResolvedValue({ count: 0 });
    // Array form: the operations are already promises built by the mocks above.
    transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
    notifyCount.mockResolvedValue(undefined);
    hasPermission.mockResolvedValue({ allowed: false });

    service = new PushNotificationsService(
      prismaMock,
      webSocketMock,
      {} as NotificationServiceClient,
      {} as PLEventGuestsService,
      accessControlMock
    );
  });

  it('marks private notifications read inside the transaction', async () => {
    const result = await service.markAllAsRead('member-1');

    expect(pushNotificationUpdateMany).toHaveBeenCalledWith({
      where: { recipientUid: 'member-1', isPublic: false, isRead: false },
      data: { isRead: true },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true });
  });

  it('creates read statuses for every unread public notification', async () => {
    pushNotificationFindMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]); // public
    pushNotificationFindMany.mockResolvedValueOnce([]); // permission-gated

    await service.markAllAsRead('member-1');

    expect(readStatusCreateMany).toHaveBeenCalledWith({
      data: [
        { notificationId: 1, memberUid: 'member-1' },
        { notificationId: 2, memberUid: 'member-1' },
      ],
      skipDuplicates: true,
    });
  });

  it('marks only the permission-gated notifications the member can see, resolving each code once', async () => {
    pushNotificationFindMany.mockResolvedValueOnce([]); // public
    pushNotificationFindMany.mockResolvedValueOnce([
      { id: 10, requiredPermissions: ['members:read', 'admin'] },
      { id: 11, requiredPermissions: ['members:read'] },
      { id: 12, requiredPermissions: ['admin'] },
    ]);
    hasPermission.mockImplementation(async (_memberUid: string, code: string) => ({
      allowed: code === 'members:read',
    }));

    await service.markAllAsRead('member-1');

    // Two distinct codes across three notifications → exactly two checks.
    expect(hasPermission).toHaveBeenCalledTimes(2);
    expect(readStatusCreateMany).toHaveBeenCalledWith({
      data: [
        { notificationId: 10, memberUid: 'member-1' },
        { notificationId: 11, memberUid: 'member-1' },
      ],
      skipDuplicates: true,
    });
  });

  it('is a graceful no-op with zero unread notifications', async () => {
    const result = await service.markAllAsRead('member-1');

    expect(readStatusCreateMany).not.toHaveBeenCalled();
    expect(hasPermission).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it('pushes unreadCount 0 over the websocket after the writes commit', async () => {
    await service.markAllAsRead('member-1');

    expect(notifyCount).toHaveBeenCalledWith('member-1', { unreadCount: 0 });
  });

  it('does not tell other tabs "all read" when the transaction fails', async () => {
    transaction.mockRejectedValue(new Error('db down'));

    await expect(service.markAllAsRead('member-1')).rejects.toThrow('db down');
    expect(notifyCount).not.toHaveBeenCalled();
  });
});
