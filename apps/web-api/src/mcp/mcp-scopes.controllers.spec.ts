jest.mock('axios', () => ({ default: {} }));
jest.mock('../analytics/service/analytics.service', () => ({ AnalyticsService: jest.fn() }));
jest.mock('./mcp-oauth.service', () => ({ McpOAuthService: jest.fn() }));
jest.mock('../rbac/rbac.service', () => ({ RbacService: jest.fn() }));

import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { UserAccessTokenValidateGuard } from '../guards/user-access-token-validate.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { McpAdminLimitsController } from './mcp-admin-limits.controller';
import { McpAdminScopesController } from './mcp-admin-scopes.controller';
import { McpAuthorizationsController } from './mcp-authorizations.controller';

describe('MCP scope routes', () => {
  it('PATCH /v1/mcp/authorizations/:uid/scopes sits behind the member guards and saves for the caller', async () => {
    const handler = McpAuthorizationsController.prototype.updateScopes;
    expect(Reflect.getMetadata(PATH_METADATA, McpAuthorizationsController)).toBe('v1/mcp');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('authorizations/:uid/scopes');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata(GUARDS_METADATA, McpAuthorizationsController)).toEqual([
      UserAccessTokenValidateGuard,
      RbacGuard,
    ]);

    const scopes = { updateConnectionLevels: jest.fn().mockResolvedValue({ uid: 'auth-1' }) };
    const controller = new McpAuthorizationsController({} as any, {} as any, scopes as any, {} as any, {} as any);
    const body = { levels: { forum: 'none' } };
    await controller.updateScopes('auth-1', body, { memberUid: 'member-1' });
    expect(scopes.updateConnectionLevels).toHaveBeenCalledWith('member-1', 'auth-1', body);
  });

  it('GET /v1/mcp/access-requests/:uid sits behind the member guards and reads for the caller', async () => {
    const handler = McpAuthorizationsController.prototype.accessRequest;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('access-requests/:uid');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);

    const requests = { getForMember: jest.fn().mockResolvedValue({ uid: 'req-1' }) };
    const controller = new McpAuthorizationsController({} as any, {} as any, {} as any, requests as any, {} as any);
    await expect(controller.accessRequest('req-1', { memberUid: 'member-1' })).resolves.toEqual({ uid: 'req-1' });
    expect(requests.getForMember).toHaveBeenCalledWith('member-1', 'req-1');
  });

  it('GET and PUT /v1/admin/mcp/scopes require AdminAuthGuard and record the admin', async () => {
    expect(Reflect.getMetadata(PATH_METADATA, McpAdminScopesController)).toBe('v1/admin/mcp/scopes');
    expect(Reflect.getMetadata(GUARDS_METADATA, McpAdminScopesController)).toEqual([AdminAuthGuard]);
    expect(Reflect.getMetadata(METHOD_METADATA, McpAdminScopesController.prototype.list)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, McpAdminScopesController.prototype.update)).toBe(RequestMethod.PUT);

    const scopes = { setAdminScopes: jest.fn().mockResolvedValue({ scopes: [] }) };
    const controller = new McpAdminScopesController(scopes as any);
    await controller.update({ scopes: { forum: 'none' } }, { user: { memberUid: 'admin-1' } });
    expect(scopes.setAdminScopes).toHaveBeenCalledWith({ scopes: { forum: 'none' } }, 'admin-1');
  });

  it('GET, PUT and DELETE /v1/admin/mcp/limits require AdminAuthGuard and record the admin', async () => {
    expect(Reflect.getMetadata(PATH_METADATA, McpAdminLimitsController)).toBe('v1/admin/mcp/limits');
    expect(Reflect.getMetadata(GUARDS_METADATA, McpAdminLimitsController)).toEqual([AdminAuthGuard]);
    expect(Reflect.getMetadata(METHOD_METADATA, McpAdminLimitsController.prototype.view)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, McpAdminLimitsController.prototype.set)).toBe(RequestMethod.PUT);
    expect(Reflect.getMetadata(METHOD_METADATA, McpAdminLimitsController.prototype.remove)).toBe(RequestMethod.DELETE);

    const limits = {
      setOverride: jest.fn().mockResolvedValue({ uid: 'o1' }),
      removeOverride: jest.fn().mockResolvedValue({ removed: true }),
    };
    const controller = new McpAdminLimitsController(limits as any);
    const body = { callType: 'write', limit: 5 };
    await controller.set('member-1', body, { user: { memberUid: 'admin-1' } });
    expect(limits.setOverride).toHaveBeenCalledWith('member-1', body, 'admin-1');
    await controller.remove('member-1', 'write', { user: { uid: 'admin-2' } });
    expect(limits.removeOverride).toHaveBeenCalledWith('member-1', 'write', 'admin-2');
  });

  it('GET /v1/mcp/limits sits behind the member guards', async () => {
    const handler = McpAuthorizationsController.prototype.limitsForMember;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('limits');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
    const limits = { usageFor: jest.fn().mockResolvedValue({ tier: 'standard', limits: [] }) };
    const controller = new McpAuthorizationsController({} as any, {} as any, {} as any, {} as any, limits as any);
    await expect(controller.limitsForMember({ memberUid: 'member-1' })).resolves.toEqual({
      tier: 'standard',
      limits: [],
    });
    expect(limits.usageFor).toHaveBeenCalledWith('member-1');
  });
});
