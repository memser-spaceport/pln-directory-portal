import { BadRequestException, RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { MemberInterestProfileController } from './member-interest-profile.controller';
import { MemberInterestProfileJob } from './member-interest-profile.job';

describe('MemberInterestProfileController (LAB-3122)', () => {
  const profiles = {
    readProfiles: jest.fn(async () => ({ items: [] })),
    startAdminRebuild: jest.fn(async () => ({ runId: 1 })),
  };
  const controller = new MemberInterestProfileController(profiles as never);

  beforeEach(() => jest.clearAllMocks());

  it('is admin-only under v1/admin/member-interest-profiles', () => {
    expect(Reflect.getMetadata(PATH_METADATA, MemberInterestProfileController)).toBe(
      'v1/admin/member-interest-profiles'
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, MemberInterestProfileController)).toEqual([AdminAuthGuard]);
    const rebuild = MemberInterestProfileController.prototype.rebuild;
    expect(Reflect.getMetadata(PATH_METADATA, rebuild)).toBe('rebuild');
    expect(Reflect.getMetadata(METHOD_METADATA, rebuild)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, rebuild)).toBe(202);
  });

  it('parses the member list, deduped, with defaults', async () => {
    await controller.getProfiles({ memberUids: 'm1, m2,m1' });

    expect(profiles.readProfiles).toHaveBeenCalledWith({ memberUids: ['m1', 'm2'], top: 5, page: 1, limit: 20 });
  });

  it.each([
    [{}],
    [{ memberUids: '' }],
    [{ memberUids: 'm1', top: '51' }],
    [{ memberUids: Array.from({ length: 101 }, (_, i) => `m${i}`).join(',') }],
  ])('answers 400 for %j', async (query) => {
    await expect(controller.getProfiles(query)).rejects.toBeInstanceOf(BadRequestException);
    expect(profiles.readProfiles).not.toHaveBeenCalled();
  });

  it('the daily job runs at 04:00 UTC by default', () => {
    expect(Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, MemberInterestProfileJob.prototype.run)).toEqual(
      expect.objectContaining({ cronTime: '0 4 * * *', timeZone: 'UTC', name: 'member-interest-profile-rebuild' })
    );
  });
});
