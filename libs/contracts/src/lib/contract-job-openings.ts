import { initContract } from '@ts-rest/core';
import {
  JobsFiltersResponseSchema,
  JobsListQueryParams,
  JobsListResponseSchema,
} from '../schema/job-opening';
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
});
