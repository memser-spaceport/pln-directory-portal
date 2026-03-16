import { initContract } from '@ts-rest/core';
import {
  CommunityAffiliationDetailQueryParams,
  CommunityAffiliationQueryParams,
  ResponseCommunityAffiliationSchema,
} from '../schema/community-affiliation';
import { getAPIVersionAsPath } from '../utils/versioned-path';
const contract = initContract();

export const apiCommunityAffiliation = contract.router({
  getCommunityAffiliations: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/community-affiliations`,
    query: CommunityAffiliationQueryParams,
    responses: {
      200: ResponseCommunityAffiliationSchema.array(),
    },
  },
  getCommunityAffiliation: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/community-affiliations/:uid`,
    query: CommunityAffiliationDetailQueryParams,
    responses: {
      200: ResponseCommunityAffiliationSchema,
    },
  },
});
