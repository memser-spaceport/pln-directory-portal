import { TTeamResponse } from '@protocol-labs-network/contracts';

export interface ITeam {
  filecoinUser: boolean;
  fundingStage: string | null;
  membershipSources: string[];
  id: string;
  industryTags: TTeamResponse['industryTags'];
  ipfsUser: boolean;
  members: string[];
  logo: string | null;
  longDescription: string | null;
  name: string | null;
  shortDescription: string | null;
  twitter: string | null;
  contactMethod: string | null;
  website: string | null;
}
