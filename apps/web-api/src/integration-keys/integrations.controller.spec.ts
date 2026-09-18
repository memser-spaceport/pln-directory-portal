// The real service reaches MemberCvImportsService, whose dependency graph includes
// an ESM-only package Jest will not parse. This spec only checks the controller's
// metadata and delegation, so the class is stubbed at the module boundary.
jest.mock('./integration-candidates.service', () => ({ IntegrationCandidatesService: class {} }));

import { GUARDS_METADATA } from '@nestjs/common/constants';
import { IntegrationKeyGuard } from '../guards/integration-key.guard';
import type { IntegrationCandidatesService } from './integration-candidates.service';
import type { IntegrationKeysService } from './integration-keys.service';
import { IntegrationsController } from './integrations.controller';

// Metadata key @nestjs/throttler's SkipThrottle() sets on the class (THROTTLER_SKIP).
const THROTTLER_SKIP = 'THROTTLER:SKIP';

describe('IntegrationsController', () => {
  let service: { describe: jest.Mock };
  let controller: IntegrationsController;

  beforeEach(() => {
    service = { describe: jest.fn() };
    controller = new IntegrationsController(
      service as unknown as IntegrationKeysService,
      { feed: jest.fn(), applicationCvUrl: jest.fn() } as unknown as IntegrationCandidatesService
    );
  });

  it('is guarded by IntegrationKeyGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, IntegrationsController)).toEqual([IntegrationKeyGuard]);
  });

  it('is exempt from the member rate limiter', () => {
    expect(Reflect.getMetadata(THROTTLER_SKIP, IntegrationsController)).toBe(true);
  });

  it('returns the calling key’s identity without secret fields', async () => {
    const key = {
      uid: 'ik-1',
      teamUid: 'team-1',
      scopes: ['jobs:write'] as ('jobs:write' | 'candidates:read')[],
      name: 'PL ATS',
      keyPrefix: 'labos_ik_abcdefg',
    };
    service.describe.mockResolvedValue({
      uid: 'ik-1',
      keyPrefix: 'labos_ik_abcdefg',
      name: 'PL ATS',
      teamUid: 'team-1',
      teamName: 'Protocol Labs',
      scopes: ['jobs:write'],
    });

    const out = await controller.me({ integrationKey: key });

    expect(service.describe).toHaveBeenCalledWith(key);
    expect(out).toEqual({
      uid: 'ik-1',
      keyPrefix: 'labos_ik_abcdefg',
      name: 'PL ATS',
      teamUid: 'team-1',
      teamName: 'Protocol Labs',
      scopes: ['jobs:write'],
    });
    expect(out).not.toHaveProperty('key');
    expect(out).not.toHaveProperty('keyHash');
  });
});
