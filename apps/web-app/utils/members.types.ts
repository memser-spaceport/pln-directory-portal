import { TMemberResponse } from '@protocol-labs-network/contracts';
import { boolean } from 'zod';

export interface IGitRepositories {
  name?: string;
  description?: string;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
}
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
  openForWork?: boolean;
  teams: IMemberTeam[];
  mainTeam: IMemberTeam | null;
  twitter: string | null;
  roles?: string[];
  leadingTeams?: string[];
  openToWork?: boolean;
  linkedinHandle: string | null;
  telegramHandle?: string | null;
  repositories: IGitRepositories[];
  preferences: IPreferences | null;
}

interface IPreferences {
  showEmail?: boolean;
  showGithubHandle?: boolean;
  showTelegram?: boolean;
  showLinkedin?: boolean;
  showDiscord?: boolean;
  showGithubProjects?: boolean;
  showTwitter?: boolean;
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
  telegramHandler: string;
  officeHours: string;
  comments: string;
  teamAndRoles: Roles[];
  skills: Skill[];
  experiences: any[];
  openToWork: boolean;
  preferences?: IPreferences | null;
}

export interface MemberProfileProjectsProps {
  repositories: IGitRepositories[];
}
