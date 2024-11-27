import { initContract } from '@ts-rest/core';
import {
  MemberDetailQueryParams,
  MemberQueryParams,
  PreferenceSchema,
  ResponseMemberWithRelationsSchema,
} from '../schema';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiMembers = contract.router({
  updateMemberVerificationStatus: {
    method:'PUT',
    path: `${getAPIVersionAsPath('1')}/members/:uid/verify`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Verify a member',

  },
  getMembers: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members`,
    query: MemberQueryParams,
    responses: {
      200: ResponseMemberWithRelationsSchema.array(),
    },
    summary: 'Get all members',
  },
  getMemberRoles: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members/roles`,
    query: MemberQueryParams,
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Get member roles',
  },
  getMemberFilters: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members/filters`,
    query: MemberQueryParams,
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Get member filter values',
  },
  getMember: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members/:uid`,
    query: MemberDetailQueryParams,
    responses: {
      200: ResponseMemberWithRelationsSchema,
    },
    summary: 'Get a member',
  },
  modifyMemberPreference: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/member/:uid/preferences`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Update member preference',
  },
  updateMember: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/members/:uid`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Update member',
  },
  getMemberPreferences: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members/:uid/preferences`,
    responses: {
      200: PreferenceSchema,
    },
    summary: 'Get member Preferences',
  },
  modifyMember: {
    method: 'PUT',
    path: `${getAPIVersionAsPath('1')}/member/:uid`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Modify a member',
  },
  sendOtpForEmailChange: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/members/:uid/email/otp`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Request for email change',
  },
  updateMemberEmail: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/members/:uid/email`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Request for email change',
  },
  getMemberGitHubProjects: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members/:uid/git-projects`,
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Get member Projects',
  }
});
