import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  FollowStatusResponseSchema,
  FollowedTeamsQueryParams,
  FollowedTeamsResponseSchema,
  TeamFollowersQueryParams,
  TeamFollowersResponseSchema,
} from '../schema/follow';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

/**
 * Follow feature endpoints. Paths are entity-scoped so the same shape extends
 * to other followable entities later (e.g. `/members/:memberUid/follow`).
 */
export const apiFollow = contract.router({
  followTeam: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/teams/:teamUid/follow`,
    pathParams: z.object({ teamUid: z.string() }),
    body: z.object({}).optional(),
    responses: {
      201: FollowStatusResponseSchema,
    },
    summary: 'Follow a team (authenticated member)',
  },
  unfollowTeam: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/teams/:teamUid/follow`,
    pathParams: z.object({ teamUid: z.string() }),
    body: z.object({}).optional(),
    responses: {
      200: FollowStatusResponseSchema,
    },
    summary: 'Unfollow a team (authenticated member)',
  },
  getFollowedTeams: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members/me/following/teams`,
    query: FollowedTeamsQueryParams,
    responses: {
      200: FollowedTeamsResponseSchema,
    },
    summary: 'List the teams the authenticated member follows',
  },
  getTeamFollowers: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/teams/:teamUid/followers`,
    pathParams: z.object({ teamUid: z.string() }),
    query: TeamFollowersQueryParams,
    responses: {
      200: TeamFollowersResponseSchema,
    },
    summary: 'List a team\'s followers (team members and admins only)',
  },
});
