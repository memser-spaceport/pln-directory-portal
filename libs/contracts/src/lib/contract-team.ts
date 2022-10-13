import { initContract } from '@ts-rest/core';
import { CreateTeamSchema, GetTeamSchema, TeamSchema } from '../schema';

const contract = initContract();

export const apiTeams = contract.router({
  getTeams: {
    method: 'GET',
    path: '/teams',
    responses: {
      200: GetTeamSchema.array(),
    },
    summary: 'Get a team',
  },
  createTeam: {
    method: 'POST',
    path: '/team',
    responses: {
      201: TeamSchema,
    },
    body: CreateTeamSchema,
    summary: 'Create a team',
  },
});
