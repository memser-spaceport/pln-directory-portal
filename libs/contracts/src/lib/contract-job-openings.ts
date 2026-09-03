import { z } from 'zod';
import { initContract } from '@ts-rest/core';
import {
  JobOpeningInterestListResponseSchema,
  JobOpeningInterestStatusSchema,
  JobsFiltersResponseSchema,
  JobsListQueryParams,
  JobsListResponseSchema,
} from '../schema/job-opening';
import {
  CreateJobApplicationSchema,
  JobApplicationListResponseSchema,
  JobApplicationResponseSchema,
  JobBoardSignUpResponseSchema,
  JobBoardSignUpSchema,
} from '../schema/job-application';
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
  signUp: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/job-openings/sign-up`,
    body: JobBoardSignUpSchema,
    responses: {
      201: JobBoardSignUpResponseSchema,
    },
    summary: 'Create a Directory member from Job Board sign-up',
  },
  getMyApplications: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/job-openings/applications`,
    responses: {
      200: JobApplicationListResponseSchema,
    },
    summary: "List the current member's Job Board applications",
  },
  applyToJob: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/job-openings/:uid/applications`,
    pathParams: z.object({ uid: z.string() }),
    body: CreateJobApplicationSchema,
    responses: {
      201: JobApplicationResponseSchema,
    },
    summary: 'Apply to a job opening in-app',
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
  getMyInterests: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/job-openings/interests`,
    responses: {
      200: JobOpeningInterestListResponseSchema,
    },
    summary: "List the current member's Job Board interests",
  },
  markJobInterest: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/job-openings/:uid/interest`,
    pathParams: z.object({ uid: z.string() }),
    body: z.object({}).optional(),
    responses: {
      200: JobOpeningInterestStatusSchema,
    },
    summary: "Mark the current member's interest in a job opening (idempotent)",
  },
  removeJobInterest: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/job-openings/:uid/interest`,
    pathParams: z.object({ uid: z.string() }),
    body: z.object({}).optional(),
    responses: {
      200: JobOpeningInterestStatusSchema,
    },
    summary: "Remove the current member's interest in a job opening (idempotent)",
  },
});
