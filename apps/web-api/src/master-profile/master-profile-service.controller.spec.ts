import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { SKIP_EMPTY_STRING_TO_NULL } from '../decorators/skip-empty-string-to-null.decorator';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { MasterProfileService } from './master-profile.service';
import { MasterProfileServiceController } from './master-profile-service.controller';

const contextWithAuth = (authorization?: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers: authorization ? { authorization } : {} }) }),
  } as unknown as ExecutionContext);

describe('MasterProfileServiceController patch', () => {
  const patchFields = jest.fn();
  const controller = new MasterProfileServiceController({ patchFields } as unknown as MasterProfileService);

  beforeEach(() => {
    jest.clearAllMocks();
    patchFields.mockResolvedValue({ uid: 'u1', locked: ['bio'], unlocked: [] });
  });

  it('is protected by the service-to-service guard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, MasterProfileServiceController);
    expect(guards).toContain(ServiceAuthGuard);
  });

  it('keeps an empty string so it clears text instead of unlocking', () => {
    const skip = new Reflector().getAllAndOverride(SKIP_EMPTY_STRING_TO_NULL, [
      MasterProfileServiceController.prototype.patchProfile,
      MasterProfileServiceController,
    ]);
    expect(skip).toBe(true);
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

  it('patches a profile with the optional service actor', async () => {
    await controller.patchProfile('u1', { fields: { bio: 'Ada' }, actor: { uid: 'svc', email: 'svc@example.com' } });

    expect(patchFields).toHaveBeenCalledWith('u1', { bio: 'Ada' }, {
      source: 'service',
      actorUid: 'svc',
      actorEmail: 'svc@example.com',
    });
  });
});
