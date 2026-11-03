import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IntegrationKeyGuard } from '../guards/integration-key.guard';
import { INTEGRATION_SCOPES_KEY } from '../decorators/require-integration-scopes.decorator';
import { PlaaAccessController } from './plaa-access.controller';
import { IntegrationKeysService } from './integration-keys.service';

const scope = 'plaa:access:manage';

describe('PLAA integration authorization', () => {
  const reflector = new Reflector();
  const keys = { authenticate: jest.fn() };
  const guard = new IntegrationKeyGuard(keys as unknown as IntegrationKeysService, reflector);
  const request = (authorization?: string) => ({
    headers: authorization ? { authorization } : {},
    method: 'POST',
    originalUrl: '/v1/integrations/plaa/members/member-1/access',
  });
  const context = (handler: 'grant' | 'revoke', req: ReturnType<typeof request>): ExecutionContext => ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => PlaaAccessController.prototype[handler],
    getClass: () => PlaaAccessController,
  } as unknown as ExecutionContext);

  beforeEach(() => jest.clearAllMocks());

  it.each(['grant', 'revoke'] as const)('%s requires PLAA management scope', (method) => {
    const required = reflector.getAllAndOverride<string[]>(INTEGRATION_SCOPES_KEY, [
      PlaaAccessController.prototype[method], PlaaAccessController,
    ]);
    expect(required).toEqual([scope]);
  });

  it.each(['grant', 'revoke'] as const)('%s denies a valid key without PLAA scope', async (method) => {
    keys.authenticate.mockResolvedValue({ uid: 'key-1', scopes: ['jobs:write'] });
    await expect(guard.canActivate(context(method, request('Bearer valid-key')))).rejects.toThrow(ForbiddenException);
  });

  it.each(['grant', 'revoke'] as const)('%s allows a key with PLAA scope', async (method) => {
    keys.authenticate.mockResolvedValue({ uid: 'key-1', scopes: [scope] });
    const req = request('Bearer valid-key');
    await expect(guard.canActivate(context(method, req))).resolves.toBe(true);
    expect((req as typeof req & { integrationKey?: { uid: string } }).integrationKey?.uid).toBe('key-1');
  });

  it('rejects missing authorization', async () => {
    await expect(guard.canActivate(context('grant', request()))).rejects.toThrow(UnauthorizedException);
    expect(keys.authenticate).not.toHaveBeenCalled();
  });

  it('rejects revoked or unknown keys', async () => {
    keys.authenticate.mockResolvedValue(null);
    await expect(guard.canActivate(context('grant', request('Bearer revoked-key')))).rejects.toThrow(UnauthorizedException);
  });
});
