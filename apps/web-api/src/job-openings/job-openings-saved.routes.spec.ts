// The controller pulls in every job-board service, several of which reach ESM-only
// packages Jest will not parse (axios among them). None is exercised here — the
// saved handlers are called against a stub and everything else is only reflected
// over — so the heavy neighbours are stubbed at the module boundary.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('./job-openings-query.service', () => ({ JobOpeningsQueryService: class {} }));
jest.mock('./job-openings-referral.service', () => ({ JobOpeningsReferralService: class {} }));
jest.mock('./job-openings-application.service', () => ({ JobOpeningsApplicationService: class {} }));
jest.mock('./job-openings-sign-up.service', () => ({ JobOpeningsSignUpService: class {} }));
jest.mock('./job-openings-interest.service', () => ({ JobOpeningsInterestService: class {} }));
jest.mock('./job-openings-saved.service', () => ({ JobOpeningsSavedService: class {} }));
jest.mock('./job-openings-for-you.service', () => ({ JobOpeningsForYouService: class {} }));

import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { UserAuthValidateGuard } from '../guards/user-auth-validate.guard';
import { JobOpeningsController } from './job-openings.controller';
import type { JobOpeningsSavedService } from './job-openings-saved.service';

describe('saved jobs routes', () => {
  const proto = JobOpeningsController.prototype;

  let saved: { save: jest.Mock; unsave: jest.Mock; listMine: jest.Mock };
  let controller: JobOpeningsController;

  beforeEach(() => {
    saved = {
      save: jest.fn().mockResolvedValue({ jobUid: 'job-1', viewerHasSaved: true }),
      unsave: jest.fn().mockResolvedValue({ jobUid: 'job-1', viewerHasSaved: false }),
      listMine: jest.fn().mockResolvedValue({ savedJobs: [] }),
    };
    controller = new JobOpeningsController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      saved as unknown as JobOpeningsSavedService,
      {} as never
    );
  });

  it('binds the three routes where the frontend calls', () => {
    expect(Reflect.getMetadata(METHOD_METADATA, proto.getMySavedJobs)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, proto.getMySavedJobs)).toBe('/v1/job-openings/saved');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.saveJob)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(PATH_METADATA, proto.saveJob)).toBe('/v1/job-openings/:uid/save');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.unsaveJob)).toBe(RequestMethod.DELETE);
    expect(Reflect.getMetadata(PATH_METADATA, proto.unsaveJob)).toBe('/v1/job-openings/:uid/save');
  });

  it('puts all three behind the member session guard', () => {
    for (const handler of [proto.getMySavedJobs, proto.saveJob, proto.unsaveJob]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([UserAuthValidateGuard]);
    }
  });

  // Nest registers routes in method-declaration order, so `/v1/job-openings/:uid`
  // would answer `/v1/job-openings/saved` if it came first — with a 404 for a job
  // opening named "saved".
  it('declares the saved list before the single-job route', () => {
    const methods = Object.getOwnPropertyNames(proto);

    expect(methods.indexOf('getMySavedJobs')).toBeLessThan(methods.indexOf('getJob'));
  });

  it('passes the session email and the job through to the service', async () => {
    const request = { params: { uid: 'job-1' }, userEmail: 'me@example.com' } as never;

    await expect(controller.saveJob(request)).resolves.toEqual({ jobUid: 'job-1', viewerHasSaved: true });
    await expect(controller.unsaveJob(request)).resolves.toEqual({ jobUid: 'job-1', viewerHasSaved: false });
    await expect(controller.getMySavedJobs(request)).resolves.toEqual({ savedJobs: [] });

    expect(saved.save).toHaveBeenCalledWith('job-1', 'me@example.com');
    expect(saved.unsave).toHaveBeenCalledWith('job-1', 'me@example.com');
    expect(saved.listMine).toHaveBeenCalledWith('me@example.com');
  });

  // The guard refuses a tokenless POST/DELETE on its own; a tokenless GET reaches
  // the handler, so the read's refusal has to come from the service, which only
  // happens if the controller hands it the absent email rather than inventing one.
  it('hands the read an absent email when there is no session', async () => {
    await controller.getMySavedJobs({ params: {} } as never);

    expect(saved.listMine).toHaveBeenCalledWith(undefined);
  });

  it('refuses a tokenless write at the guard', async () => {
    const guard = new UserAuthValidateGuard();
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ method: 'POST', headers: {}, cookies: {}, query: {} }) }),
    } as never;

    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
  });
});
