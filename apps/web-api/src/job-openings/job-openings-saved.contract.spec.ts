import { apiJobOpenings } from 'libs/contracts/src/lib/contract-job-openings';
import {
  JobsListQueryParams,
  SavedJobsListResponseSchema,
  SavedJobStatusSchema,
} from 'libs/contracts/src/schema/job-opening';

describe('saved jobs contract', () => {
  describe('the saved scope parameter', () => {
    it('is off when the caller does not ask for it', () => {
      expect(JobsListQueryParams.parse({}).saved).toBe(false);
      expect(JobsListQueryParams.parse({ saved: 'false' }).saved).toBe(false);
      expect(JobsListQueryParams.parse({ saved: '' }).saved).toBe(false);
    });

    it('is on for the string a URL carries and for a real boolean', () => {
      expect(JobsListQueryParams.parse({ saved: 'true' }).saved).toBe(true);
      expect(JobsListQueryParams.parse({ saved: true }).saved).toBe(true);
    });

    it('leaves the rest of the query untouched', () => {
      const parsed = JobsListQueryParams.parse({ saved: 'true', roleCategory: 'Engineering', page: '2' });

      expect(parsed.roleCategory).toEqual(['Engineering']);
      expect(parsed.page).toBe(2);
      expect(parsed.sort).toBe('newest');
    });
  });

  describe('the routes', () => {
    it('saves and unsaves one role at the same path', () => {
      expect(apiJobOpenings.saveJob.method).toBe('POST');
      expect(apiJobOpenings.saveJob.path).toBe('/v1/job-openings/:uid/save');
      expect(apiJobOpenings.unsaveJob.method).toBe('DELETE');
      expect(apiJobOpenings.unsaveJob.path).toBe('/v1/job-openings/:uid/save');
    });

    it('reads the whole list from a fixed path', () => {
      expect(apiJobOpenings.getMySavedJobs.method).toBe('GET');
      expect(apiJobOpenings.getMySavedJobs.path).toBe('/v1/job-openings/saved');
    });

    // `/v1/job-openings/:uid` would match `/saved` if it were registered first,
    // and the member would get a 404 for a job opening called "saved".
    it('declares the saved list before the single-job route', () => {
      const keys = Object.keys(apiJobOpenings);

      expect(keys.indexOf('getMySavedJobs')).toBeLessThan(keys.indexOf('getJob'));
    });
  });

  describe('the response shapes', () => {
    it('answers a save with the job and the viewer flag, and no count', () => {
      const status = SavedJobStatusSchema.parse({ jobUid: 'job-1', viewerHasSaved: true });

      expect(status).toEqual({ jobUid: 'job-1', viewerHasSaved: true });
      expect(SavedJobStatusSchema.parse({ jobUid: 'job-1', viewerHasSaved: true, savedCount: 7 })).not.toHaveProperty(
        'savedCount'
      );
    });

    it('carries the save time on every entry of the list', () => {
      const parsed = SavedJobsListResponseSchema.parse({
        savedJobs: [{ uid: 'save-1', jobUid: 'job-1', savedAt: '2026-09-19T10:00:00.000Z' }],
      });

      expect(parsed.savedJobs[0]).toEqual({
        uid: 'save-1',
        jobUid: 'job-1',
        savedAt: '2026-09-19T10:00:00.000Z',
      });
    });

    it('accepts an empty list', () => {
      expect(SavedJobsListResponseSchema.parse({ savedJobs: [] })).toEqual({ savedJobs: [] });
    });
  });
});
