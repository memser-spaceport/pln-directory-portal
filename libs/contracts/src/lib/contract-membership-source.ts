import { initContract } from '@ts-rest/core';
import {
  MembershipSourceDetailQueryParams,
  MembershipSourceQueryParams,
  ResponseMembershipSourceSchema,
} from '../schema/membership-source';
import { getAPIVersionAsPath } from '../utils/versioned-path';
const contract = initContract();

export const apiMembershipSource = contract.router({
  getMembershipSources: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/membership-sources`,
    query: MembershipSourceQueryParams,
    responses: {
      200: ResponseMembershipSourceSchema.array(),
    },
  },
  getMembershipSource: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/membership-sources/:uid`,
    query: MembershipSourceDetailQueryParams,
    responses: {
      200: ResponseMembershipSourceSchema,
    },
  },
});
