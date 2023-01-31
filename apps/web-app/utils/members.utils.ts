import { TMemberListOptions } from '@protocol-labs-network/members/data-access';
import { ParsedUrlQuery } from 'querystring';
import { getSortFromQuery, stringifyQueryValues } from './list.utils';

/**
 * Returns the options for requesting the members on the members directory,
 * based on the provided query parameters.
 */
export function getMembersOptionsFromQuery(
  queryParams: ParsedUrlQuery
): TMemberListOptions {
  const {
    sort,
    searchBy,
    skills,
    region,
    country,
    metroArea,
    officeHoursOnly,
    includeFriends,
  } = queryParams;

  const sortFromQuery = getSortFromQuery(sort?.toString());
  const sortField = sortFromQuery.field.toLowerCase();

  return {
    ...(officeHoursOnly ? { officeHours__not: null } : {}),
    ...(skills ? { 'skills.title__with': stringifyQueryValues(skills) } : {}),
    ...(region
      ? {
          'location.continent__with': stringifyQueryValues(region),
        }
      : {}),
    ...(country
      ? { 'location.country__with': stringifyQueryValues(country) }
      : {}),
    ...(metroArea
      ? { 'location.metroArea__with': stringifyQueryValues(metroArea) }
      : {}),
    ...(includeFriends ? {} : { plnFriend: false }),
    ...(searchBy ? { name__istartswith: stringifyQueryValues(searchBy) } : {}),
    orderBy: `${sortFromQuery.direction === 'desc' ? '-' : ''}${sortField}`,
  };
}

/**
 * Get the options for requesting the members on the members directory.
 */
export function getMembersListOptions(
  options: TMemberListOptions
): TMemberListOptions {
  return {
    ...options,
    select:
      'uid,name,image.url,location.metroArea,location.country,location.region,skills.title,teamMemberRoles.teamLead,teamMemberRoles.mainTeam,teamMemberRoles.role,teamMemberRoles.team.name,teamMemberRoles.team.uid',
    pagination: false,
    teamMemberRoles__not: 'null',
  };
}
