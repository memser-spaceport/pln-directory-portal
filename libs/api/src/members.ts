export interface IMember {
  discordHandle: string | null;
  email: string | null;
  githubHandle: string | null;
  id: string | null;
  image: string | null;
  location: string;
  name: string | null;
  officeHours: string | null;
  role: string | null;
  skills: string[];
  teamLead: boolean;
  teams: IMemberTeam[];
  twitter: string | null;
}

export interface IMemberTeam {
  id: string;
  name: string;
}
