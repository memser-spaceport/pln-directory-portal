import { initContract } from '@ts-rest/core';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiHome = contract.router({
  getAllFeaturedData: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/home/featured/all`,
    query: contract.query,
    responses: {
      200: contract.response<unknown>()
    },
    summary: 'Get all featured members, projects, teams and events',
  }
});