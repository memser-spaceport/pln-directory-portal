import { initContract } from '@ts-rest/core';
import { LocationQueryParams, LocationResponseSchema } from '../schema';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiLocations = contract.router({
  getLocations: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/locations`,
    query: LocationQueryParams,
    responses: {
      200: LocationResponseSchema.array(),
    },
    summary: 'Get all locations',
  },
  validateLocation: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/locations/validate`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Validate location',
  },
  getCountries: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/locations/countries`,
    query: contract.query,
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Get all countries',
  },
  getStates: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/locations/states`,
    query: contract.query,
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Get all states',
  },
  getStatesByCountry: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/locations/countries/:country/states`,
    query: contract.query,
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Get all states by country',
  },
  getCitiesByCountry: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/locations/countries/:country/cities`,
    query: contract.query,
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Get all cities by country',
  },
  getCitiesByCountryAndState: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/locations/countries/:country/states/:state/cities`,
    query: contract.query,
    responses: {
      200: contract.response<unknown>(),
    },
    summary: 'Get all cities by country and state',
  }
});
