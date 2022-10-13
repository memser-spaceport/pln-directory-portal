import { initContract } from '@ts-rest/core';
import { CreateMemberSchema, MemberSchema } from '../schema';

const contract = initContract();

export const apiMembers = contract.router({
  createMember: {
    method: 'POST',
    path: '/',
    responses: {
      201: MemberSchema,
    },
    body: CreateMemberSchema,
    summary: 'Create a member',
  },
});
