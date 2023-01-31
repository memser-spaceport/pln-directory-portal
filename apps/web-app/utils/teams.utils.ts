import { ParsedUrlQuery } from 'querystring';
import { getSortFromQuery, stringifyQueryValues } from './list.utils';

/**
 * Returns the options for requesting the teams on the teams directory,
 * based on the provided query parameters.
 */
export function getTeamsOptionsFromQuery(queryParams: ParsedUrlQuery) {
  const {
    sort,
    tags,
    membershipSources,
    fundingStage,
    searchBy,
    technology,
    includeFriends,
  } = queryParams;

  const sortFromQuery = getSortFromQuery(sort?.toString());
  const sortField = sortFromQuery.field.toLowerCase();

  return {
    ...(technology
      ? { 'technologies.title__with': stringifyQueryValues(technology) }
      : {}),
    ...(membershipSources
      ? {
          'membershipSources.title__with':
            stringifyQueryValues(membershipSources),
        }
      : {}),
    ...(fundingStage
      ? { 'fundingStage.title__with': stringifyQueryValues(fundingStage) }
      : {}),
    ...(tags ? { 'industryTags.title__with': stringifyQueryValues(tags) } : {}),
    ...(includeFriends ? {} : { plnFriend: false }),
    ...(searchBy ? { name__istartswith: stringifyQueryValues(searchBy) } : {}),
    orderBy: `${sortFromQuery.direction === 'desc' ? '-' : ''}${sortField}`,
  };
}

/**
 * Get the options for requesting the teams on the teams directory.
 */
export function getTeamsListOptions(options) {
  return {
    ...options,
    select: 'uid,name,shortDescription,logo.url,industryTags.title',
    pagination: false,
    shortDescription__not: 'null',
  };
}
