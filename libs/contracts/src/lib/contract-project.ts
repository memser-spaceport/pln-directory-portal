import { initContract } from '@ts-rest/core';
import {
  ResponseProjectWithRelationsSchema
} from '../schema';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiProjects = contract.router({
  getProjectFilters: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/projects/filters`,
    responses: {
      200: contract.response<any>(),
    },
    summary: 'Get project filters',
  },
  getProjects: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/projects`,
    query: contract.query,
    responses: {
      200: ResponseProjectWithRelationsSchema.array(),
    },
    summary: 'Get all Projects',
  },
  getProject: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/projects/:uid`,
    query: contract.query,
    responses: {
      200: ResponseProjectWithRelationsSchema,
    },
    summary: 'Get a project',
  },
  createProject: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/projects`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'create a project',
  },
  modifyProject: {
    method: 'PUT',
    path: `${getAPIVersionAsPath('1')}/projects/:uid`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Modify a project',
  },
  removeProject: {
    method: 'DELETE',
    path: `${getAPIVersionAsPath('1')}/projects/:uid`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Remove a project',
  },
  patchAskProject: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/projects/:uid/ask`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'add/edit asks of a project',
  }
});
