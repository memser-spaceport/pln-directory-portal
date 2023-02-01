import { TTeamResponse } from '@protocol-labs-network/contracts';

export interface ITeam {
  id: string;
  logo: string | null;
  name: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  website: string | null;
  twitter: string | null;
  contactMethod: string | null;
  fundingStage: string | null;
  membershipSources: TTeamResponse['membershipSources'];
  industryTags: TTeamResponse['industryTags'];
  technologies: TTeamResponse['technologies'];
  members: string[];
}
