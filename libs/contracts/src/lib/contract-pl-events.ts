import { initContract } from '@ts-rest/core';
import {
  PLEventDetailQueryParams,
  PLEventAggregatedDataQueryParams,
  ResponsePLEventSchemaWithRelationsSchema,
  PLEventLocationQueryParams,
  ResponsePLEventLocationWithRelationsSchema, ResponseUpcomingEventSchema,
  ResponsePLEventDetailSchema,
  UpdateMyEventVisibilitySchema,
  UpdateMyGuestPlansSchema,
  DeletePLEventGuestsSchema,
  ProfileEventsQuerySchema,
  ResponseMemberEventsSchema,
  ResponseTeamEventsSchema,
} from '../schema';
import { SyncPLEventsBodySchema } from '../schema';
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
  updateMyGuestPlansByLocation: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/irl/locations/:uid/guests/me`,
    body: UpdateMyGuestPlansSchema,
    responses: {
      200: contract.response<unknown>(),
    },
    summary: "Update the caller's plans at a gathering in place (roles of kept events, shared details)",
  },
  deletePLEventGuestsByLocation: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/irl/locations/:uid/events/guests`,
    // `events: [A]` deletes only A; `events: []` deletes every row of that member at the gathering.
    body: DeletePLEventGuestsSchema,
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
    // Untyped on purpose (many filters). `eventUid` (LAB-3213) narrows the list to that event's guests only: guests of
    // the whole gathering are left out, and members who hid the event from their profile are still listed.
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
    path: `${getAPIVersionAsPath('1')}/irl/events/sync`,
    body: SyncPLEventsBodySchema,
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'sync pl events from events service; detailsOnly backfills event details only'
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
    query: PLEventAggregatedDataQueryParams,
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
  },
  getPLEventByUid: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/irl/events/:uid`,
    responses: {
      200: ResponsePLEventDetailSchema,
    },
    summary: 'Get one event with its gathering, hosts and attendance summary',
  },
  getMemberEvents: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members/:uid/events`,
    query: ProfileEventsQuerySchema,
    responses: {
      200: ResponseMemberEventsSchema,
    },
    summary: "A member's upcoming and past events for their profile (upcoming for signed-in viewers only)",
  },
  getTeamEvents: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/teams/:uid/events`,
    query: ProfileEventsQuerySchema,
    responses: {
      200: ResponseTeamEventsSchema,
    },
    summary: "A team's upcoming events (its members' attendance) and past events, Demo Days first",
  },
  updateMyEventVisibility: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/irl/events/:uid/me`,
    body: UpdateMyEventVisibilitySchema,
    responses: {
      200: contract.response<{ eventUid: string; showOnProfile: boolean }>(),
    },
    summary: "Show or hide the caller's attendance at an event on their profile",
  },
  deleteEvent: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/irl/locations/:uid/events/:eventUid`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Delete Event using eventUid',
  },
  getAggregatedEventsAndLocations: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/irl/events/upcoming`,
    responses: {
      200: ResponseUpcomingEventSchema.array(),
    },
  },
  modifyIRLAggregatedData: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/irl/aggregated-data`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Modify aggregated data',
  },
  modifyPLEventLocation: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/irl/locations/:uid`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Modify PL event location',
  }
});
