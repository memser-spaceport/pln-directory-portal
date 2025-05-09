import { initContract } from '@ts-rest/core';
import { apiMembershipSource } from './contract-membership-source';
import { apiFundingStages } from './contract-funding-stages';
import { apiIndustryTags } from './contract-industry-tags';
import { apiLocations } from './contract-locations';
import { apiMembers } from './contract-member';
import { apiSkills } from './contract-skills';
import { apiTeam } from './contract-team';
import { apiTechnologies } from './contract-technology';
import { apiProjects } from './contract-project';
import { apiAsks } from './contract-asks';

const contract = initContract();

const apiHealth = contract.router({
  check: {
    method: 'GET',
    path: '/health',
    responses: {
      200: contract.response<{ message: string }>(),
    },
    query: null,
    summary: 'Check health',
  },
});

export const apiNested = contract.router({
  /**
   * Members API
   */
  members: apiMembers,
  /**
   * Teams API
   */
  teams: apiTeam,
  /**
   * Health API
   */
  health: apiHealth,
  /**
   * Tags API
   */
  tags: apiIndustryTags,
  /**
   * Membership Sources API
   */
  membershipSources: apiMembershipSource,
  /**
   * Funding stages API
   */
  fundingStages: apiFundingStages,
  /**
   * Skills API
   */
  skills: apiSkills,
  /**
   * Locations API
   */
  locations: apiLocations,
  /**
   * Technologies API
   */
  technologies: apiTechnologies,
  /**
   * Projects API
   */
  projects: apiProjects,
  /**
   * Asks API
   */
  asks: apiAsks,
});
