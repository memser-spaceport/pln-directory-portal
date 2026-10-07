jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false), post: jest.fn(), get: jest.fn() }));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { McpAppSessionService } from './mcp-app-session.service';

const ACTOR = {
  authorizationUid: 'auth-1',
  memberUid: 'member-1',
  email: 'ada@example.com',
  name: 'Ada',
  clientName: 'Claude',
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
  const service = new McpAppSessionService(oauth as any, access as any, sessions as any, analytics as any);
  return { service, oauth, access, sessions, analytics };
}

describe('McpAppSessionService', () => {
  it('mints an agent session for the member and records the open', async () => {
    const { service, oauth, access, sessions, analytics } = build();
    const grant = await service.mint('mcp_at_live', 'foo');

    expect(grant).toEqual(GRANT);
    expect(grant).not.toHaveProperty('authorizationUid');
    expect(JSON.stringify(grant)).not.toContain('mcp_at_live');
    expect(oauth.authenticateAccessToken).toHaveBeenCalledWith('mcp_at_live');
    expect(access.checkAccess).toHaveBeenCalledWith('member-1', 'foo', 'GET', { app: APP }, 'prod');
    expect(sessions.openAgentSession).toHaveBeenCalledWith('member-1', 'foo', 'auth-1');
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
