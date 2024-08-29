import { initContract } from '@ts-rest/core';
import { getAPIVersionAsPath } from '../utils/versioned-path';
import {
  DiscoveryQuestionQueryParams,
  ResponseDiscoveryQuestionSchemaWithRelations
} from '../schema';
const contract = initContract();

export const apiHome = contract.router({
  getAllFeaturedData: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/home/featured`,
    query: contract.query,
    responses: {
      200: contract.response<unknown>()
    },
    summary: 'Get all featured members, projects, teams and events'
  },
  getAllDiscoveryQuestions: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/home/discovery/questions`,
    query: DiscoveryQuestionQueryParams,
    responses: {
      200: ResponseDiscoveryQuestionSchemaWithRelations.array()
    },
    summary: 'Get all the discovery question',
  },
  getDiscoveryQuestion: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/home/discovery/questions/:slug`,
    query: DiscoveryQuestionQueryParams,
    responses: {
      200: ResponseDiscoveryQuestionSchemaWithRelations.array()
    },
    summary: 'Get discovery question',
  },
  createDiscoveryQuestion: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/home/discovery/questions`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>()
    },
    summary: 'Create a new discovery question',
  },
  updateDiscoveryQuestion: {
    method: 'PUT',
    path: `${getAPIVersionAsPath('1')}/home/discovery/questions/:slug`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>()
    },
    summary: 'Update a discovery question by slug'
  },
  updateDiscoveryQuestionShareCountOrViewCount: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/home/discovery/questions/:slug`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>()
    },
    summary: 'Update view/share count of a discovery question by slug'
  }
});
