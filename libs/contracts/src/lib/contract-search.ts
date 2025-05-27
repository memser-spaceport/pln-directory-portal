import { initContract } from '@ts-rest/core';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiSearch = contract.router({
  fullTextSearch: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/global-search/all`,
    responses: {
      200: contract.response<any>(),
    },
    summary: 'full text search',
  },
  autocompleteSearch: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/global-search/autocomplete`,
    responses: {
      200: contract.response<any>(),
    },
    summary: 'autocomplete search',
  }
});
