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
      200: LocationResponseSchema,
    },
    summary: 'Get all locations',
  },
});
