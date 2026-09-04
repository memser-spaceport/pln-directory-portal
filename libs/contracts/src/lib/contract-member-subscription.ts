import { initContract } from '@ts-rest/core';
import { getAPIVersionAsPath } from '../utils/versioned-path';
import {
  MemberSubscriptionQueryParams,
  MySubscriptionsQueryParams,
  ResponseMemberSubscriptionSchema,
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
  getMySubscriptions: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/member-subscriptions/me`,
    query: MySubscriptionsQueryParams,
    responses: {
      200: ResponseMemberSubscriptionSchema.array()
    },
    summary: "get the authenticated member's own subscriptions"
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