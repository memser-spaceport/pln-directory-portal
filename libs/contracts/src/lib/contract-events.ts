import { initContract } from '@ts-rest/core';
import { getAPIVersionAsPath } from '../utils/versioned-path';
import { ResponsePLEventSchemaWithRelationsSchema } from '../schema/pl-event';

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
  fetchAssociations: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/events/location-associations`,
    query: contract.query,
    responses: {
      200: contract.body<unknown>(),
    },
  }
});
