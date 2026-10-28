jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false), post: jest.fn(), get: jest.fn() }));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { McpAppSessionService } from './mcp-app-session.service';
import { McpScopesService } from './mcp-scopes.service';

const ACTOR = {
  authorizationUid: 'auth-1',
  memberUid: 'member-1',
  email: 'ada@example.com',
  name: 'Ada',
  clientName: 'Claude',
  scopeLevels: { ai_apps: 'write' },
};
const APP = { uid: 'app-row', memberUid: 'owner-1', access: 'OPEN', publicPaths: [], previewAccess: 'PRIVATE' };
const GRANT = { token: 'app-session-token', expiresAt: new Date('2026-11-06T12:00:00Z') };

function build() {
  const oauth = { authenticateAccessToken: jest.fn().mockResolvedValue(ACTOR) };
  const access = {
    findAppForAccessCheck: jest.fn().mockResolvedValue(APP),
    checkAccess: jest.fn().mockResolvedValue({ allowed: true }),
  };
  const sessions = { openAgentSession: jest.fn().mockResolvedValue(GRANT) };
  const analytics = { trackEvent: jest.fn().mockResolvedValue(undefined) };
  const prisma = { mcpScopeSetting: { findMany: jest.fn().mockResolvedValue([]) } };
  const scopes = new McpScopesService(prisma as any, analytics as any);
  const service = new McpAppSessionService(oauth as any, access as any, sessions as any, analytics as any, scopes);
  return { service, oauth, access, sessions, analytics, prisma };
}

describe('McpAppSessionService', () => {
  it('mints a read-level session when the AI Apps scope is read', async () => {
    const { service, oauth, sessions } = build();
    oauth.authenticateAccessToken.mockResolvedValue({ ...ACTOR, scopeLevels: { ai_apps: 'read', forum: 'write' } });
    await expect(service.mint('mcp_at_live', 'foo')).resolves.toEqual(GRANT);
    expect(sessions.openAgentSession).toHaveBeenCalledWith('member-1', 'foo', 'auth-1', 'read');
  });

  it('mints a read-level session when admins cap AI Apps at read', async () => {
    const { service, sessions, prisma } = build();
    prisma.mcpScopeSetting.findMany.mockResolvedValue([{ scope: 'ai_apps', maxLevel: 'read' }]);
    await service.mint('mcp_at_live', 'foo');
    expect(sessions.openAgentSession).toHaveBeenCalledWith('member-1', 'foo', 'auth-1', 'read');
  });

  it('mints a read-level session when scope settings cannot be read', async () => {
    const { service, sessions, prisma } = build();
    prisma.mcpScopeSetting.findMany.mockRejectedValue(new Error('db down'));
    await service.mint('mcp_at_live', 'foo');
    expect(sessions.openAgentSession).toHaveBeenCalledWith('member-1', 'foo', 'auth-1', 'read');
  });

  it('mints an agent session for the member and records the open', async () => {
    const { service, oauth, access, sessions, analytics } = build();
    const grant = await service.mint('mcp_at_live', 'foo');

    expect(grant).toEqual(GRANT);
    expect(grant).not.toHaveProperty('authorizationUid');
    expect(JSON.stringify(grant)).not.toContain('mcp_at_live');
    expect(oauth.authenticateAccessToken).toHaveBeenCalledWith('mcp_at_live');
    expect(access.checkAccess).toHaveBeenCalledWith('member-1', 'foo', 'GET', { app: APP }, 'prod');
    expect(sessions.openAgentSession).toHaveBeenCalledWith('member-1', 'foo', 'auth-1', 'write');
    expect(analytics.trackEvent).toHaveBeenCalledWith({
      name: 'mcp-app-session-open',
      distinctId: 'member-1',
      properties: { memberUid: 'member-1', appId: 'foo' },
    });
  });

  it('checks the MCP token on every mint', async () => {
    const { service, oauth } = build();
    await service.mint('mcp_at_live', 'foo');
    await service.mint('mcp_at_live', 'bar');
    expect(oauth.authenticateAccessToken).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['no mcp.connect', new ForbiddenException('Missing permission: mcp.connect')],
    ['revoked auth', new UnauthorizedException('Invalid MCP token')],
  ])('refuses %s and does not mint or track', async (_label, error) => {
    const { service, oauth, sessions, analytics } = build();
    oauth.authenticateAccessToken.mockRejectedValue(error);
    await expect(service.mint('mcp_at_bad', 'foo')).rejects.toBe(error);
    expect(sessions.openAgentSession).not.toHaveBeenCalled();
    expect(analytics.trackEvent).not.toHaveBeenCalled();
  });

  it('refuses an unknown app', async () => {
    const { service, access, sessions, analytics } = build();
    access.findAppForAccessCheck.mockResolvedValue(null);
    await expect(service.mint('mcp_at_live', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(sessions.openAgentSession).not.toHaveBeenCalled();
    expect(analytics.trackEvent).not.toHaveBeenCalled();
  });

  it('refuses a member who cannot open the app', async () => {
    const { service, access, sessions, analytics } = build();
    access.checkAccess.mockRejectedValue(new ForbiddenException({ allowed: false, reason: 'private' }));
    await expect(service.mint('mcp_at_live', 'secret')).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessions.openAgentSession).not.toHaveBeenCalled();
    expect(analytics.trackEvent).not.toHaveBeenCalled();
  });
});
