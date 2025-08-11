import { initContract } from '@ts-rest/core';
import { ResponseMemberFollowUpWithRelationsSchema, MemberFollowUpQueryParams } from '../schema';
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
    summary: 'create a new member interactions',
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
    summary: 'close a member interaction follow up',
  },
  createMemberInteractionFeedback: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/members/:uid/follow-ups/:uid/feedbacks`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'create a member interaction feedback',
  },
  // New endpoints for office hours health check and broken link handling
  checkAllOfficeHoursLinks: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/office-hours/check-all`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Trigger batch check for all office hours links',
  },
  checkOfficeHoursLink: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/office-hours/check-link`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Check a provided office hours link',
  },
  reportBrokenOfficeHoursAttempt: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/members/:uid/interactions/broken-oh-attempt`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Record a broken office hours booking attempt and notify the target member',
  },
  checkMemberOfficeHoursLink: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/members/:uid/office-hours/check`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: "Check a member's office hours link and update status",
  },
});
