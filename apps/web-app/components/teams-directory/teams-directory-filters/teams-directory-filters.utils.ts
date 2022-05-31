import { IAirtableTeamsFiltersValues } from '@protocol-labs-network/airtable';
import { ParsedUrlQuery } from 'querystring';
import { URL_QUERY_VALUE_SEPARATOR } from '../../../constants';
import { IFilterTag } from '../../directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
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
  };
}

/**
 * Get tags from provided filter values, identifying:
 * - the selected ones, based on the query parameter value
 * - the disabled ones, based on either they're available or not to be selected
 */
function getTagsFromValues(
  allValues: string[],
  availableValues: string[],
  queryValues: string | string[] = []
): IFilterTag[] {
  const queryValuesArr = Array.isArray(queryValues)
    ? queryValues
    : queryValues.split(URL_QUERY_VALUE_SEPARATOR);

  return allValues.map((value) => ({
    value,
    selected: queryValuesArr.includes(value),
    disabled: !availableValues.includes(value),
  }));
}
