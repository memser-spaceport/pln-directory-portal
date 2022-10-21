import { initContract } from '@ts-rest/core';
import { ResponseAcceleratorProgramSchema } from '../schema/accelerator-program';
import { getAPIVersionAsPath } from '../utils/versioned-path';
const contract = initContract();

export const apiAcceleratorProgram = contract.router({
  getAcceleratorPrograms: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/accelerator-programs`,
    responses: {
      200: ResponseAcceleratorProgramSchema,
    },
  },
  getAcceleratorProgram: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/accelerator-programs/:uid`,
    responses: {
      200: ResponseAcceleratorProgramSchema,
    },
  },
});
