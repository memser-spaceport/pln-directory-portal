/// <reference types="multer" />
jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false) }));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AiAppsController } from './ai-apps.controller';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RBAC_PERMISSIONS_KEY } from '../rbac/rbac.decorator';
import { AI_APPS_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { AI_APPS_SIDECAR_THROTTLE_LIMIT } from './ai-apps.constants';

const READ = { anyOf: [AI_APPS_PERMISSIONS.READ, AI_APPS_PERMISSIONS.WRITE] };
const proto = AiAppsController.prototype as any;
const methods = Object.getOwnPropertyNames(AiAppsController.prototype);

describe('AiAppsController app-session routes', () => {
  it.each([
    ['issueAppSessionCode', 'sessions/code', [UserTokenCheckGuard, RbacGuard], READ],
    ['exchangeAppSessionToken', 'sessions/exchange-token', [UserTokenCheckGuard, RbacGuard], READ],
    ['redeemAppSessionCode', 'sessions/redeem', undefined, undefined],
    ['revokeAppSessions', 'sessions/revoke', [UserTokenCheckGuard], undefined],
  ])('%s: POST %s with the expected guards and permission', (name, path, guards, permission) => {
    const handler = proto[name];
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual(guards);
    expect(Reflect.getMetadata(RBAC_PERMISSIONS_KEY, handler)).toEqual(permission);
  });

  it.each(['redeemAppSessionCode', 'exchangeAppSessionToken'])('%s gets the sidecar throttle', (name) => {
    expect(Reflect.getMetadata('THROTTLER:LIMIT', proto[name])).toBe(AI_APPS_SIDECAR_THROTTLE_LIMIT);
  });

  it('declares the literal session routes before any :uid route', () => {
    const firstParamRoute = methods.findIndex((m) =>
      String(Reflect.getMetadata(PATH_METADATA, proto[m]) ?? '').startsWith(':uid')
    );
    for (const name of [
      'issueAppSessionCode',
      'redeemAppSessionCode',
      'exchangeAppSessionToken',
      'revokeAppSessions',
    ]) {
      expect(methods.indexOf(name)).toBeLessThan(firstParamRoute);
    }
  });
});

describe('POST /track with an app session token', () => {
  const jwt = jest.requireActual('jsonwebtoken');
  const appToken = jwt.sign({ iss: 'pln-ai-apps-session', aud: 'foo', uid: 'm-1' }, 'k');

  function build(authenticated: { memberUid: string; appId: string } | null) {
    const aiAppsService = { trackAppEvent: jest.fn().mockResolvedValue(undefined) };
    const sessionService = { authenticateAppRequest: jest.fn().mockResolvedValue(authenticated) };
    const controller = new AiAppsController(
      aiAppsService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      sessionService as any,
      {} as any
    );
    return { controller, aiAppsService, sessionService };
  }
  const req = (origin: string) => ({ headers: { authorization: `Bearer ${appToken}`, origin }, cookies: {} } as any);

  it('attributes the event to the session member and never forwards the token for introspection', async () => {
    const { controller, aiAppsService, sessionService } = build({ memberUid: 'm-1', appId: 'foo' });
    await controller.trackEvent({ event: 'clicked' } as any, req('https://foo.os.pl.xyz'));
    expect(sessionService.authenticateAppRequest).toHaveBeenCalledWith(appToken, 'https://foo.os.pl.xyz');
    expect(aiAppsService.trackAppEvent).toHaveBeenCalledWith(
      expect.objectContaining({ sessionMemberUid: 'm-1', token: undefined })
    );
  });

  it('records the event unattributed when the session does not match the origin', async () => {
    const { controller, aiAppsService } = build(null);
    await controller.trackEvent({ event: 'clicked' } as any, req('https://bar.os.pl.xyz'));
    expect(aiAppsService.trackAppEvent).toHaveBeenCalledWith(
      expect.objectContaining({ sessionMemberUid: undefined, token: undefined })
    );
  });
});
