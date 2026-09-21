jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: class AnalyticsService {},
}));

import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { INTEGRATION_SCOPES_KEY } from '../decorators/require-integration-scopes.decorator';
import { IntegrationKeyGuard } from '../guards/integration-key.guard';
import type { JobOpeningsIntegrationService } from './job-openings-integration.service';
import { JobOpeningsIntegrationController } from './job-openings-integration.controller';

// Metadata key @nestjs/throttler's SkipThrottle() sets on the class (THROTTLER_SKIP).
const THROTTLER_SKIP = 'THROTTLER:SKIP';

const key = {
  uid: 'ik-1',
  teamUid: 'team-1',
  scopes: ['jobs:write'] as ('jobs:write' | 'candidates:read')[],
  name: 'PL ATS',
  keyPrefix: 'labos_ik_abcdefg',
};

describe('JobOpeningsIntegrationController', () => {
  let service: { upsertByExternalId: jest.Mock; setState: jest.Mock; claim: jest.Mock; listForTeam: jest.Mock };
  let controller: JobOpeningsIntegrationController;

  beforeEach(() => {
    service = { upsertByExternalId: jest.fn(), setState: jest.fn(), claim: jest.fn(), listForTeam: jest.fn() };
    controller = new JobOpeningsIntegrationController(service as unknown as JobOpeningsIntegrationService);
  });

  it('is guarded by IntegrationKeyGuard, requires jobs:write and skips the member throttler', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, JobOpeningsIntegrationController)).toEqual([IntegrationKeyGuard]);
    expect(Reflect.getMetadata(INTEGRATION_SCOPES_KEY, JobOpeningsIntegrationController)).toEqual(['jobs:write']);
    expect(Reflect.getMetadata(THROTTLER_SKIP, JobOpeningsIntegrationController)).toBe(true);
    expect(Reflect.getMetadata(PATH_METADATA, JobOpeningsIntegrationController)).toBe('v1/integrations/jobs');
  });

  it('binds the four routes', () => {
    const proto = JobOpeningsIntegrationController.prototype;
    expect(Reflect.getMetadata(METHOD_METADATA, proto.upsert)).toBe(RequestMethod.PUT);
    expect(Reflect.getMetadata(PATH_METADATA, proto.upsert)).toBe(':externalId');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.setState)).toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata(PATH_METADATA, proto.setState)).toBe(':externalId/state');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.claim)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(PATH_METADATA, proto.claim)).toBe('claim');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.list)).toBe(RequestMethod.GET);
  });

  it('delegates each route with the key context from the request', async () => {
    const body = { title: 'x', descriptionHtml: '<p>x</p>', state: 'published' as const };
    await controller.upsert('role-1', body, { integrationKey: key });
    expect(service.upsertByExternalId).toHaveBeenCalledWith(key, 'role-1', body);

    await controller.setState('role-1', { state: 'paused' }, { integrationKey: key });
    expect(service.setState).toHaveBeenCalledWith(key, 'role-1', 'paused');

    await controller.claim({ uid: 'job-1', externalId: 'role-1' }, { integrationKey: key });
    expect(service.claim).toHaveBeenCalledWith(key, 'job-1', 'role-1');

    await controller.list({ integrationKey: key });
    expect(service.listForTeam).toHaveBeenCalledWith(key);
  });
});
