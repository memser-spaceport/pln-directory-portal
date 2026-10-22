jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: class AnalyticsService {},
}));

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { SKIP_EMPTY_STRING_TO_NULL } from '../decorators/skip-empty-string-to-null.decorator';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { ManualFieldsPatchAuthFilter } from '../manual-field-lock/manual-field-lock.analytics';
import { ANALYTICS_EVENTS } from '../utils/constants';
import { WarmIntrosV2Service } from './warm-intros-v2.service';
import { WarmIntrosV2ServiceController } from './warm-intros-v2-service.controller';

const contextWithAuth = (authorization?: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers: authorization ? { authorization } : {} }) }),
  } as unknown as ExecutionContext);

describe('WarmIntrosV2ServiceController patch', () => {
  const patchEdgeFields = jest.fn();
  const patchPathFields = jest.fn();
  const trackEvent = jest.fn();
  const controller = new WarmIntrosV2ServiceController(
    {
      patchEdgeFields,
      patchPathFields,
    } as unknown as WarmIntrosV2Service,
    { trackEvent } as unknown as AnalyticsService,
    { claim: jest.fn(), finish: jest.fn() } as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is protected by the service-to-service guard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, WarmIntrosV2ServiceController);
    expect(guards).toContain(ServiceAuthGuard);
  });

  it('keeps an empty string on both patch routes', () => {
    const reflector = new Reflector();
    expect(
      reflector.getAllAndOverride(SKIP_EMPTY_STRING_TO_NULL, [
        WarmIntrosV2ServiceController.prototype.patchEdge,
        WarmIntrosV2ServiceController,
      ])
    ).toBe(true);
    expect(
      reflector.getAllAndOverride(SKIP_EMPTY_STRING_TO_NULL, [
        WarmIntrosV2ServiceController.prototype.patchPath,
        WarmIntrosV2ServiceController,
      ])
    ).toBe(true);
  });

  describe('ServiceAuthGuard', () => {
    const original = process.env.INTERNAL_SERVICE_SECRET;

    beforeAll(() => {
      process.env.INTERNAL_SERVICE_SECRET = 'test-secret';
    });

    afterAll(() => {
      process.env.INTERNAL_SERVICE_SECRET = original;
    });

    it('refuses a call without credentials', () => {
      expect(() => new ServiceAuthGuard().canActivate(contextWithAuth())).toThrow(UnauthorizedException);
    });
  });

  it('patches an edge and a path', async () => {
    patchEdgeFields.mockResolvedValue({ uid: 'e1', locked: ['score'], unlocked: [], row: {} });
    patchPathFields.mockResolvedValue({ uid: 'p1', locked: ['hopCount'], unlocked: [], row: {} });

    await controller.patchEdge('e1', { fields: { score: 0.2 } });
    await controller.patchPath('p1', { fields: { hopCount: 1 } });

    expect(patchEdgeFields).toHaveBeenCalledWith(
      'e1',
      { score: 0.2 },
      {
        source: 'service',
        actorUid: null,
        actorEmail: null,
      }
    );
    expect(patchPathFields).toHaveBeenCalledWith(
      'p1',
      { hopCount: 1 },
      {
        source: 'service',
        actorUid: null,
        actorEmail: null,
      }
    );
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ANALYTICS_EVENTS.INVESTOR_DB.MANUAL_FIELDS_PATCHED,
        properties: expect.objectContaining({ subjectType: 'connection_edge', uid: 'e1' }),
      })
    );
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ANALYTICS_EVENTS.INVESTOR_DB.MANUAL_FIELDS_PATCHED,
        properties: expect.objectContaining({ subjectType: 'warm_path_v2', uid: 'p1' }),
      })
    );
  });

  it('records unauthorized patch attempts on both routes', () => {
    expect(
      Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, WarmIntrosV2ServiceController.prototype.patchEdge)
    ).toContain(ManualFieldsPatchAuthFilter);
    expect(
      Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, WarmIntrosV2ServiceController.prototype.patchPath)
    ).toContain(ManualFieldsPatchAuthFilter);
  });
});
