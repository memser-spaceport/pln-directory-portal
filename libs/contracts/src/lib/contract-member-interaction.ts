import { initContract } from '@ts-rest/core';
import {
  ResponseMemberFollowUpWithRelationsSchema,
  MemberFollowUpQueryParams
} from '../schema';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiMemberInteractions = contract.router({
  createMemberInteraction: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/members/:uid/interactions`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'create a new member interactions'
  },
  getMemberInteractionFollowUps: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members/:memberUid/interactions/follow-ups`,
    query: MemberFollowUpQueryParams,
    responses: {
      200: ResponseMemberFollowUpWithRelationsSchema.array(),
    },
    summary: 'Get member interaction follow ups',
  },
  closeMemberInteractionFollowUp: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/members/:uid/interactions/:interactionUid/follow-ups/:followUpUid`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'close a member interaction follow up'
  },
  createMemberInteractionFeedback: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/members/:uid/follow-ups/:uid/feedbacks`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'create a member interaction feedback',
  }
});
