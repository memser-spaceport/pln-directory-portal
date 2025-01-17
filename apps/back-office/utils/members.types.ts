import { TMemberResponse } from '@protocol-labs-network/contracts';

export interface IMember {
  discordHandle: string | null;
  email: string | null;
  githubHandle: string | null;
  id: string | null;
  image: string | null;
  location: string;
  name: string | null;
  officeHours: string | null;
  skills: TMemberResponse['skills'];
  teamLead: boolean;
  teams: IMemberTeam[];
  mainTeam: IMemberTeam | null;
  twitter: string | null;
}

export interface IMemberTeam {
  id: string;
  name: string;
  role: string;
  teamLead: boolean;
  mainTeam: boolean;
}

interface Roles {
  teamUid: string;
  teamTitle: string;
  role: string;
  rowId?: number;
}

export interface Skill {
  label?: string;
  value?: string;
  uid?: string;
  title?: string;
}

interface IProjectContribution {
  projectUid: string;
  currentProject: boolean;
  description: string;
  role: string;
}

export interface IFormValues {
  name: string;
  email: string;
  requestorEmail?: string;
  imageUid: string;
  imageFile: File;
  plnStartDate: string;
  city: string;
  region: string;
  country: string;
  linkedinHandler: string;
  discordHandler: string;
  twitterHandler: string;
  githubHandler: string;
  telegramHandler: string;
  officeHours: string;
  comments: string;
  teamAndRoles: Roles[];
  skills: Skill[];
  openToWork: boolean;
  projectContributions: IProjectContribution[];
  teamOrProjectURL: string;
  isSubscribedToNewsletter: boolean
}
