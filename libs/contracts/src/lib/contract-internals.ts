import { initContract } from '@ts-rest/core';
import {
  InternalUpdateMemberDto,
  PLEventGuestQueryParams,
  ResponseMemberSchema,
  ResponsePLEventGuestSchemaWithRelationsSchema,
  ResponseMemberWithRelationsSchema,
  ResponseTeamWithRelationsSchema,
  ResponseProjectWithRelationsSchema,
  ResponsePLEventSchemaWithRelationsSchema
} from '../schema';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiInternals = contract.router({
  getPLEventGuestsByLocation: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/internals/irl/locations/:uid/events/guests`,
    query: PLEventGuestQueryParams,
    responses: {
      200: ResponsePLEventGuestSchemaWithRelationsSchema,
    },
    summary: 'Get a pl event with guests by location',
  },
  updateTelagramUid: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/internals/members`,
    body: InternalUpdateMemberDto,
    responses: {
      200: ResponseMemberSchema
    },
    summary: 'Update the telegram uid for a member'
  },
  getMemberDetails: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/internals/members/:uid`,
    responses: {
      200: ResponseMemberWithRelationsSchema,
    },
    summary: 'Get detailed member information by UID',
  },
  getTeamDetails: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/internals/teams/:uid`,
    responses: {
      200: ResponseTeamWithRelationsSchema,
    },
    summary: 'Get detailed team information by UID',
  },
  getProjectDetails: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/internals/projects/:uid`,
    responses: {
      200: ResponseProjectWithRelationsSchema,
    },
    summary: 'Get detailed project information by UID',
  },
  getIrlEventDetails: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/internals/irl/events/:uid`,
    responses: {
      200: ResponsePLEventSchemaWithRelationsSchema,
    },
    summary: 'Get detailed IRL event information by UID',
  }
});