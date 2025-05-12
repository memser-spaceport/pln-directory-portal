import { initContract } from '@ts-rest/core';
import { getAPIVersionAsPath } from '../utils/versioned-path';
import {
  ResponseMemberExperienceSchema,
  ResponseMemberExperienceWithRelationsSchema
} from '../schema/member-experience';

const contract = initContract();

export const apiMemberExperiences = contract.router({
  getMemberExperience: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/member-experiences/:uid`,
    responses: {
      200: ResponseMemberExperienceWithRelationsSchema
    },
    summary: 'get a member experience by uid'
  },
  createMemberExperience: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/member-experiences`,
    body: contract.body<unknown>(),
    responses: {
      201: ResponseMemberExperienceSchema
    },
    summary: 'create a member experience'
  },
  updateMemberExperience: {
    method: 'PUT',
    path: `${getAPIVersionAsPath('1')}/member-experiences/:uid`,
    body: contract.body<unknown>(),
    responses: {
      200: ResponseMemberExperienceSchema
    },
    summary: 'update a member experience'
  },
  deleteMemberExperience: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/member-experiences/:uid`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>()
    },
    summary: 'delete a member experience'
  },
  getMemberExperienceByMemberUid: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/member-experiences/get-all-by-member-uid/:memberUid`,
    responses: {
      200: ResponseMemberExperienceWithRelationsSchema
    },
    summary: 'get all member experiences by member uid'
  }
});
