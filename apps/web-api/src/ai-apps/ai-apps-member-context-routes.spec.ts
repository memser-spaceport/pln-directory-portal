/// <reference types="multer" />
// axios ships ESM (not in the jest transform allowlist); the metadata checks
// here never call it.
jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false) }));

import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AiAppsController } from './ai-apps.controller';
import { UserAccessTokenValidateGuard } from '../guards/user-access-token-validate.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RBAC_PERMISSIONS_KEY } from '../rbac/rbac.decorator';
import { AI_APPS_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';

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

  it('uses the cookie-or-bearer token guard plus RBAC', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([UserAccessTokenValidateGuard, RbacGuard]);
  });

  it('requires AI Apps read (or write) permission', () => {
    expect(Reflect.getMetadata(RBAC_PERMISSIONS_KEY, handler)).toEqual({
      anyOf: [AI_APPS_PERMISSIONS.READ, AI_APPS_PERMISSIONS.WRITE],
    });
  });
});
