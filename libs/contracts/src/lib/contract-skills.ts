import { initContract } from '@ts-rest/core';
import { ResponseSkillSchema } from '../schema/skill';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiSkills = contract.router({
  getSkills: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/skills`,
    responses: {
      200: ResponseSkillSchema.array(),
    },
    summary: 'Get all skills',
  },
  getSkill: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/skills/:uid`,
    responses: {
      200: ResponseSkillSchema,
    },
    summary: 'Get a skill',
  },
});
