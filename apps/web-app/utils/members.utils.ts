import { TMemberResponse } from '@protocol-labs-network/contracts';
import { TMemberListOptions } from '@protocol-labs-network/members/data-access';
import nookies from 'nookies';
import { ParsedUrlQuery } from 'querystring';
import { getSortFromQuery, stringifyQueryValues } from './list.utils';
import { IMember } from './members.types';

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
    ...(officeHoursOnly ? { officeHours__not: 'null' } : {}),
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
    ...(searchBy
      ? { name__istartswith: stringifyQueryValues(searchBy).trim() }
      : {}),
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
  };
}

/**
 * Parse member fields values into a member object.
 **/
export const parseMember = (member: TMemberResponse): IMember => {
  const location = parseMemberLocation(member.location);
  const teams =
    member.teamMemberRoles?.map((teamMemberRole) => ({
      id: teamMemberRole.team?.uid || '',
      name: teamMemberRole.team?.name || '',
      role: teamMemberRole.role || 'Contributor',
      teamLead: !!teamMemberRole.teamLead,
      mainTeam: !!teamMemberRole.mainTeam,
    })) || [];
  const mainTeam = teams.find((team) => team.mainTeam) || null;
  const teamLead = teams.some((team) => team.teamLead);

  return {
    id: member.uid,
    name: member.name,
    email: member.email || null,
    image: member.image?.url || null,
    githubHandle: member.githubHandler || null,
    discordHandle: member.discordHandler || null,
    twitter: member.twitterHandler || null,
    officeHours: member.officeHours || null,
    location,
    skills: member.skills || [],
    teamLead,
    teams,
    mainTeam,
  };
};

/**
 * Parse member location fields values into a location string.
 */
const parseMemberLocation = (
  location: TMemberResponse['location']
): IMember['location'] => {
  const { metroArea, city, country, region } = location ?? {};

  if (metroArea) {
    return metroArea;
  }

  if (country) {
    if (city) {
      return `${city}, ${country}`;
    }

    if (region) {
      return `${region}, ${country}`;
    }

    return country;
  }

  return 'Not provided';
};

/**
 * Parse team members by excluding relationships to teams other than
 * the provided.
 **/
export const parseTeamMember = (
  member: TMemberResponse,
  teamId: string
): IMember => {
  const memberWithoutOtherTeams = {
    ...member,
    teamMemberRoles: member.teamMemberRoles?.filter(
      (teamMemberRole) => teamMemberRole.team?.uid === teamId
    ),
  };

  return parseMember(memberWithoutOtherTeams);
};

/**
 * Used to parse member that currently logged in from cookie.
 **/
export const getMemberFromCookie = (
  res?
): { isUserLoggedIn: boolean; member?: IMember } => {
  let { member, refreshToken } = nookies.get(res);
  if (member && member.length) {
    let memberDetails: IMember = JSON.parse(member);
    memberDetails.id = JSON.parse(member).uid;
    memberDetails.image = JSON.parse(member).profileImageUrl;
    return {
      isUserLoggedIn: true,
      member: memberDetails,
    };
  } else if (refreshToken) {
    return {
      isUserLoggedIn: true,
    };
  } else {
    return {
      isUserLoggedIn: false,
    };
  }
};
