import { TMembersFiltersValues } from '@protocol-labs-network/members/data-access';
import { ParsedUrlQuery } from 'querystring';
import { getRoleTagsFromValues, getTagsFromValues } from '../../../shared/directory/directory-filters/directory-filters.utils';
import { IMembersFiltersValues } from './members-directory-filters.types';
import { ROLES_FILTER_VALUES } from 'apps/web-app/constants';

/**
 * Parse members filter values into each filter component's consumable format
 */
export function parseMembersFilters(
  filtersValues: {
    valuesByFilter: TMembersFiltersValues;
    availableValuesByFilter: TMembersFiltersValues;
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
    memberRoles: getRoleTagsFromValues(
      ROLES_FILTER_VALUES,
      query.memberRoles
    ),
  };
}
