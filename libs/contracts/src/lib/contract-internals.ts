import { initContract } from '@ts-rest/core';
import {
  PLEventGuestQueryParams,
  ResponsePLEventGuestSchemaWithRelationsSchema
} from '../schema';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiInternals = contract.router({
  getPLEventGuestsBySlug: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/internals/irl/locations/:uid/events/:slug/guests`,
    query: PLEventGuestQueryParams,
    responses: {
      200: ResponsePLEventGuestSchemaWithRelationsSchema,
    },
    summary: 'Get a pl event with guests by slug',
  },
});