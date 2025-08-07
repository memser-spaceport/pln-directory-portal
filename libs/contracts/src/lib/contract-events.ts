import { initContract } from '@ts-rest/core';
import { getAPIVersionAsPath } from '../utils/versioned-path';
import { ResponsePLEventSchemaWithRelationsSchema } from '../schema/pl-event';
import { ResponsePLEventLocationSchema } from '../schema/pl-event-location';

const contract = initContract();

export const apiPLEvents = contract.router({
  createEvent: {
    method: 'POST',
    body: contract.body<unknown>(),
    path: `${getAPIVersionAsPath('1')}/events/submit`,
    responses: {
      200: ResponsePLEventSchemaWithRelationsSchema,
    },
    summary: 'Create new event',
  },
  fetchLocations: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/locations`,
    query: contract.query<unknown>(),
    responses: {
      200: ResponsePLEventLocationSchema,
    },
  },
  fetchLocationAssociation: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/location-associations`,
    query: contract.query<unknown>(),
    responses: {
      200: contract.body<unknown>(),
    },
  }
});
