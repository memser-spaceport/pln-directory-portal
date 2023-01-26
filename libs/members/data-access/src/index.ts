import { IAirtableMembersFiltersValues } from '@protocol-labs-network/airtable';
import { IMember } from '@protocol-labs-network/api';
import { TMemberResponse } from '@protocol-labs-network/contracts';
import {
  client,
  TGetRequestOptions,
} from '@protocol-labs-network/shared/data-access';
import { TMemberListOptions } from './members.types';

/**
 * Get members list from API
 */
export const getMembers = async (options: TMemberListOptions) => {
  return await client.members.getMembers({
    query: {
      ...options,
    },
  });
};

/**
 * Get member details from API
 */
export const getMember = async (
  id: string,
  options: TGetRequestOptions = {}
) => {
  return await client.members.getMember({
    params: { uid: id },
    query: options,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
};

/**
 * Parse member fields values into a member object.
 **/
export const parseMember = (member: TMemberResponse): IMember => {
  const location = parseMemberLocation(member.location);
  const skills = member.skills?.map((skill) => skill.title) || [];
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
    skills,
    teamLead,
    teams,
    mainTeam,
  };
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
 * Get values and available values for members filters
 */
export const getMembersFilters = async (options: TMemberListOptions) => {
  const [valuesByFilter, availableValuesByFilter] = await Promise.all([
    getMembersFiltersValues(),
    getMembersFiltersValues(options),
  ]);

  if (valuesByFilter.status !== 200 || availableValuesByFilter.status !== 200) {
    const emptyFilters = {
      skills: [],
      region: [],
      country: [],
      metroArea: [],
    };

    return {
      valuesByFilter: emptyFilters,
      availableValuesByFilter: emptyFilters,
    };
  }

  return {
    valuesByFilter: parseMembersFilters(valuesByFilter.body),
    availableValuesByFilter: parseMembersFilters(availableValuesByFilter.body),
  };
};

/**
 * Get values for teams filters
 */
const getMembersFiltersValues = async (options: TMemberListOptions = {}) => {
  return await getMembers({
    ...options,
    pagination: false,
    select:
      'skills.title,location.metroArea,location.city,location.continent,location.country',
  });
};

/**
 * Parse members fields values into lists of unique values per field.
 */
const parseMembersFilters = (members: TMemberResponse[]) => {
  const filtersValues = members.reduce(
    (values, member) => {
      const skills = getUniqueFilterValues(
        values.skills,
        member.skills?.map((skill) => skill.title)
      );

      const region = getUniqueFilterValues(
        values.region,
        member.location?.continent ? [member.location.continent] : []
      );

      const country = getUniqueFilterValues(
        values.country,
        member.location?.country ? [member.location.country] : []
      );

      const metroArea = getUniqueFilterValues(
        values.metroArea,
        member.location?.metroArea ? [member.location.metroArea] : []
      );

      return { skills, region, country, metroArea };
    },
    {
      skills: [],
      region: [],
      country: [],
      metroArea: [],
    } as IAirtableMembersFiltersValues
  );

  Object.values(filtersValues).forEach((value) => value.sort());

  return filtersValues;
};

/**
 * Get unique values from two arrays
 */
const getUniqueFilterValues = (
  uniqueValues: string[],
  newValues?: string[]
): string[] => {
  return [...new Set([...uniqueValues, ...(newValues || [])])];
};

export * from './members.types';
