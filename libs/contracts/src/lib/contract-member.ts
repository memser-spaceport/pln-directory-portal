import { initContract } from '@ts-rest/core';
import {
  MemberDetailQueryParams,
  MemberQueryParams,
  PreferenceSchema,
  ResponseMemberWithRelationsSchema,
  SimpleMemberSchema,
  MembersByIdsRequestSchema,
  MemberFilterQueryParams,
  AutocompleteQueryParams,
  AutocompleteResponse,
  MembersForNodebbSchema,
  MembersForNodebbRequestSchema,
  UpdateMemberInvestorSettingRequestSchema,
  MemberInvestorSettingResponseSchema,
} from '../schema';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();
import { z } from 'zod';

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
  getMembersByIds: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/members/by-ids`,
    body: MembersByIdsRequestSchema,
    responses: {
      200: SimpleMemberSchema.array(),
    },
    summary: 'Get members by list of IDs',
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
  },
  getMemberByExternalId: {
    method: 'GET',
    path: '/members/external/:externalId',
    responses: {
      200: ResponseMemberWithRelationsSchema,
      404: z.object({ message: z.string() }),
    },
    pathParams: z.object({
      externalId: z.string(),
    }),
    query: MemberDetailQueryParams.optional(),
  } as const,
  searchMembers: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members-search`,
    query: MemberFilterQueryParams,
    responses: {
      200: z.object({
        members: ResponseMemberWithRelationsSchema.array(),
        total: z.number(),
        page: z.number(),
        hasMore: z.boolean(),
      }),
    },
    summary: 'Search members with advanced filters',
  },
  autocompleteTopics: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members/autocomplete/topics`,
    query: AutocompleteQueryParams,
    responses: {
      200: AutocompleteResponse,
    },
    summary: 'Autocomplete topics for member search',
  },
  autocompleteRoles: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members/autocomplete/roles`,
    query: AutocompleteQueryParams,
    responses: {
      200: AutocompleteResponse,
    },
    summary: 'Autocomplete roles for member search',
  },
  getMembersBulk: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/members-bulk`,
    body: MembersForNodebbRequestSchema,
    responses: {
      200: MembersForNodebbSchema.array(),
    },
    summary: 'Get members in bulk by UIDs or external IDs',
  },
  createOrUpdateInvestorProfile: {
    method: 'PUT',
    path: `${getAPIVersionAsPath('1')}/members/:uid/investor-profile`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
  },
  getInvestorProfile: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members/:uid/investor-profile`,
    responses: {
      200: contract.response<unknown>(),
    },
  },
  updateMemberInvestorSetting: {
    method: 'PUT',
    path: `${getAPIVersionAsPath('1')}/members/:uid/investor-settings`,
    body: UpdateMemberInvestorSettingRequestSchema,
    responses: {
      200: MemberInvestorSettingResponseSchema,
      400: z.object({ message: z.string() }),
      403: z.object({ message: z.string() }),
      404: z.object({ message: z.string() }),
    },
    summary: 'Update member investor setting',
  },
  getMemberInvestorSetting: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members/:uid/investor-settings`,
    responses: {
      200: MemberInvestorSettingResponseSchema,
      403: z.object({ message: z.string() }),
      404: z.object({ message: z.string() }),
    },
    summary: 'Get member investor setting',
  },
});
