import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { SKIP_EMPTY_STRING_TO_NULL } from '../decorators/skip-empty-string-to-null.decorator';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { WarmIntrosV2Service } from './warm-intros-v2.service';
import { WarmIntrosV2ServiceController } from './warm-intros-v2-service.controller';

const contextWithAuth = (authorization?: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers: authorization ? { authorization } : {} }) }),
  } as unknown as ExecutionContext);

describe('WarmIntrosV2ServiceController patch', () => {
  const patchEdgeFields = jest.fn();
  const patchPathFields = jest.fn();
  const controller = new WarmIntrosV2ServiceController({
    patchEdgeFields,
    patchPathFields,
  } as unknown as WarmIntrosV2Service);

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
    await controller.patchEdge('e1', { fields: { score: 0.2 } });
    await controller.patchPath('p1', { fields: { hopCount: 1 } });

    expect(patchEdgeFields).toHaveBeenCalledWith('e1', { score: 0.2 }, {
      source: 'service',
      actorUid: null,
      actorEmail: null,
    });
    expect(patchPathFields).toHaveBeenCalledWith('p1', { hopCount: 1 }, {
      source: 'service',
      actorUid: null,
      actorEmail: null,
    });
  });
});
