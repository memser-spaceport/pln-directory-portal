import { initContract } from '@ts-rest/core';
import {
  InternalUpdateMemberDto,
  PLEventGuestQueryParams,
  ResponseMemberSchema,
  ResponsePLEventGuestSchemaWithRelationsSchema,
  ResponseMemberWithRelationsSchema,
  ResponseTeamWithRelationsSchema,
  ResponseProjectWithRelationsSchema,
  ResponsePLEventSchemaWithRelationsSchema,
  createLocationAssociationSchemaDto,
  UpdatePLEventLocationAssociationSchemaDto,
  ResponsePLEventLocationAssociationSchemaDto,
  ResponsePLEventLocationAssociationWithRelationsSchema,
  CreatePLEventLocationSchemaDto,
  UpdatePLEventLocationSchemaDto,
  ResponsePLEventLocationSchema,
  MemberSearchQueryParams,
  ResponseMemberSearchResultSchema,
  TeamSearchQueryParams,
  ResponseTeamSearchResultSchema
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
  searchMembers: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/internals/members-search`,
    query: MemberSearchQueryParams,
    responses: {
      200: ResponseMemberSearchResultSchema,
    },
    summary: 'Search members by name and/or email using OpenSearch',
  },
  searchTeams: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/internals/teams-search`,
    query: TeamSearchQueryParams,
    responses: {
      200: ResponseTeamSearchResultSchema,
    },
    summary: 'Search teams by name using OpenSearch',
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
  },
  createLocationAssociation: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/internals/irl/location-associations`,
    body: createLocationAssociationSchemaDto,
    responses: {
      200: ResponsePLEventLocationAssociationSchemaDto,
    },
    summary: 'Create a new PL event location association',
  },
  getAllPLEventLocationAssociations: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/internals/irl/location-associations`,
    responses: {
      200: ResponsePLEventLocationAssociationWithRelationsSchema.array(),
    },
    summary: 'Get all PL event location associations',
  },
  getPLEventLocationAssociation: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/internals/irl/location-associations/:uid`,
    responses: {
      200: ResponsePLEventLocationAssociationSchemaDto,
    },
    summary: 'Get a PL event location association by UID',
  },
  updatePLEventLocationAssociation: {
    method: 'PUT',
    path: `${getAPIVersionAsPath('1')}/internals/irl/location-associations/:uid`,
    body: UpdatePLEventLocationAssociationSchemaDto,
    responses: {
      200: ResponsePLEventLocationAssociationSchemaDto,
    },
    summary: 'Update a PL event location association by UID',
  },
  deletePLEventLocationAssociation: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/internals/irl/location-associations/:uid`,
    body: contract.body<unknown>(),
    responses: {
      200: ResponsePLEventLocationAssociationSchemaDto,
    },
    summary: 'Delete a PL event location association by UID',
  },
  createPLEventLocation: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/internals/irl/locations`,
    body: CreatePLEventLocationSchemaDto,
    responses: {
      200: ResponsePLEventLocationSchema,
    },
    summary: 'Create a new PL event location',
  },
  getAllPLEventLocations: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/internals/irl/locations`,
    responses: {
      200: ResponsePLEventLocationSchema.array(),
    },
    summary: 'Get all PL event locations',
  },
  getPLEventLocation: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/internals/irl/locations/:uid`,
    responses: {
      200: ResponsePLEventLocationSchema,
    },
    summary: 'Get a PL event location by UID',
  },
  updatePLEventLocation: {
    method: 'PUT',
    path: `${getAPIVersionAsPath('1')}/internals/irl/locations/:uid`,
    body: UpdatePLEventLocationSchemaDto,
    responses: {
      200: ResponsePLEventLocationSchema,
    },
    summary: 'Update a PL event location by UID',
  },
  deletePLEventLocation: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/internals/irl/locations/:uid`,
    body: contract.body<unknown>(),
    responses: {
      200: ResponsePLEventLocationSchema,
    },
    summary: 'Delete a PL event location by UID',
  }
});