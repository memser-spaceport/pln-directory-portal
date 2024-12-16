import { initContract } from '@ts-rest/core';
import { getAPIVersionAsPath } from '../utils/versioned-path';
import {
  MemberFollowQueryParams,
  ResponseMemberFollowWithRelationsSchema
} from '../schema';
const contract = initContract();

export const apiMemberFollows = contract.router({
  getFollows: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/member-follows`,
    query: MemberFollowQueryParams,
    responses: {
      200: ResponseMemberFollowWithRelationsSchema.array()
    },
    summary: 'get member follows'
  },
  createFollow: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/member-follows`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'create a member follow',
  },
  deleteFollow: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/member-follows/:uid`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'delete a member follow'
  }
});