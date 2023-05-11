import { initContract } from '@ts-rest/core';
import {} from '../schema';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiParticipantRequests = contract.router({
  getParticipantRequests: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/participants-request`,
    query: contract.query,
    responses: {
      200: contract.response<any>(),
    },
    summary: 'Get all participants requests',
  },
  getParticipantRequest: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/participants-request/:uid`,
    query: contract.query,
    responses: {
      200: contract.response<any>(),
    },
    summary: 'Get a specific paritcipant request',
  },
  addParticipantRequest: {
    method: 'POST',
    body: contract.body<any>(),
    path: `${getAPIVersionAsPath('1')}/participants-request`,
    responses: {
      200: contract.response<any>(),
    },
    summary: 'Add new paritcipant request',
  },
  updateParticipantRequest: {
    method: 'PUT',
    body: contract.body<any>(),
    path: `${getAPIVersionAsPath('1')}/participants-request/:uid`,
    responses: {
      200: contract.response<any>(),
    },
    summary: 'Update paritcipant request',
  },
  processParticipantRequest: {
    method: 'PATCH',
    body: contract.body<any>(),
    path: `${getAPIVersionAsPath('1')}/participants-request/:uid`,
    responses: {
      200: contract.response<any>(),
    },
    summary: 'Process paritcipant request',
  },
});
