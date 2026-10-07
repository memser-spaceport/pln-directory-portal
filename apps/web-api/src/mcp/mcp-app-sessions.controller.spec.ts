jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false), post: jest.fn(), get: jest.fn() }));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import 'reflect-metadata';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod, UnauthorizedException } from '@nestjs/common';
import { McpAppSessionsController } from './mcp-app-sessions.controller';
import { MintMcpAppSessionSchema } from './dto/mint-mcp-app-session.dto';

describe('McpAppSessionsController', () => {
  const handler = McpAppSessionsController.prototype.mint;

  it('is POST /v1/mcp/app-sessions with no member-JWT guard', () => {
    expect(Reflect.getMetadata(PATH_METADATA, McpAppSessionsController)).toBe('v1/mcp');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('app-sessions');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(GUARDS_METADATA, McpAppSessionsController)).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
  });

  it('passes the bearer MCP token and appId to the service', async () => {
    const sessions = { mint: jest.fn().mockResolvedValue({ token: 'app-session', expiresAt: new Date(0) }) };
    const controller = new McpAppSessionsController(sessions as any);
    const req = { headers: { authorization: 'Bearer mcp_at_live' } } as any;
    await expect(controller.mint({ appId: 'foo' } as any, req)).resolves.toEqual({
      token: 'app-session',
      expiresAt: new Date(0),
    });
    expect(sessions.mint).toHaveBeenCalledWith('mcp_at_live', 'foo');
  });

  it('refuses a request with no MCP bearer token', async () => {
    const sessions = { mint: jest.fn() };
    const controller = new McpAppSessionsController(sessions as any);
    await expect(controller.mint({ appId: 'foo' } as any, { headers: {} } as any)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(sessions.mint).not.toHaveBeenCalled();
  });

  it('accepts an app id and rejects a blank one', () => {
    expect(MintMcpAppSessionSchema.safeParse({ appId: 'foo' }).success).toBe(true);
    expect(MintMcpAppSessionSchema.safeParse({ appId: '' }).success).toBe(false);
    expect(MintMcpAppSessionSchema.safeParse({}).success).toBe(false);
  });
});
