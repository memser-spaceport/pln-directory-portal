jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: class AnalyticsService {},
}));

import { ArgumentsHost, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { ANALYTICS_EVENTS } from '../utils/constants';
import {
  ManualFieldsPatchAuthFilter,
  manualFieldsAuthReason,
  trackServiceManualFieldsPatch,
} from './manual-field-lock.analytics';

describe('trackServiceManualFieldsPatch', () => {
  const trackEvent = jest.fn();
  const analytics = { trackEvent } as unknown as AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records a successful service patch without field values or email', async () => {
    const result = await trackServiceManualFieldsPatch(
      analytics,
      'master_profile',
      ' u1 ',
      { fields: { bio: 'secret', currentOrg: 'PL' }, actor: { uid: ' svc ', email: 'ada@example.com' } },
      async () => ({ uid: 'u1', locked: ['bio', 'currentOrg'], unlocked: [], row: { bio: 'secret' } })
    );

    expect(result.locked).toEqual(['bio', 'currentOrg']);
    expect(trackEvent).toHaveBeenCalledWith({
      name: ANALYTICS_EVENTS.INVESTOR_DB.MANUAL_FIELDS_PATCHED,
      distinctId: 'svc',
      properties: {
        subjectType: 'master_profile',
        uid: 'u1',
        fieldCount: 2,
        actorUid: 'svc',
        lockedCount: 2,
        unlockedCount: 0,
      },
    });
    const properties = trackEvent.mock.calls[0][0].properties;
    expect(properties).not.toHaveProperty('bio');
    expect(properties).not.toHaveProperty('email');
    expect(properties).not.toHaveProperty('fields');
  });

  it('records a rejected service patch and rethrows', async () => {
    const error = new BadRequestException({ message: 'invalid fields', errors: ['bio: unknown field'] });

    await expect(
      trackServiceManualFieldsPatch(analytics, 'connection_edge', 'e1', { fields: { bio: 1 } }, async () => {
        throw error;
      })
    ).rejects.toBe(error);

    expect(trackEvent).toHaveBeenCalledWith({
      name: ANALYTICS_EVENTS.INVESTOR_DB.MANUAL_FIELDS_PATCH_FAILED,
      distinctId: 'service:investor-db',
      properties: {
        subjectType: 'connection_edge',
        uid: 'e1',
        fieldCount: 1,
        errorKind: 'BadRequestException',
      },
    });
    expect(trackEvent.mock.calls[0][0].properties).not.toHaveProperty('bio');
  });
});

describe('ManualFieldsPatchAuthFilter', () => {
  const trackEvent = jest.fn();
  const filter = new ManualFieldsPatchAuthFilter({ trackEvent } as unknown as AnalyticsService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps credential failures to a short reason', () => {
    expect(manualFieldsAuthReason(new UnauthorizedException('Missing authorization header'))).toBe('missing');
    expect(manualFieldsAuthReason(new UnauthorizedException('Invalid service credentials'))).toBe(
      'invalid_credentials'
    );
    expect(manualFieldsAuthReason(new UnauthorizedException('Service authentication not configured'))).toBe(
      'unconfigured'
    );
    expect(manualFieldsAuthReason(new UnauthorizedException('Invalid authorization type'))).toBe('invalid_type');
  });

  it('records an unauthorized patch and returns 401', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const exception = new UnauthorizedException('Invalid service credentials');

    filter.catch(exception, {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/v1/service/warm-intros-v2/paths/p1?x=1', params: { uid: ' p1 ' } }),
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost);

    expect(trackEvent).toHaveBeenCalledWith({
      name: ANALYTICS_EVENTS.INVESTOR_DB.MANUAL_FIELDS_PATCH_UNAUTHORIZED,
      distinctId: 'service:investor-db',
      properties: {
        subjectType: 'warm_path_v2',
        uid: 'p1',
        reason: 'invalid_credentials',
      },
    });
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(exception.getResponse());
  });
});
