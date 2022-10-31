import { initContract } from '@ts-rest/core';
import { MemberSchema } from '../schema';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiMembers = contract.router({
  getMembers: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members`,
    responses: {
      200: MemberSchema,
    },
    summary: 'Get all members',
  },
  getMember: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members/:uid`,
    responses: {
      200: MemberSchema,
    },
    summary: 'Get a member',
  },
});
