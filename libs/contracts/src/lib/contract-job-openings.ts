import { z } from 'zod';
import { initContract } from '@ts-rest/core';
import {
  JobsFiltersResponseSchema,
  JobsListQueryParams,
  JobsListResponseSchema,
} from '../schema/job-opening';
import {
  CreateJobReferralSchema,
  JobReferralDraftQuerySchema,
  JobReferralDraftResponseSchema,
  JobReferralResponseSchema,
} from '../schema/job-referral';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiJobOpenings = contract.router({
  getJobs: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/job-openings`,
    query: JobsListQueryParams,
    responses: {
      200: JobsListResponseSchema,
    },
    summary: 'List open job postings grouped by team',
  },
  getJobFilters: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/job-openings/filters`,
    query: JobsListQueryParams,
    responses: {
      200: JobsFiltersResponseSchema,
    },
    summary: 'Facet counts for the Jobs list',
  },
  getReferralDraft: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/job-openings/:uid/referral-draft`,
    pathParams: z.object({ uid: z.string() }),
    query: JobReferralDraftQuerySchema,
    responses: {
      200: JobReferralDraftResponseSchema,
    },
    summary: 'Pre-filled referral note text for the "Refer" modal',
  },
  referJob: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/job-openings/:uid/referrals`,
    pathParams: z.object({ uid: z.string() }),
    body: CreateJobReferralSchema,
    responses: {
      201: JobReferralResponseSchema,
    },
    summary: 'Refer a Directory member for a job opening',
  },
});
