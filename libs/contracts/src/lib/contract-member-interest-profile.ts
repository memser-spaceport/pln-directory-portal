import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  MemberInterestProfilesQuerySchema,
  MemberInterestProfilesResponseSchema,
} from '../schema/member-interest-profile';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

/** Admin-only (DIRECTORY_FULL). No member-facing route reads a profile. */
export const apiMemberInterestProfiles = contract.router({
  getMemberInterestProfiles: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/admin/member-interest-profiles`,
    query: MemberInterestProfilesQuerySchema,
    responses: { 200: MemberInterestProfilesResponseSchema },
    summary: 'Top topics, entities and expertise of the given members',
  },
  rebuildMemberInterestProfiles: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/admin/member-interest-profiles/rebuild`,
    body: z.object({}).optional(),
    responses: { 202: z.object({ runId: z.number() }) },
    summary: 'Start a profile rebuild in the background (409 when one is running)',
  },
});
