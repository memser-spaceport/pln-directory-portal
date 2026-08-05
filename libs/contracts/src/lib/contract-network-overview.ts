import { initContract } from '@ts-rest/core';
import { NetworkOverviewDtoSchema } from '../schema/network-overview';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiNetworkOverview = contract.router({
  getLatest: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/network-overview/latest`,
    responses: {
      200: NetworkOverviewDtoSchema,
    },
    summary: 'Latest Gemini-generated network overview for the home feed top card',
  },
});
