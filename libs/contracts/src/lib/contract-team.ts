import { initContract } from '@ts-rest/core';
import {
  ResponseTeamWithRelationsSchema,
  TeamQueryParams,
} from '../schema/team';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiTeam = contract.router({
  getTeams: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/teams`,
    query: TeamQueryParams,
    responses: {
      200: ResponseTeamWithRelationsSchema.array(),
    },
    summary: 'Get all teams',
  },
  getTeam: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/teams/:uid`,
    responses: {
      200: ResponseTeamWithRelationsSchema,
    },
    summary: 'Get a team',
  },
});
