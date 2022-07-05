import { IAirtableTeamsFiltersValues } from '@protocol-labs-network/airtable';
import { ParsedUrlQuery } from 'querystring';
import { getTagsFromValues } from '../../../../components/directory/directory-filters/directory-filters.utils';
import { ITeamsFiltersValues } from './teams-directory-filters.types';

/**
 * Parse teams filter values into each filter component's consumable format
 */
export function parseTeamsFilters(
  filtersValues: {
    valuesByFilter: IAirtableTeamsFiltersValues;
    availableValuesByFilter: IAirtableTeamsFiltersValues;
  },
  query: ParsedUrlQuery
): ITeamsFiltersValues {
  return {
    industry: getTagsFromValues(
      filtersValues.valuesByFilter.industry,
      filtersValues.availableValuesByFilter.industry,
      query.industry
    ),
    fundingVehicle: getTagsFromValues(
      filtersValues.valuesByFilter.fundingVehicle,
      filtersValues.availableValuesByFilter.fundingVehicle,
      query.fundingVehicle
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
