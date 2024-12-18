import { initContract } from '@ts-rest/core';
import { getAPIVersionAsPath } from '../utils/versioned-path';
import {
  MemberSubscriptionQueryParams,
  ResponseMemberSubscriptionWithRelationsSchema
} from '../schema';
const contract = initContract();

export const apiMemberSubscriptions = contract.router({
  getSubscriptions: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/member-subscriptions`,
    query: MemberSubscriptionQueryParams,
    responses: {
      200: ResponseMemberSubscriptionWithRelationsSchema.array()
    },
    summary: 'get member subcriptions'
  },
  createSubscription: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/member-subscriptions`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'create a member subcription',
  },
  modifySubscription: {
    method: 'PUT',
    path: `${getAPIVersionAsPath('1')}/member-subscriptions/:uid`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'modify a member subcriptions'
  }
});