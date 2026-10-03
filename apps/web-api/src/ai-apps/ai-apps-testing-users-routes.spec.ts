// The service is a stub here; its real module, and the guards' imports, pull axios (ESM) that ts-jest cannot load.
jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false) }));
jest.mock('./ai-apps-testing-users.service', () => ({ AiAppsTestingUsersService: jest.fn() }));

import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { ForbiddenException, RequestMethod } from '@nestjs/common';
import { AiAppsTestingUsersController } from './ai-apps-testing-users.controller';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RBAC_PERMISSIONS_KEY } from '../rbac/rbac.decorator';
import { AI_APPS_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';

const READ = { anyOf: [AI_APPS_PERMISSIONS.READ, AI_APPS_PERMISSIONS.WRITE] };
const WRITE = { anyOf: [AI_APPS_PERMISSIONS.WRITE] };
const proto = AiAppsTestingUsersController.prototype as any;

describe('AiAppsTestingUsersController routes', () => {
  it('lives under v1/ai-apps', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AiAppsTestingUsersController)).toBe('v1/ai-apps');
  });

  it.each([
    ['listTestingUsers', RequestMethod.GET, ':uid/testing-users', READ],
    ['createTestingUsers', RequestMethod.POST, ':uid/testing-users', WRITE],
    ['revokeTestingUser', RequestMethod.POST, ':uid/testing-users/:testingUserUid/revoke', WRITE],
  ])('%s: %s %s behind the member guard, RBAC and the expected permission', (name, method, path, permission) => {
    const handler = proto[name];
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([UserTokenCheckGuard, RbacGuard]);
    expect(Reflect.getMetadata(RBAC_PERMISSIONS_KEY, handler)).toEqual(permission);
  });
});

describe('AiAppsTestingUsersController handlers', () => {
  function build() {
    const service = {
      list: jest.fn().mockResolvedValue({ page: 1, limit: 100, total: 0, items: [] }),
      create: jest.fn().mockResolvedValue({ items: [] }),
      revoke: jest.fn().mockResolvedValue({ uid: 'tu-1', revoked: true, revokedAt: new Date(0) }),
    };
    const rbac = { findMemberByEmail: jest.fn().mockResolvedValue({ uid: 'member-by-email' }) };
    const controller = new AiAppsTestingUsersController(service as any, rbac as any);
    return { controller, service, rbac };
  }

  it('passes the requesting member, the app and the inputs to the service', async () => {
    const { controller, service } = build();
    const req = { memberUid: 'creator-1' };
    await controller.listTestingUsers('app-1', { page: 2, limit: 10 } as any, req);
    await controller.createTestingUsers('app-1', { count: 3 } as any, req);
    await controller.revokeTestingUser('app-1', 'tu-1', req);
    expect(service.list).toHaveBeenCalledWith('creator-1', 'app-1', { page: 2, limit: 10 });
    expect(service.create).toHaveBeenCalledWith('creator-1', 'app-1', 3);
    expect(service.revoke).toHaveBeenCalledWith('creator-1', 'app-1', 'tu-1');
  });

  it("falls back to the token's email to find the member", async () => {
    const { controller, service, rbac } = build();
    await controller.createTestingUsers('app-1', { count: 1 } as any, { userEmail: 'a@b.c' });
    expect(rbac.findMemberByEmail).toHaveBeenCalledWith('a@b.c');
    expect(service.create).toHaveBeenCalledWith('member-by-email', 'app-1', 1);
  });

  it('403s when no member can be resolved', async () => {
    const { controller, service } = build();
    await expect(controller.listTestingUsers('app-1', {} as any, {})).rejects.toThrow(ForbiddenException);
    expect(service.list).not.toHaveBeenCalled();
  });
});
