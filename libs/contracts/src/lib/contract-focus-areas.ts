import { initContract } from '@ts-rest/core';
import {
  ResponseFocusAreaSchema,
  FocusAreaQueryParams
} from '../schema/focus-areas';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiFocusAreas = contract.router({
  getFocusAreas: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/focus-areas`,
    query: FocusAreaQueryParams,
    responses: {
      200: ResponseFocusAreaSchema.array(),
    },
    summary: 'Get all focus areas',
  },
  getFocusAreasWithRelations: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/focus-areas/all`,
    query: FocusAreaQueryParams,
    responses: {
      200: ResponseFocusAreaSchema.array(),
    },
    summary: 'Get all focus areas with teams and projects',
  }
});
