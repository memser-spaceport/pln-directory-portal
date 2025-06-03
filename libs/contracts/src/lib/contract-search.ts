import { initContract } from '@ts-rest/core';
import { getAPIVersionAsPath } from '../utils/versioned-path';
import { SearchResultSchema } from '../schema/global-search';

const contract = initContract();

export const apiSearch = contract.router({
  fullTextSearch: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/global-search/all`,
    responses: {
      200: SearchResultSchema,
    },
    summary: 'full text search',
  },
  autocompleteSearch: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/global-search/autocomplete`,
    responses: {
      200: SearchResultSchema,
    },
    summary: 'autocomplete search',
  }
});
