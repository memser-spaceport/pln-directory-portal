import { initContract } from '@ts-rest/core';
import { ResponseTeamSchema } from '../schema/team';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiTeam = contract.router({
  getTeams: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/teams`,
    responses: {
      200: ResponseTeamSchema.array(),
    },
    summary: 'Get all teams',
  },
  getTeam: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/teams/:uid`,
    responses: {
      200: ResponseTeamSchema,
    },
    summary: 'Get a team',
  },
});
