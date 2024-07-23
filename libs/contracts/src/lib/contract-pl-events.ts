import { initContract } from '@ts-rest/core';
import {
  PLEventDetailQueryParams,
  PLEventQueryParams,
  ResponsePLEventSchemaWithRelationsSchema,
} from '../schema';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiEvents = contract.router({
  getPLEvents: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/irl/events`,
    query: PLEventQueryParams,
    responses: {
      200: ResponsePLEventSchemaWithRelationsSchema.array(),
    },
    summary: 'Get all pl events',
  },
  getPLEvent: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/irl/events/:slug`,
    query: PLEventDetailQueryParams,
    responses: {
      200: ResponsePLEventSchemaWithRelationsSchema,
    },
    summary: 'Get a pl event',
  },
  createPLEventGuest: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/irl/events/:slug/guest`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'create a guest in pl event',
  },
  modifyPLEventGuest: {
    method: 'PUT',
    path: `${getAPIVersionAsPath('1')}/irl/events/:slug/guest/:uid`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Modify a guest in pl event',
  },
  deletePLEventGuests: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/irl/events/:slug/guests`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'delete a list of guests in pl event',
  },
  getPLEventsByLoggedInMember: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/irl/me/events`,
    query: PLEventDetailQueryParams,
    responses: {
      200: ResponsePLEventSchemaWithRelationsSchema,
    },
    summary: 'Get events by logged in member',
  }
});
