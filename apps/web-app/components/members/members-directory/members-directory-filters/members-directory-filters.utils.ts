import { IAirtableMembersFiltersValues } from '@protocol-labs-network/airtable';
import { ParsedUrlQuery } from 'querystring';
import { getTagsFromValues } from '../../../shared/directory/directory-filters/directory-filters.utils';
import { IMembersFiltersValues } from './members-directory-filters.types';

/**
 * Parse members filter values into each filter component's consumable format
 */
export function parseMembersFilters(
  filtersValues: {
    valuesByFilter: IAirtableMembersFiltersValues;
    availableValuesByFilter: IAirtableMembersFiltersValues;
  },
  query: ParsedUrlQuery
): IMembersFiltersValues {
  return {
    skills: getTagsFromValues(
      filtersValues.valuesByFilter.skills,
      filtersValues.availableValuesByFilter.skills,
      query.skills
    ),
    region: getTagsFromValues(
      filtersValues.valuesByFilter.region,
      filtersValues.availableValuesByFilter.region,
      query.region
    ),
    country: getTagsFromValues(
      filtersValues.valuesByFilter.country,
      filtersValues.availableValuesByFilter.country,
      query.country
    ),
    metroArea: getTagsFromValues(
      filtersValues.valuesByFilter.metroArea,
      filtersValues.availableValuesByFilter.metroArea,
      query.metroArea
    ),
  };
}
