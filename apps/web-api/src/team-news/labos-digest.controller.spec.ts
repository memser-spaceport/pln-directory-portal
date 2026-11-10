import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { JwtService } from '../utils/jwt/jwt.service';
import { LabosDigestAdminController } from './labos-digest-admin.controller';
import { LabosDigestServiceController } from './labos-digest-service.controller';

jest.mock('./team-news.service', () => ({ TeamNewsService: class TeamNewsService {} }));

const httpContext = (authorization?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: authorization ? { authorization } : {} }),
    }),
  } as unknown as ExecutionContext);

describe('LabOS Digest access', () => {
  const originalAdminSecret = process.env.ADMIN_TOKEN_SECRET;
  const originalServiceSecret = process.env.INTERNAL_SERVICE_SECRET;

  beforeAll(() => {
    process.env.ADMIN_TOKEN_SECRET = 'test-admin-secret';
    process.env.INTERNAL_SERVICE_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.ADMIN_TOKEN_SECRET = originalAdminSecret;
    process.env.INTERNAL_SERVICE_SECRET = originalServiceSecret;
  });

  it('guards the admin routes with the directory-admin guard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, LabosDigestAdminController);
    expect(guards).toContain(AdminAuthGuard);
  });

  it('returns 401 without an admin token and 403 for a signed-in non-admin', async () => {
    const jwt = new JwtService();
    const guard = new AdminAuthGuard(jwt);

    await expect(guard.canActivate(httpContext())).rejects.toBeInstanceOf(UnauthorizedException);

    const memberToken = await jwt.getSignedToken([], 'member-1', []);
    await expect(guard.canActivate(httpContext(`Bearer ${memberToken}`))).rejects.toBeInstanceOf(ForbiddenException);

    const adminToken = await jwt.getSignedToken([], 'admin-1', ['directory.admin.full']);
    await expect(guard.canActivate(httpContext(`Bearer ${adminToken}`))).resolves.toBe(true);
  });

  it('guards the service API with the service key and its own rate limit', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, LabosDigestServiceController);
    expect(guards).toContain(ServiceAuthGuard);
    expect(guards).toContain(ThrottlerGuard);
    expect(Reflect.getMetadata('THROTTLER:LIMIT', LabosDigestServiceController)).toBe(60);
    expect(Reflect.getMetadata('THROTTLER:TTL', LabosDigestServiceController)).toBe(60);
  });

  it('returns 401 for no key, a wrong key, and a member token', () => {
    const guard = new ServiceAuthGuard();
    expect(() => guard.canActivate(httpContext())).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(httpContext('Bearer wrong'))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(httpContext('Bearer eyJhbGciOiJub25lIn0.e30.'))).toThrow(UnauthorizedException);
    expect(guard.canActivate(httpContext('Bearer test-secret'))).toBe(true);
  });
});
