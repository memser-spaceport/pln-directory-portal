/// <reference types="multer" />
// axios ships ESM (not in the jest transform allowlist); the metadata checks
// here never call it.
jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false) }));

// The real module pulls in a transitive chain that breaks under ts-jest (an
// ESM-only nestjs-zod import); mock it like roadmap.service.spec.ts does.
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
import { AiAppMemberContextGuard } from './guards/ai-app-member-context.guard';
import { AiAppMeRbacGuard } from './guards/ai-app-me-rbac.guard';
import { RBAC_PERMISSIONS_KEY } from '../rbac/rbac.decorator';
import { AI_APPS_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { AI_APPS_SIDECAR_THROTTLE_LIMIT, AI_APPS_SIDECAR_THROTTLE_TTL_SECONDS } from './ai-apps.constants';

const THROTTLER_LIMIT = 'THROTTLER:LIMIT';
const THROTTLER_TTL = 'THROTTLER:TTL';

/**
 * Wiring checks for `GET /v1/ai-apps/me` (the member-context endpoint deployed
 * apps call). The full-app e2e path is not runnable in this repo's jest setup
 * (@nestjs/testing lags @nestjs/core), so this pins the routing/guard metadata
 * that matters instead.
 */
describe('AiAppsController GET /me wiring', () => {
  const handler = AiAppsController.prototype.getMemberContext;

  it('registers as GET "me"', () => {
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('me');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('is declared before the :uid route so the literal path wins', () => {
    const methods = Object.getOwnPropertyNames(AiAppsController.prototype);
    expect(methods.indexOf('getMemberContext')).toBeGreaterThan(-1);
    expect(methods.indexOf('getMemberContext')).toBeLessThan(methods.indexOf('getApp'));
  });

  it('uses the member-context guard (app session or cookie-or-bearer LabOS token) plus RBAC', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([AiAppMemberContextGuard, AiAppMeRbacGuard]);
  });

  it('requires AI Apps read (or write) permission', () => {
    expect(Reflect.getMetadata(RBAC_PERMISSIONS_KEY, handler)).toEqual({
      anyOf: [AI_APPS_PERMISSIONS.READ, AI_APPS_PERMISSIONS.WRITE],
    });
  });

  it('returns a name-only member for a testing session and does not load a member', async () => {
    const aiAppsService = { getMemberContext: jest.fn() };
    const controller = new AiAppsController(
      aiAppsService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
    await expect(
      controller.getMemberContext({ aiAppTestingUser: { uid: 'tu-1', name: 'Testing user 1' } })
    ).resolves.toEqual({
      testing: true,
      member: { uid: 'tu-1', name: 'Testing user 1', image: null, location: null, skills: [], teams: [] },
    });
    expect(aiAppsService.getMemberContext).not.toHaveBeenCalled();
  });

  it('adds isAgent for an agent session and omits it for a browser session', async () => {
    const member = { uid: 'm-1', name: 'Ada' };
    const aiAppsService = { getMemberContext: jest.fn().mockResolvedValue({ member }) };
    const controller = new AiAppsController(
      aiAppsService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
    await expect(controller.getMemberContext({ memberUid: 'm-1', aiAppAgent: true })).resolves.toEqual({
      isAgent: true,
      member,
    });
    await expect(controller.getMemberContext({ memberUid: 'm-1' })).resolves.toEqual({ member });
  });

  it('raises the IP throttle above the global 10/s so a sidecar burst does not 429', () => {
    expect(Reflect.getMetadata(THROTTLER_LIMIT, handler)).toBe(AI_APPS_SIDECAR_THROTTLE_LIMIT);
    expect(Reflect.getMetadata(THROTTLER_TTL, handler)).toBe(AI_APPS_SIDECAR_THROTTLE_TTL_SECONDS);
    expect(AI_APPS_SIDECAR_THROTTLE_LIMIT).toBeGreaterThan(10);
  });
});
