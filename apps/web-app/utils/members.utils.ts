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
    openToWork,
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
    ...(openToWork ? { openToWork: true } : {}),
    ...(searchBy
      ? { name__icontains: stringifyQueryValues(searchBy).trim() }
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
      'uid,name,openToWork,image.url,location.metroArea,location.country,location.region,skills.title,teamMemberRoles.teamLead,teamMemberRoles.mainTeam,teamMemberRoles.role,teamMemberRoles.team.name,teamMemberRoles.team.uid',
    pagination: false,
  };
}

/**
 * Parse member fields values into a member object.
 **/
export const parseMember = (member: TMemberResponse,): IMember => {
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
    telegramHandle: member.telegramHandler || null,
    twitter: member.twitterHandler || null,
    officeHours: member.officeHours || null,
    location,
    skills: member.skills || [],
    teamLead,
    experience: member.experience,
    teams,
    mainTeam,
    openToWork: member.openToWork || false,
    linkedinHandle: member.linkedinHandler || null,
    repositories: member.repositories ?? [],
    preferences: member.preferences ?? null
  };
};

export function restrictMemberInfo(member) {
  const disAllowedKeys = ["discordHandle", "email", "githubHandle", "twitter", "repositories", "telegramHandle", "linkedinHandle", "location"];
  const allKeys = Object.keys(member);
  allKeys.forEach(key => {
    if(disAllowedKeys.includes(key)) {
      delete member[key];
    }
  })
  return member;
}

export function maskMemberDetails(member) {
  // Mask Member details when user is not logged In (when accessToken not available in cookie).
  member.email = member.email
    ? maskEmail(member.email)
    : member.email
  member.githubHandle = member.githubHandle
    ? maskText(member.githubHandle)
    : member.githubHandle;

  member.discordHandle = member.discordHandle
    ? maskText(member.discordHandle)
    : member.discordHandle;
  member.twitter = member.twitter
    ? maskText(member.twitter)
    : member.twitter;
  return member
}

export function maskEmail(email: string): string {
  const maskedEmail = email.replace(/([^@\.])/g, "*").split('');
  let previous = "";
  let counter = 0;
  for (let i = 0; i < maskedEmail.length; i++) {
    if ((counter > 3 && counter < 6) || counter == 0 || (counter > 1 && (email[i + 1] == "." || email[i + 1] == "@"))) {
      maskedEmail[i] = email[i];
    }
    if (email[i - 1] == "." || email[i - 1] == "@") {
      counter = 0;
    }

    if (email[i + 1] == "." || email[i + 1] == "@") {
      i++;
      counter = -1;
    }
    counter++;


    previous = email[i];
  }
  return maskedEmail.join('');
}

export function maskText(text) {
  return text.replace(
    /(.{2})(.*)(.{2})/,
    (match, first, middle, last) =>
      `${first}${'*'.repeat(middle.length)}${last}`
  );
}

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
): { isUserLoggedIn: boolean; member?} => {
  const { member, refreshToken } = nookies.get(res);
  if (member && member.length) {
    const memberDetails: IMember = JSON.parse(member);
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
