jest.mock('../../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import { UnauthorizedException } from '@nestjs/common';
import { AiAppTokenGuard } from './ai-app-token.guard';

describe('AiAppTokenGuard feedback denials', () => {
  const analytics = { trackEvent: jest.fn() };
  const prisma = { aiAppConnectSession: { findUnique: jest.fn() } };
  const guard = new AiAppTokenGuard(prisma as any, analytics as any);

  beforeEach(() => analytics.trackEvent.mockClear());

  const context = (url: string, method = 'GET') =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: {}, originalUrl: url, method, params: { uid: 'app-1' } }),
      }),
    } as any);

  it('records a missing token on the feedback routes', async () => {
    await expect(guard.canActivate(context('/v1/ai-apps/app-1/agent/feedback'))).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(analytics.trackEvent).toHaveBeenCalledWith({
      name: 'ai_apps_agent_feedback_denied',
      distinctId: 'agent:app-1',
      properties: { appUid: 'app-1', action: 'list', reason: 'bad_token' },
    });
  });

  it('does not record a missing token on other agent routes', async () => {
    await expect(guard.canActivate(context('/v1/ai-apps/app-1/agent', 'PATCH'))).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(analytics.trackEvent).not.toHaveBeenCalled();
  });
});
