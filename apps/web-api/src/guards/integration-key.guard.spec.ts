import { ExecutionContext, ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { IntegrationKeysService } from '../integration-keys/integration-keys.service';
import { IntegrationKeyGuard } from './integration-key.guard';

const SECRET = 'labos_ik_supersecretvalue';

const key = {
  uid: 'ik-1',
  teamUid: 'team-1',
  scopes: ['candidates:read'] as ('jobs:write' | 'candidates:read')[],
  name: 'PL ATS',
  keyPrefix: 'labos_ik_supers',
};

describe('IntegrationKeyGuard', () => {
  let authenticate: jest.Mock;
  let getAllAndOverride: jest.Mock;
  let guard: IntegrationKeyGuard;
  let logSpy: jest.SpyInstance;

  const contextFor = (authorization?: string) => {
    const req: Record<string, unknown> = {
      headers: authorization === undefined ? {} : { authorization },
      method: 'GET',
      originalUrl: '/v1/integrations/me',
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => 'handler',
      getClass: () => 'class',
    } as unknown as ExecutionContext;
    return { ctx, req };
  };

  beforeEach(() => {
    authenticate = jest.fn();
    getAllAndOverride = jest.fn().mockReturnValue(undefined);
    guard = new IntegrationKeyGuard(
      { authenticate } as unknown as IntegrationKeysService,
      { getAllAndOverride } as unknown as Reflector
    );
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('accepts an active key, attaches it to the request and logs the key uid but never the key', async () => {
    authenticate.mockResolvedValue(key);
    const { ctx, req } = contextFor(`Bearer ${SECRET}`);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);

    expect(authenticate).toHaveBeenCalledWith(SECRET);
    expect(req.integrationKey).toEqual(key);
    const line = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes('ik-1'));
    expect(line).toContain('GET');
    expect(line).toContain('/v1/integrations/me');
    expect(line).not.toContain(SECRET);
  });

  it('rejects a missing Authorization header with 401 without touching the service', async () => {
    const { ctx } = contextFor();
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('rejects a non-Bearer scheme with 401', async () => {
    const { ctx } = contextFor(`Basic ${SECRET}`);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('rejects an unknown or revoked key with the same 401', async () => {
    authenticate.mockResolvedValue(null);
    const { ctx } = contextFor(`Bearer ${SECRET}`);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      constructor: UnauthorizedException,
      message: 'Invalid integration key',
    });
  });

  it('does not accept the shared internal service secret', async () => {
    process.env.INTERNAL_SERVICE_SECRET = 'the-global-secret';
    authenticate.mockResolvedValue(null);
    const { ctx } = contextFor('Bearer the-global-secret');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authenticate).toHaveBeenCalledWith('the-global-secret');
  });

  it('rejects a key lacking a declared scope with 403, after authentication', async () => {
    authenticate.mockResolvedValue(key);
    getAllAndOverride.mockReturnValue(['jobs:write']);
    const { ctx, req } = contextFor(`Bearer ${SECRET}`);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(req.integrationKey).toBeUndefined();
  });

  it('passes when every declared scope is present', async () => {
    authenticate.mockResolvedValue({ ...key, scopes: ['jobs:write', 'candidates:read'] });
    getAllAndOverride.mockReturnValue(['jobs:write', 'candidates:read']);
    const { ctx } = contextFor(`Bearer ${SECRET}`);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('passes any active key when the route declares no scope', async () => {
    authenticate.mockResolvedValue({ ...key, scopes: [] });
    getAllAndOverride.mockReturnValue(undefined);
    const { ctx } = contextFor(`Bearer ${SECRET}`);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
