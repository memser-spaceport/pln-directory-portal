import { initContract } from '@ts-rest/core';
import { apiMember } from './contract-member';

const c = initContract();

const apiHealth = c.router({
  check: {
    method: 'GET',
    path: '/health',
    responses: {
      200: c.response<{ message: string }>(),
    },
    query: null,
    summary: 'Check health',
  },
});

export const apiNested = c.router({
  /**
   * Members API
   */
  members: apiMember,
  /**
   * Health API
   */
  health: apiHealth,
});
