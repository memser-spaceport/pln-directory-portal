import { initContract } from '@ts-rest/core';
import {
  AcceleratorProgramDetailQueryParams,
  AcceleratorProgramQueryParams,
  ResponseAcceleratorProgramSchema,
} from '../schema/accelerator-program';
import { getAPIVersionAsPath } from '../utils/versioned-path';
const contract = initContract();

export const apiAcceleratorProgram = contract.router({
  getAcceleratorPrograms: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/accelerator-programs`,
    query: AcceleratorProgramQueryParams,
    responses: {
      200: ResponseAcceleratorProgramSchema.array(),
    },
  },
  getAcceleratorProgram: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/accelerator-programs/:uid`,
    query: AcceleratorProgramDetailQueryParams,
    responses: {
      200: ResponseAcceleratorProgramSchema,
    },
  },
});
