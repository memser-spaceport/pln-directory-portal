jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AgentFeedbackDeniedInterceptor } from './agent-feedback-denied.interceptor';

function host(method: string, memberUid?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, params: { uid: 'app-1' }, aiAppMemberUid: memberUid }),
    }),
  };
}

describe('AgentFeedbackDeniedInterceptor', () => {
  const analytics = { trackEvent: jest.fn() };
  const interceptor = new AgentFeedbackDeniedInterceptor(analytics as any);

  beforeEach(() => analytics.trackEvent.mockClear());

  it.each([
    [new ForbiddenException('The agent may access feedback only for apps owned by its connected member'), 'forbidden'],
    [new ForbiddenException('This deployment key cannot access that app'), 'wrong_app'],
    [new NotFoundException('AI App not found: app-1'), 'not_found'],
    [new UnprocessableEntityException('Input validation failed: status'), 'invalid_status'],
    [new BadRequestException('status must be NEW, VIEWED or IMPLEMENTED'), 'invalid_status'],
  ] as const)('records %s as %s and rethrows', async (error, reason) => {
    const recorded = lastValueFrom(
      interceptor.intercept(host('PATCH', 'owner-1') as any, { handle: () => throwError(() => error) })
    );
    await expect(recorded).rejects.toBe(error);
    expect(analytics.trackEvent).toHaveBeenCalledWith({
      name: 'ai_apps_agent_feedback_denied',
      distinctId: 'owner-1',
      properties: { appUid: 'app-1', action: 'update', reason },
    });
  });

  it('attributes a list rejection to the route method', async () => {
    const error = new ForbiddenException('no');
    await expect(
      lastValueFrom(interceptor.intercept(host('GET') as any, { handle: () => throwError(() => error) }))
    ).rejects.toBe(error);
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: 'agent:app-1',
        properties: expect.objectContaining({ action: 'list', reason: 'forbidden' }),
      })
    );
  });

  it('leaves a successful call unrecorded', async () => {
    await expect(
      lastValueFrom(interceptor.intercept(host('GET', 'owner-1') as any, { handle: () => of({ ok: true }) }))
    ).resolves.toEqual({ ok: true });
    expect(analytics.trackEvent).not.toHaveBeenCalled();
  });
});
