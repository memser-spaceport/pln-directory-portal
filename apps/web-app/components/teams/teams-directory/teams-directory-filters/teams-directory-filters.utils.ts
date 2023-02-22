import { TTeamsFiltersValues } from '@protocol-labs-network/teams/data-access';
import { ParsedUrlQuery } from 'querystring';
import { getTagsFromValues } from '../../../shared/directory/directory-filters/directory-filters.utils';
import { ITeamsFiltersValues } from './teams-directory-filters.types';

/**
 * Parse teams filter values into each filter component's consumable format
 */
export function parseTeamsFilters(
  filtersValues: {
    valuesByFilter: TTeamsFiltersValues;
    availableValuesByFilter: TTeamsFiltersValues;
  },
  query: ParsedUrlQuery
): ITeamsFiltersValues {
  return {
    tags: getTagsFromValues(
      filtersValues.valuesByFilter.tags,
      filtersValues.availableValuesByFilter.tags,
      query.tags
    ),
    membershipSources: getTagsFromValues(
      filtersValues.valuesByFilter.membershipSources,
      filtersValues.availableValuesByFilter.membershipSources,
      query.membershipSources
    ),
    fundingStage: getTagsFromValues(
      filtersValues.valuesByFilter.fundingStage,
      filtersValues.availableValuesByFilter.fundingStage,
      query.fundingStage
    ),
    technology: getTagsFromValues(
      filtersValues.valuesByFilter.technology,
      filtersValues.availableValuesByFilter.technology,
      query.technology
    ),
  };
}
