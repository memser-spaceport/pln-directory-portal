// The real service reaches MemberCvImportsService, whose dependency graph includes
// an ESM-only package Jest will not parse, and the session guard imports axios,
// which ships ESM. Neither is exercised here — the guard is only compared by
// identity — so both are stubbed at the module boundary.
jest.mock('./team-hiring.service', () => ({ TeamHiringService: class {} }));
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));

import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { TeamHiringController } from './team-hiring.controller';
import type { TeamHiringService } from './team-hiring.service';

describe('TeamHiringController', () => {
  let service: {
    assertCanRead: jest.Mock;
    counts: jest.Mock;
    roleApplicants: jest.Mock;
    setReviewed: jest.Mock;
    markSeen: jest.Mock;
  };
  let controller: TeamHiringController;
  const req = { userEmail: 'lead@example.com' } as never;

  beforeEach(() => {
    service = {
      assertCanRead: jest.fn().mockResolvedValue('m-lead'),
      counts: jest.fn().mockResolvedValue({ counts: [] }),
      roleApplicants: jest.fn().mockResolvedValue({ applications: [], interests: [] }),
      setReviewed: jest.fn().mockResolvedValue({ uid: 'app-1', reviewed: true }),
      markSeen: jest.fn().mockResolvedValue({ uid: 'app-1', seenAt: '2026-09-21T10:00:00.000Z' }),
    };
    controller = new TeamHiringController(service as unknown as TeamHiringService);
  });

  it('sits behind the member session guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TeamHiringController)).toEqual([UserTokenValidation]);
  });

  it('is mounted where the frontend calls', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TeamHiringController)).toBe('v1/job-openings');
    expect(Reflect.getMetadata(PATH_METADATA, TeamHiringController.prototype.applicantCounts)).toBe(
      'teams/:teamUid/applicant-counts'
    );
    expect(Reflect.getMetadata(PATH_METADATA, TeamHiringController.prototype.roleApplicants)).toBe(
      'teams/:teamUid/roles/:roleUid/applicants'
    );
    expect(Reflect.getMetadata(PATH_METADATA, TeamHiringController.prototype.setReviewed)).toBe(':kind/:uid/reviewed');
    expect(Reflect.getMetadata(PATH_METADATA, TeamHiringController.prototype.markSeen)).toBe(':kind/:uid/seen');
  });

  it('resolves the caller against the team in the path before reading counts', async () => {
    await controller.applicantCounts('team-1', req);

    expect(service.assertCanRead).toHaveBeenCalledWith('team-1', 'lead@example.com');
    expect(service.counts).toHaveBeenCalledWith('team-1', 'm-lead');
  });

  it('passes the viewer through to a role read', async () => {
    await controller.roleApplicants('team-1', 'job-1', req);

    expect(service.roleApplicants).toHaveBeenCalledWith('team-1', 'job-1', 'm-lead');
  });

  it('accepts both kinds on the writes', async () => {
    await controller.setReviewed('applications', 'app-1', { reviewed: true }, req);
    await controller.markSeen('interests', 'int-1', req);

    expect(service.setReviewed).toHaveBeenCalledWith('applications', 'app-1', true, 'lead@example.com');
    expect(service.markSeen).toHaveBeenCalledWith('interests', 'int-1', 'lead@example.com');
  });

  it('rejects an unknown kind rather than guessing a table', async () => {
    await expect(controller.setReviewed('candidates', 'app-1', { reviewed: true }, req)).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(controller.markSeen('candidates', 'app-1', req)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.setReviewed).not.toHaveBeenCalled();
    expect(service.markSeen).not.toHaveBeenCalled();
  });

  it('answers 400, not 500, on a body without a boolean', async () => {
    await expect(controller.setReviewed('applications', 'app-1', {}, req)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.setReviewed('applications', 'app-1', { reviewed: 'yes' }, req)).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(service.setReviewed).not.toHaveBeenCalled();
  });

  it('takes no body on seen', async () => {
    const out = await controller.markSeen('applications', 'app-1', req);

    expect(out).toEqual({ uid: 'app-1', seenAt: '2026-09-21T10:00:00.000Z' });
  });
});
