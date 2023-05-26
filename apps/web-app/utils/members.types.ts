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
  openToWork: boolean;
  linkedinHandle: string | null;
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

interface Skill {
  label?: string;
  value?: string;
  uid?: string;
  title?: string;
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
  officeHours: string;
  comments: string;
  teamAndRoles: Roles[];
  skills: Skill[];
  openToWork: boolean;
}

export interface IGitRepositories {
  name: string;
  description: string;
  url: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemberProfileProjectsProps {
  repositories: IGitRepositories[];
}
