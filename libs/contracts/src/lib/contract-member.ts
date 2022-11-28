import { initContract } from '@ts-rest/core';
import {
  MemberQueryParams,
  ResponseMemberWithRelationsSchema,
} from '../schema';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiMembers = contract.router({
  getMembers: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members`,
    query: MemberQueryParams,
    responses: {
      200: ResponseMemberWithRelationsSchema.array(),
    },
    summary: 'Get all members',
  },
  getMember: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members/:uid`,
    responses: {
      200: ResponseMemberWithRelationsSchema,
    },
    summary: 'Get a member',
  },
});
