import { initContract } from '@ts-rest/core';
import {
  ResponseTechnologySchema,
  TechnologyQueryParams,
} from '../schema/technology';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiTechnologies = contract.router({
  getTechnologies: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/technologies`,
    query: TechnologyQueryParams,
    responses: {
      200: ResponseTechnologySchema.array(),
    },
    summary: 'Get all technologies',
  },
  getTechnology: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/technologies/:uid`,
    responses: {
      200: ResponseTechnologySchema,
    },
    summary: 'Get a technology',
  },
});
