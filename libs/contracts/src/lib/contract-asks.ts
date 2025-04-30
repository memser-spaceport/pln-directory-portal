import { initContract } from '@ts-rest/core';
import {
  ResponseAskSchema,
  ResponseAskSchemaWithRelationsSchema,
  CreateAskSchema,
  UpdateAskSchema,
  CloseAskSchema,
} from '../schema/ask';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiAsks = contract.router({
  getAsk: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/asks/:uid`,
    responses: {
      200: ResponseAskSchemaWithRelationsSchema,
    },
    summary: 'Get an ask by uid',
  },
  createTeamAsk: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/teams/:teamUid/asks`,
    body: CreateAskSchema,
    responses: {
      201: ResponseAskSchema,
    },
    summary: 'Create an ask for a team',
  },
  updateAsk: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/asks/:uid`,
    body: UpdateAskSchema,
    responses: {
      200: ResponseAskSchema,
    },
    summary: 'Update an ask',
  },
  closeAsk: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/asks/:uid/close`,
    body: CloseAskSchema,
    responses: {
      200: ResponseAskSchema,
    },
    summary: 'Close an ask',
  },
  deleteAsk: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/asks/:uid`,
    body: contract.body<unknown>(),
    responses: {
      204: null,
    },
    summary: 'Delete an ask',
  },
});
