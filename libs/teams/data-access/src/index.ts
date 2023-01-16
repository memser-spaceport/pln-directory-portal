import { ITeam } from '@protocol-labs-network/api';
import { TTeamResponse } from '@protocol-labs-network/contracts';
import { client } from '@protocol-labs-network/shared/data-access';
import { TTeamListOptions, TTeamsFiltersValues } from './teams.types';

/**
 * Get teams list from API
 */
export const getTeams = async (options: TTeamListOptions) => {
  return await client.teams.getTeams({
    query: {
      ...options,
    },
  });
};

/**
 * Get team details from API
 */
export const getTeam = async (id: string) => {
  return await client.teams.getTeam({
    params: { uid: id },
  });
};

/**
 * Parse team fields values into a team object.
 **/
export const parseTeam = (team: TTeamResponse): ITeam => {
  const {
    uid: id,
    name,
    logo,
    website,
    twitterHandler: twitter,
    shortDescription,
    longDescription,
    technologies,
    membershipSources,
    industryTags: tags,
    fundingStage,
    teamMemberRoles,
  } = team;

  const technologyTitles = technologies?.map((tech) => tech.title) || [];
  const filecoinUser = technologyTitles.includes('Filecoin');
  const ipfsUser = technologyTitles.includes('IPFS');

  const membershipSourceTitles =
    membershipSources?.map((source) => source.title) || [];
  const tagTitles = tags?.map((tag) => tag.title) || [];
  const memberIds = teamMemberRoles?.length
    ? [
        ...new Set(
          teamMemberRoles.map(
            (teamMemberRole) => teamMemberRole.member?.uid || ''
          )
        ),
      ]
    : [];

  return {
    id,
    name,
    logo: logo?.url || null,
    website: website || null,
    twitter: twitter || null,
    shortDescription: shortDescription || null,
    longDescription: longDescription || null,
    filecoinUser,
    ipfsUser,
    fundingStage: fundingStage?.title || null,
    membershipSources: membershipSourceTitles,
    tags: tagTitles,
    members: memberIds,
    contactMethod: null,
  };
};

/**
 * Get values and available values for teams filters
 */
export const getTeamsFilters = async (options: TTeamListOptions) => {
  const [valuesByFilter, availableValuesByFilter] = await Promise.all([
    getTeamsFiltersValues(),
    getTeamsFiltersValues(options),
  ]);

  if (valuesByFilter.status !== 200 || availableValuesByFilter.status !== 200) {
    const emptyFilters = {
      tags: [],
      membershipSources: [],
      fundingStage: [],
      technology: [],
    };

    return {
      valuesByFilter: emptyFilters,
      availableValuesByFilter: emptyFilters,
    };
  }

  return {
    valuesByFilter: parseTeamsFilters(valuesByFilter.body),
    availableValuesByFilter: parseTeamsFilters(availableValuesByFilter.body),
  };
};

/**
 * Get values for teams filters
 */
const getTeamsFiltersValues = async (options: TTeamListOptions = {}) => {
  return await getTeams({
    ...options,
    pagination: false,
    select:
      'industryTags.title,membershipSources.title,fundingStage.title,technologies.title',
  });
};

/**
 * Parse teams fields values into lists of unique values per field.
 */
const parseTeamsFilters = (teams: TTeamResponse[]) => {
  const filtersValues = teams.reduce(
    (values, team) => {
      const tags = getUniqueFilterValues(
        values.tags,
        team.industryTags?.map((tag) => tag.title)
      );

      const membershipSources = getUniqueFilterValues(
        values.membershipSources,
        team.membershipSources?.map((source) => source.title)
      );

      const fundingStage = getUniqueFilterValues(
        values.fundingStage,
        team.fundingStage && [team.fundingStage.title]
      );

      const technology = getUniqueFilterValues(
        values.technology,
        team.technologies?.map((technology) => technology.title)
      );

      return { tags, membershipSources, fundingStage, technology };
    },
    {
      tags: [],
      membershipSources: [],
      fundingStage: [],
      technology: [],
    } as TTeamsFiltersValues
  );

  Object.values(filtersValues).forEach((value) => value.sort());

  return filtersValues;
};

/**
 * Get unique values from two arrays
 */
const getUniqueFilterValues = (
  uniqueValues: string[],
  newValues?: string[]
): string[] => {
  return [...new Set([...uniqueValues, ...(newValues || [])])];
};

export * from './teams.types';
