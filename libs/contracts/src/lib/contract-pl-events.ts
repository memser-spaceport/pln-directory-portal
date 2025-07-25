import { initContract } from '@ts-rest/core';
import {
  PLEventDetailQueryParams,
  ResponsePLEventSchemaWithRelationsSchema,
  PLEventLocationQueryParams,
  ResponsePLEventLocationWithRelationsSchema, ResponseUpcomingEventSchema
} from '../schema';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiEvents = contract.router({
  createPLEventByLocation: {
    method: 'POST',
    body: contract.body<unknown>(),
    path: `${getAPIVersionAsPath('1')}/irl/locations/:uid/event`,
    responses: {
      200: ResponsePLEventSchemaWithRelationsSchema,
    },
    summary: 'Create pl event in corresponding location',
  },
  sendEventGuestPresenceRequest: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/irl/locations/:uid/me/presence-request`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Send a presence request to the admin to add them as a guest to an event',
  },
  getPLEventBySlug: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/irl/locations/:uid/events/:slug`,
    query: PLEventDetailQueryParams,
    responses: {
      200: ResponsePLEventSchemaWithRelationsSchema,
    },
    summary: 'Get a pl event with guests by slug and location',
  },
  createPLEventGuestByLocation: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/irl/locations/:uid/guests`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'create guests in pl events',
  },
  modifyPLEventGuestByLocation: {
    method: 'PUT',
    path: `${getAPIVersionAsPath('1')}/irl/locations/:uid/guests/:guestUid`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Modify guests in pl events',
  },
  deletePLEventGuestsByLocation: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/irl/locations/:uid/events/guests`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'delete guests from events',
  },
  getPLEventsByLoggedInMember: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/irl/locations/:uid/me/events`,
    query: PLEventDetailQueryParams,
    responses: {
      200: ResponsePLEventSchemaWithRelationsSchema,
    },
    summary: 'Get events by logged in member',
  },
  getPLEventLocations: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/irl/locations`,
    query: PLEventLocationQueryParams,
    responses: {
      200: ResponsePLEventLocationWithRelationsSchema.array(),
    },
    summary: 'Get all pl event locations'
  },
  getPLEventGuestsByLocation: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/irl/locations/:uid/guests`,
    query: contract.query,
    responses: {
      200:  contract.response<unknown>(),
    },
    summary: 'Get pl event guests by location and type',
  },
  getPLEventTopicsByLocation: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/irl/locations/:uid/topics`,
    query: PLEventDetailQueryParams,
    responses: {
      200: ResponsePLEventLocationWithRelationsSchema.array(),
    },
    summary: 'Get pl event topics by location and type',
  },
  getPLEventGuestByUidAndLocation: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/irl/locations/:uid/guests/:guestUid`,
    query: PLEventDetailQueryParams,
    responses: {
      200: ResponsePLEventLocationWithRelationsSchema.array(),
    },
  },
  syncPLEventsByLocation: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/irl/locations/:uid/events/sync`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'sync pl events from events service by location'
  },
  getAllPLEventGuests: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/irl/guests`,
    query: PLEventDetailQueryParams,
    responses: {
      200: ResponsePLEventLocationWithRelationsSchema.array(),
    },
  },
  getPLEventGuestTopics: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/irl/locations/:uid/guests/:guestUid/topics`,
    query: PLEventDetailQueryParams,
    responses: {
      200: ResponsePLEventLocationWithRelationsSchema.array(),
    },
  },
  getEventContributors: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/irl/events/contributors`,
    query: PLEventDetailQueryParams,
    responses: {
      200: ResponsePLEventLocationWithRelationsSchema.array(),
    },
  },
  getAllAggregatedData: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/irl/aggregated-data`,
    query: PLEventDetailQueryParams,
    responses: {
      200: ResponsePLEventLocationWithRelationsSchema.array(),
    },
  },
  getAllUpcomingEvents: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/irl/events/upcoming`,
    responses: {
      200: ResponseUpcomingEventSchema.array(),
    },
  }
});
