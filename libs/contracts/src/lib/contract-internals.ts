import { initContract } from '@ts-rest/core';
import {
  InternalUpdateMemberDto,
  PLEventGuestQueryParams,
  ResponseMemberSchema,
  ResponsePLEventGuestSchemaWithRelationsSchema
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
  }
});