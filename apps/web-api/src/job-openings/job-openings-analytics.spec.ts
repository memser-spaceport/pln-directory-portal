import { JobOpeningStatus } from '@prisma/client';
import {
  trackIntegrationStatusTransitions,
  trackJobApplicationRecorded,
  trackJobSaveRecorded,
} from './job-openings-analytics';

describe('job-openings-analytics', () => {
  const analytics = { trackEvent: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tracks application recorded without applicant PII', () => {
    trackJobApplicationRecorded(analytics as never, {
      applicationUid: 'app-1',
      jobUid: 'job-1',
      teamUid: 'team-1',
    });

    expect(analytics.trackEvent).toHaveBeenCalledWith({
      name: 'job-application-recorded',
      distinctId: 'application:app-1',
      properties: {
        application_uid: 'app-1',
        job_uid: 'job-1',
        team_uid: 'team-1',
        origin: 'in-app-apply',
      },
    });
  });

  it('tracks a save with no member on it', () => {
    trackJobSaveRecorded(analytics as never, { saveUid: 'save-1', jobUid: 'job-1', teamUid: 'team-1' });

    expect(analytics.trackEvent).toHaveBeenCalledWith({
      name: 'job-save-recorded',
      distinctId: 'save:save-1',
      properties: {
        save_uid: 'save-1',
        job_uid: 'job-1',
        team_uid: 'team-1',
        origin: 'job-save',
      },
    });
  });

  it('emits publish only on transition into CONFIRMED', () => {
    trackIntegrationStatusTransitions(analytics as never, {
      previousStatus: JobOpeningStatus.STALE,
      nextStatus: JobOpeningStatus.CONFIRMED,
      jobUid: 'job-1',
      teamUid: 'team-1',
      externalId: 'role-1',
    });

    expect(analytics.trackEvent).toHaveBeenCalledTimes(1);
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'job-published-via-integration' })
    );
  });

  it('does not emit publish when status stays CONFIRMED', () => {
    trackIntegrationStatusTransitions(analytics as never, {
      previousStatus: JobOpeningStatus.CONFIRMED,
      nextStatus: JobOpeningStatus.CONFIRMED,
      jobUid: 'job-1',
      teamUid: 'team-1',
      externalId: 'role-1',
    });

    expect(analytics.trackEvent).not.toHaveBeenCalled();
  });
});
