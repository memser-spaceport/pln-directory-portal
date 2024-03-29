import { TTeamResponse } from '@protocol-labs-network/contracts';
import { ParsedUrlQuery } from 'querystring';
import { getSortFromQuery, stringifyQueryValues } from './list.utils';
import { ITeam } from './teams.types';

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
    focusAreas,
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
    ...(searchBy
      ? { name__icontains: stringifyQueryValues(searchBy).trim() }
      : {}),
      ...(focusAreas ? { 'focusAreas': stringifyQueryValues(focusAreas) } : {}),
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
  };
}

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
    industryTags,
    fundingStage,
    teamMemberRoles,
    contactMethod,
    linkedinHandler,
  } = team;

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
    technologies: technologies || [],
    fundingStage: fundingStage?.title || null,
    industryTags: industryTags || [],
    membershipSources: membershipSources || [],
    members: memberIds,
    contactMethod: contactMethod || null,
    linkedinHandle: linkedinHandler || null,
  };
};
