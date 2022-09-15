import { initContract } from '@ts-rest/core';
import { apiMember } from './contract-member';
import { apiTeam } from './contract-team';

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
  members: apiMember,
  /**
   * Teams API
   */
  teams: apiTeam,
  /**
   * Health API
   */
  health: apiHealth,
});
