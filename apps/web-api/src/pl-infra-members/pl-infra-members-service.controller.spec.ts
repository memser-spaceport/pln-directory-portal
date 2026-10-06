jest.mock('./pl-infra-members.service', () => ({
  PlInfraMembersService: class PlInfraMembersService {},
}));

import { BadRequestException, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { PlInfraMembersServiceController } from './pl-infra-members-service.controller';
import { PlInfraMembersService } from './pl-infra-members.service';

const contextWithAuth = (authorization?: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers: authorization ? { authorization } : {} }) }),
  } as unknown as ExecutionContext);

describe('PlInfraMembersServiceController', () => {
  const listMembers = jest.fn();
  const controller = new PlInfraMembersServiceController({ listMembers } as unknown as PlInfraMembersService);

  beforeEach(() => {
    jest.clearAllMocks();
    listMembers.mockResolvedValue({ page: 1, limit: 500, total: 0, items: [] });
  });

  it('is protected by the existing service-to-service guard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, PlInfraMembersServiceController);
    expect(guards).toContain(ServiceAuthGuard);
  });

  describe('ServiceAuthGuard on this route', () => {
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

    it('refuses a call with wrong credentials', () => {
      expect(() => new ServiceAuthGuard().canActivate(contextWithAuth('Bearer nope'))).toThrow(UnauthorizedException);
    });

    it('lets a call with the service credential through', () => {
      expect(new ServiceAuthGuard().canActivate(contextWithAuth('Bearer test-secret'))).toBe(true);
    });
  });

  it('defaults page and limit and passes them to the service', async () => {
    await controller.list({});
    expect(listMembers).toHaveBeenCalledWith({ page: 1, limit: 500 });
  });

  it('parses page and limit from the query string', async () => {
    await controller.list({ page: '2', limit: '50' });
    expect(listMembers).toHaveBeenCalledWith({ page: 2, limit: 50 });
  });

  it('rejects an invalid limit without reading the list', async () => {
    await expect(controller.list({ limit: '5000' })).rejects.toBeInstanceOf(BadRequestException);
    expect(listMembers).not.toHaveBeenCalled();
  });

  it.each(['0x2', '1e3', ' 5', '-1', '2.5'])('rejects a non-decimal page value %p', async (page) => {
    await expect(controller.list({ page })).rejects.toBeInstanceOf(BadRequestException);
    expect(listMembers).not.toHaveBeenCalled();
  });
});
