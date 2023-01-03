import { IAirtableMembersFiltersValues } from '@protocol-labs-network/airtable';
import { IMember } from '@protocol-labs-network/api';
import { TMemberResponse } from '@protocol-labs-network/contracts';
import { client } from '@protocol-labs-network/shared/data-access';
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
export const getMember = async (id: string) => {
  return await client.members.getMember({
    params: { uid: id },
  });
};

/**
 * Parse member fields values into a member object.
 **/
export const parseMember = (member: TMemberResponse): IMember => {
  const {
    uid: id,
    name,
    email,
    image,
    githubHandler: githubHandle,
    discordHandler: discordHandle,
    twitterHandler: twitter,
    officeHours,
    location,
    skills,
    teamMemberRoles,
  } = member;

  const displayName = name;
  const memberLocation = parseMemberLocation(location);
  const memberSkills = skills?.map((skill) => skill.title) || [];

  // TODO: Change memberRole, teamLead & memberTeams lines during code cleanup
  // and removal of the Airtable layer to fully take advantage
  // of the new relationships between teams and members.
  const memberRole = teamMemberRoles
    ?.map((member) => member.role?.title)
    .join(',');
  const teamLead = teamMemberRoles?.some((member) => member.teamLead) || false;
  const memberTeams =
    teamMemberRoles?.map((member) => ({
      id: member.team?.uid || '',
      name: member.team?.name || '',
    })) || [];

  return {
    id,
    name,
    displayName,
    email,
    image: image?.url || null,
    githubHandle: githubHandle || null,
    discordHandle: discordHandle || null,
    twitter: twitter || null,
    officeHours: officeHours || null,
    location: memberLocation,
    skills: memberSkills,
    role: memberRole || null,
    teamLead,
    teams: memberTeams,
  };
};

/**
 * Parse member location fields values into a location string.
 */
const parseMemberLocation = (
  location: TMemberResponse['location']
): IMember['location'] => {
  const { country, region, city } = location ?? {};

  // TODO: Use metroArea when available
  // if (metroArea) {
  //   return metroArea;
  // }

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
    return {
      valuesByFilter: [],
      availableValuesByFilter: [],
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
    // TODO: Replace with `location.metroArea` when available
    select: 'skills.title,location.continent,location.country,location.city',
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
        // TODO: Replace with `member.location.metroArea` when available
        member.location?.city ? [member.location.city] : []
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
