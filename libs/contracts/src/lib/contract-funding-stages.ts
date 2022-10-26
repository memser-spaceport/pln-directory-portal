import { initContract } from '@ts-rest/core';
import { ResponseFundingStageSchema } from '../schema';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiFundingStages = contract.router({
  getFundingStages: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/funding-stages`,
    responses: {
      200: ResponseFundingStageSchema.array(),
    },
    summary: 'Get all funding stages',
  },
  getFundingStage: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/funding-stages/:uid`,
    responses: {
      200: ResponseFundingStageSchema,
    },
    summary: 'Get a funding stage',
  },
});
