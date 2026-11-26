jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false) }));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AiAppsController } from './ai-apps.controller';
import { OptionalUserTokenCheckGuard, UserTokenCheckGuard } from '../guards/user-token-check.guard';

/** The LabOS connect page reads the session before the member signs in, so the read must stay public. */
describe('AiAppsController connect routes', () => {
  it('serves GET connect/:uid without a member token', () => {
    const handler = AiAppsController.prototype.getConnectSession;
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([OptionalUserTokenCheckGuard]);
  });

  it('still requires a member token to approve', () => {
    const handler = AiAppsController.prototype.approveConnectSession;
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([UserTokenCheckGuard]);
  });
});
