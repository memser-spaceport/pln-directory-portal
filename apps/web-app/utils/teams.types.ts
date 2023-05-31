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
  linkedinHandle: string | null;
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
  membershipSources: DropDownProps[];
  industryTags: DropDownProps[];
  contactMethod: string;
  website: string;
  linkedinHandler: string;
  twitterHandler: string;
  telegramHandler: string;
  blog: string;
  officeHours: string;
}
