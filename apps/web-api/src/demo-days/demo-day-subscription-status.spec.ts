jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('../members/members.service', () => ({ MembersService: class {} }));
jest.mock('../notifications/notification-service.client', () => ({ NotificationServiceClient: class {} }));

import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import axios from 'axios';
import { DemoDaySubscriptionsController } from './demo-day-subscriptions.controller';
import { MembersService } from '../members/members.service';
import { NotificationServiceClient } from '../notifications/notification-service.client';

const notifications = {
  getEventSubscriberByEmailAndType: jest.fn(async (email: string) => {
    if (email === 'ada@example.com') return { email };
    if (email === 'other@example.com') return { email };
    return null;
  }),
  createEventSubscriber: jest.fn(),
  sendTelegramOutboxMessage: jest.fn(),
};

describe('GET /v1/demo-day-subscriptions/subscription-status', () => {
  let app: INestApplication;

  beforeAll(async () => {
    @Module({
      controllers: [DemoDaySubscriptionsController],
      providers: [
        { provide: MembersService, useValue: {} },
        { provide: NotificationServiceClient, useValue: notifications },
      ],
    })
    class SubscriptionStatusTestModule {}

    app = await NestFactory.create(SubscriptionStatusTestModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when the request has no token', async () => {
    await request(app.getHttpServer())
      .get('/v1/demo-day-subscriptions/subscription-status')
      .query({ email: 'other@example.com' })
      .expect(401);
    expect(notifications.getEventSubscriberByEmailAndType).not.toHaveBeenCalled();
  });

  it('returns only the token member status and ignores the query email', async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { active: true, email: 'ada@example.com', sub: 'ada' },
    });

    const response = await request(app.getHttpServer())
      .get('/v1/demo-day-subscriptions/subscription-status')
      .query({ email: 'other@example.com' })
      .set('Authorization', 'Bearer ada-token')
      .expect(200);

    expect(response.body).toEqual({ subscribed: true, email: 'ada@example.com' });
    expect(notifications.getEventSubscriberByEmailAndType).toHaveBeenCalledTimes(1);
    expect(notifications.getEventSubscriberByEmailAndType).toHaveBeenCalledWith('ada@example.com', 'DEMO_DAY');
  });
});
