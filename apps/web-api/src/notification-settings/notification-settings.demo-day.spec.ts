jest.mock('../recommendations/recommendations.service', () => ({ RecommendationsService: jest.fn() }));
jest.mock('../notifications/notification-service.client', () => ({ NotificationServiceClient: jest.fn() }));

import { BadRequestException } from '@nestjs/common';
import { NotificationSettingsService } from './notification-settings.service';

describe('NotificationSettingsService.setDemoDaySubscription', () => {
  function build(existingSubscriber: unknown) {
    const client = {
      getEventSubscriberByEmailAndType: jest.fn().mockResolvedValue(existingSubscriber),
      createEventSubscriber: jest.fn().mockResolvedValue({}),
      deleteEventSubscriberByEmailAndType: jest.fn().mockResolvedValue({}),
      upsertNotificationSetting: jest.fn().mockResolvedValue({ ok: true }),
    };
    const service = new NotificationSettingsService({} as any, {} as any, {} as any, client as any);
    return { service, client };
  }
  const MEMBER = { uid: 'm1', name: 'Ada', email: 'ada@example.com' };

  it('subscribes a member who is not a subscriber yet, then stores the setting', async () => {
    const { service, client } = build(null);
    await service.setDemoDaySubscription(MEMBER, true, 'ext-1');
    expect(client.createEventSubscriber).toHaveBeenCalledWith({
      email: 'ada@example.com',
      eventType: 'DEMO_DAY',
      name: 'Ada',
      memberId: 'm1',
    });
    expect(client.upsertNotificationSetting).toHaveBeenCalledWith('m1', {
      demoDaySubscriptionEnabled: true,
      memberUid: 'm1',
      memberExternalId: 'ext-1',
    });
  });

  it('does not create a second subscriber', async () => {
    const { service, client } = build({ id: 1 });
    await service.setDemoDaySubscription(MEMBER, true);
    expect(client.createEventSubscriber).not.toHaveBeenCalled();
  });

  it('removes the subscriber when turned off', async () => {
    const { service, client } = build({ id: 1 });
    await service.setDemoDaySubscription(MEMBER, false);
    expect(client.deleteEventSubscriberByEmailAndType).toHaveBeenCalledWith('ada@example.com', 'DEMO_DAY');
    expect(client.upsertNotificationSetting.mock.calls[0][1]).toMatchObject({ demoDaySubscriptionEnabled: false });
  });

  it('needs an email', async () => {
    const { service, client } = build(null);
    await expect(service.setDemoDaySubscription({ ...MEMBER, email: null }, true)).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(client.upsertNotificationSetting).not.toHaveBeenCalled();
  });
});
