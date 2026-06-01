import { initContract } from '@ts-rest/core';
import {
  CreateJobAlertConflictSchema,
  CreateJobAlertSchema,
  JobAlertSchema,
  ListJobAlertsResponseSchema,
  UnsubscribeRequestSchema,
  UnsubscribeResponseSchema,
  UpdateJobAlertSchema,
  VerifyRedirectRequestSchema,
  VerifyRedirectResponseSchema,
} from '../schema/job-alert';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiJobAlerts = contract.router({
  listJobAlerts: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/job-alerts`,
    responses: {
      200: ListJobAlertsResponseSchema,
    },
    summary: "List the authenticated member's job alerts",
  },
  createJobAlert: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/job-alerts`,
    body: CreateJobAlertSchema,
    responses: {
      201: JobAlertSchema,
      409: CreateJobAlertConflictSchema,
      400: contract.response<{ message: string }>(),
    },
    summary: 'Save a job-search filter set as a recurring alert',
  },
  updateJobAlert: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/job-alerts/:uid`,
    body: UpdateJobAlertSchema,
    responses: {
      200: JobAlertSchema,
      404: contract.response<{ message: string }>(),
    },
    summary: 'Update name or paused state of an alert',
  },
  deleteJobAlert: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/job-alerts/:uid`,
    body: contract.body<Record<string, never>>(),
    responses: {
      204: contract.response<null>(),
      404: contract.response<{ message: string }>(),
    },
    summary: 'Soft-delete an alert',
  },
  verifyRedirect: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/job-alerts/verify-redirect`,
    body: VerifyRedirectRequestSchema,
    responses: {
      200: VerifyRedirectResponseSchema,
      400: contract.response<{ message: string }>(),
    },
    summary: 'Validate a signed email-click token and return its applyUrl',
  },
  unsubscribe: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/job-alerts/unsubscribe`,
    body: UnsubscribeRequestSchema,
    responses: {
      200: UnsubscribeResponseSchema,
      400: contract.response<{ message: string }>(),
    },
    summary: 'One-click unsubscribe for a specific alert',
  },
});
