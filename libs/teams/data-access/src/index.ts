import { TTeamResponse } from '@protocol-labs-network/contracts';
import {
  client,
  TGetRequestOptions,
} from '@protocol-labs-network/shared/data-access';
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
export const getTeam = async (id: string, options: TGetRequestOptions = {}) => {
  return await client.teams.getTeam({
    params: { uid: id },
    query: options,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
};

/**
 * Get team unique id based on provided airtable id
 */
export const getTeamUIDByAirtableId = async (id: string) => {
  const res = await client.teams.getTeams({
    query: { airtableRecId: id, select: 'uid' },
  });

  return res.status === 200 && res.body[0] ? res.body[0].uid : null;
};

/**
 * Get values and available values for teams filters
 */
export const getTeamsFilters = async (options: TTeamListOptions) => {
  console.log('calling getTeamsFilters');
  const [valuesByFilter, availableValuesByFilter] = await Promise.all([
    getTeamsFiltersValues({
      plnFriend: false,
    }),
    getTeamsFiltersValues(options),
  ]);

  console.log(
    'valuesByFilter, availableValuesByFilter>>>>',
    valuesByFilter,
    availableValuesByFilter
  );

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
