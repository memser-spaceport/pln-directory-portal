jest.mock('../../../../libs/contracts/src/schema', () => ({
  ResponseCreateImageSchema: {},
  ResponseImageSchema: { array: () => ({}) },
}));

import { ExecutionContext, ForbiddenException, RequestMethod, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AdminImagesController } from './admin-images.controller';
import { ANONYMOUS_IMAGE_UPLOAD_LIMIT, ANONYMOUS_IMAGE_UPLOAD_TTL_SECONDS } from './images.constants';
import { ImagesController } from './images.controller';
import { ServiceImagesController } from './service-images.controller';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { ADMIN_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';

const THROTTLER_LIMIT = 'THROTTLER:LIMIT';
const THROTTLER_TTL = 'THROTTLER:TTL';
const THROTTLER_SKIP = 'THROTTLER:SKIP';

const httpContext = (authorization?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: authorization ? { authorization } : {} }),
    }),
  } as unknown as ExecutionContext);

describe('image upload credentials', () => {
  describe('POST /v1/images', () => {
    const handler = ImagesController.prototype.uploadImage;

    it('stays a public POST and limits one IP', () => {
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('/v1/images');
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
      expect(Reflect.getMetadata(GUARDS_METADATA, ImagesController)).toBeUndefined();
      expect(Reflect.getMetadata(THROTTLER_LIMIT, handler)).toBe(ANONYMOUS_IMAGE_UPLOAD_LIMIT);
      expect(Reflect.getMetadata(THROTTLER_TTL, handler)).toBe(ANONYMOUS_IMAGE_UPLOAD_TTL_SECONDS);
      expect(ANONYMOUS_IMAGE_UPLOAD_LIMIT).toBe(60);
      expect(ANONYMOUS_IMAGE_UPLOAD_TTL_SECONDS).toBe(60);
    });
  });

  describe('POST /v1/admin/images', () => {
    it('requires the admin guard', () => {
      expect(Reflect.getMetadata(PATH_METADATA, AdminImagesController)).toBe('v1/admin');
      expect(Reflect.getMetadata(PATH_METADATA, AdminImagesController.prototype.uploadImage)).toBe('images');
      expect(Reflect.getMetadata(METHOD_METADATA, AdminImagesController.prototype.uploadImage)).toBe(
        RequestMethod.POST
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, AdminImagesController)).toEqual([AdminAuthGuard]);
    });

    it('refuses a caller with no admin token', async () => {
      const guard = new AdminAuthGuard({ validateToken: jest.fn() } as never);
      await expect(guard.canActivate(httpContext())).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('refuses a token that is not an admin token', async () => {
      const guard = new AdminAuthGuard({
        validateToken: jest.fn().mockRejectedValue(new Error('bad token')),
      } as never);
      await expect(guard.canActivate(httpContext('Bearer not-an-admin-token'))).rejects.toBeInstanceOf(
        UnauthorizedException
      );
    });

    it('refuses a token that lacks directory.admin.full', async () => {
      const guard = new AdminAuthGuard({
        validateToken: jest.fn().mockResolvedValue({ permissions: [] }),
      } as never);
      await expect(guard.canActivate(httpContext('Bearer member-token'))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('accepts an admin token', async () => {
      const guard = new AdminAuthGuard({
        validateToken: jest.fn().mockResolvedValue({ permissions: [ADMIN_PERMISSIONS.DIRECTORY_FULL] }),
      } as never);
      await expect(guard.canActivate(httpContext('Bearer admin-token'))).resolves.toBe(true);
    });
  });

  describe('POST /v1/service/images', () => {
    const original = process.env.INTERNAL_SERVICE_SECRET;

    beforeAll(() => {
      process.env.INTERNAL_SERVICE_SECRET = 'test-secret';
    });

    afterAll(() => {
      process.env.INTERNAL_SERVICE_SECRET = original;
    });

    it('requires the service guard and skips the member rate limiter', () => {
      expect(Reflect.getMetadata(PATH_METADATA, ServiceImagesController)).toBe('v1/service');
      expect(Reflect.getMetadata(PATH_METADATA, ServiceImagesController.prototype.uploadImage)).toBe('images');
      expect(Reflect.getMetadata(METHOD_METADATA, ServiceImagesController.prototype.uploadImage)).toBe(
        RequestMethod.POST
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, ServiceImagesController)).toEqual([ServiceAuthGuard]);
      expect(Reflect.getMetadata(THROTTLER_SKIP, ServiceImagesController)).toBe(true);
    });

    it('refuses a caller with no service key', () => {
      expect(() => new ServiceAuthGuard().canActivate(httpContext())).toThrow(UnauthorizedException);
    });

    it('refuses a wrong service key', () => {
      expect(() => new ServiceAuthGuard().canActivate(httpContext('Bearer wrong'))).toThrow(UnauthorizedException);
    });

    it('accepts the service secret as Bearer or Basic', () => {
      const guard = new ServiceAuthGuard();
      expect(guard.canActivate(httpContext('Bearer test-secret'))).toBe(true);
      expect(guard.canActivate(httpContext('Basic test-secret'))).toBe(true);
    });
  });
});
