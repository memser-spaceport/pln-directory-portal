import { IMember } from '@protocol-labs-network/api';
import { TMemberResponse } from '@protocol-labs-network/contracts';
import { client } from '@protocol-labs-network/shared/data-access';

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

  // TODO: Change memberRole, teamLead & memberTeams lines during code cleanup and removal of the Airtable layer
  // to fully take advantage of the new relationships between teams and members.
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
    teams: memberTeams || [],
  };
};

/**
 * Parse member location fields values into a location string.
 */
const parseMemberLocation = (
  location: TMemberResponse['location']
): IMember['location'] => {
  const { city, country } = location ?? {};

  if (city && country) {
    return `${city}, ${country}`;
  } else if (city) {
    return city;
  } else if (country) {
    return country;
  } else {
    return 'Not provided';
  }
};
