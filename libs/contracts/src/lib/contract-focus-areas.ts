import { initContract } from '@ts-rest/core';
import {
  ResponseFocusAreaSchema,
  FocusAreaQueryParams
} from '../schema/focus-areas';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiFocusAreas = contract.router({
  getSkills: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/focus-areas`,
    query: FocusAreaQueryParams,
    responses: {
      200: ResponseFocusAreaSchema.array(),
    },
    summary: 'Get all focus areas',
  }
});
