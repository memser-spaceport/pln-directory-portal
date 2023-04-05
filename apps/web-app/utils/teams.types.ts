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

interface DropDownProps {
  label?: string;
  value?: string;
  uid?: string;
  title?: string;
}

export interface IFormValues {
  name: string;
  requestorEmail?: string;
  logoUid: string;
  logoFile: File;
  shortDescription: string;
  longDescription: string;
  technologies: DropDownProps[];
  fundingStage: DropDownProps;
  membershipSource: DropDownProps[];
  industryTags: DropDownProps[];
  contactMethod: string;
  website: string;
  linkedinHandler: string;
  twitterHandle: string;
  blog: string;
  officeHours: string;
}