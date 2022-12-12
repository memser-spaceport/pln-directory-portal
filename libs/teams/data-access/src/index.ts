import { ITeam } from '@protocol-labs-network/api';
import { TTeamResponse } from '@protocol-labs-network/contracts';
import { client } from '@protocol-labs-network/shared/data-access';
import { TTeamListOptions } from './teams.types';

/**
 * Get teams list from API
 */
export const getTeams = async (options: TTeamListOptions) => {
  const { body, status } = await client.teams.getTeams({
    query: {
      ...options,
      pagination: false,
      distinct: 'name', // TODO: remove this when the API is fixed
    },
  });

  const teams = status === 200 ? body.map((team) => parseTeam(team)) : [];

  return { teams, status };
};

/**
 * Get team details from API
 */
export const getTeam = async (id: string) => {
  const { body, status } = await client.teams.getTeam({
    params: { uid: id },
  });

  const team = status === 200 ? parseTeam(body) : [];

  return { team, status };
};

/**
 * Parse team fields values into a team object.
 **/
const parseTeam = (team: TTeamResponse): ITeam => {
  const {
    uid: id,
    name,
    logo,
    website,
    twitterHandler: twitter,
    shortDescription,
    longDescription,
    technologies,
    acceleratorPrograms,
    industryTags: tags,
    fundingStage,
    members,
  } = team;

  const filecoinUser = technologies
    ? technologies.some((technology) => technology.title === 'Filecoin')
    : false;
  const ipfsUser = technologies
    ? technologies.some((technology) => technology.title === 'IPFS')
    : false;

  return {
    id,
    name,
    logo: logo || null,
    website: website || null,
    twitter: twitter || null,
    shortDescription: shortDescription || null,
    longDescription: longDescription || null,
    filecoinUser,
    ipfsUser,
    fundingStage: fundingStage?.title || null,
    acceleratorPrograms: acceleratorPrograms?.length
      ? acceleratorPrograms.map((program) => program.title)
      : [],
    tags: tags?.length ? tags.map((tag) => tag.title) : [],
    members: members?.length ? members.map((member) => member.uid) : [],
  };
};
