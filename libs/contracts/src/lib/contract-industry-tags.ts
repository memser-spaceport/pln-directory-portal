import { initContract } from '@ts-rest/core';
import { IndustryTagQueryParams, ResponseIndustryTagSchema } from '../schema';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiIndustryTags = contract.router({
  getIndustryTags: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/industry-tags`,
    query: IndustryTagQueryParams,
    responses: {
      200: ResponseIndustryTagSchema.array(),
    },
    summary: 'Get all industry tags',
  },
  getIndustryTag: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/industry-tags/:uid`,
    responses: {
      200: ResponseIndustryTagSchema.nullable(),
    },
    summary: 'Get an industry tag',
  },
  // createIndustryTag: {
  //   method: 'POST',
  //   path: '/industry-tags',
  //   responses: {
  //     201: ResponseIndustryTagSchema,
  //   },
  //   body: CreateIndustryTagSchema,
  //   summary: 'Create an industry tag',
  // },
  // updateIndustryTag: {
  //   method: 'PUT',
  //   path: `/industry-tags/:uid`,
  //   responses: {
  //     200: ResponseIndustryTagSchema,
  //   },
  //   body: CreateIndustryTagSchema.optional(),
  //   summary: 'Update an industry tag',
  // },
  // deleteIndustryTag: {
  //   method: 'DELETE',
  //   path: `/industry-tags/:uid`,
  //   responses: {
  //     204: {},
  //   },
  //   body: null,
  //   summary: 'Delete an industry tag',
  // },
});
