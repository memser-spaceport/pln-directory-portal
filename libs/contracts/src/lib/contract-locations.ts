import { initContract } from '@ts-rest/core';
import { LocationQueryParams, LocationResponseSchema } from '../schema';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiLocations = contract.router({
  getLocations: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/locations`,
    query: LocationQueryParams,
    responses: {
      200: LocationResponseSchema.array(),
    },
    summary: 'Get all locations',
  },
  validateLocation: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/locations/validate`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Validate location',
  },
});
