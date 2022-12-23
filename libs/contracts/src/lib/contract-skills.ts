import { initContract } from '@ts-rest/core';
import {
  ResponseSkillSchema,
  SkillDetailQueryParams,
  SkillQueryParams,
} from '../schema/skill';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiSkills = contract.router({
  getSkills: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/skills`,
    query: SkillQueryParams,
    responses: {
      200: ResponseSkillSchema.array(),
    },
    summary: 'Get all skills',
  },
  getSkill: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/skills/:uid`,
    query: SkillDetailQueryParams,
    responses: {
      200: ResponseSkillSchema,
    },
    summary: 'Get a skill',
  },
});
