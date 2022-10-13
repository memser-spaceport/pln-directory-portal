import { initContract } from '@ts-rest/core';
import { apiMembers } from './contract-member';
import { apiTeams } from './contract-team';

const contract = initContract();

const apiHealth = contract.router({
  check: {
    method: 'GET',
    path: '/health',
    responses: {
      200: contract.response<{ message: string }>(),
    },
    query: null,
    summary: 'Check health',
  },
});

export const apiNested = contract.router({
  /**
   * Members API
   */
  members: apiMembers,
  /**
   * Teams API
   */
  teams: apiTeams,
  /**
   * Health API
   */
  health: apiHealth,
});
