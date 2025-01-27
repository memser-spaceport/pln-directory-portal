import { initContract } from '@ts-rest/core';
import {
  ResponseTeamWithRelationsSchema,
  TeamDetailQueryParams,
  TeamQueryParams,
} from '../schema/team';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiTeam = contract.router({
  teamFilters: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/teams/filters`,
    query: TeamQueryParams,
    responses: {
      200: contract.response<any>(),
    },
    summary: 'filter teams',
  },
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
    query: TeamDetailQueryParams,
    responses: {
      200: ResponseTeamWithRelationsSchema,
    },
    summary: 'Get a team',
  },
  modifyTeam: {
    method: 'PUT',
    path: `${getAPIVersionAsPath('1')}/teams/:uid`,
    body: contract.body<any>(),
    responses: {
      200: contract.response<any>(),
    },
    summary: 'Modify a team',
  },
  patchTeam: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/teams/:uid/ask`,
    body: contract.body<any>(),
    responses: {
      200: contract.response<any>(),
    },
    summary: "Modify team's Ask",
  }
});
