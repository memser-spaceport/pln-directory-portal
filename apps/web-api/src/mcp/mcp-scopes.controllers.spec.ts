jest.mock('../analytics/service/analytics.service', () => ({ AnalyticsService: jest.fn() }));
jest.mock('./mcp-oauth.service', () => ({ McpOAuthService: jest.fn() }));
jest.mock('../rbac/rbac.service', () => ({ RbacService: jest.fn() }));

import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { UserAccessTokenValidateGuard } from '../guards/user-access-token-validate.guard';
import { RbacGuard } from '../rbac/rbac.guard';
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
    const controller = new McpAuthorizationsController({} as any, {} as any, scopes as any);
    const body = { levels: { forum: 'none' } };
    await controller.updateScopes('auth-1', body, { memberUid: 'member-1' });
    expect(scopes.updateConnectionLevels).toHaveBeenCalledWith('member-1', 'auth-1', body);
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
});
