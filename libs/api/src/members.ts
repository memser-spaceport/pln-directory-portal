export interface IMember {
  discordHandle: string | null;
  displayName: string | null;
  email: string | null;
  githubHandle: string | null;
  id: string | null;
  image: string | null;
  location: string;
  name: string | null;
  role: string | null;
  skills: string[];
  teams: string[];
  twitter: string | null;
  officeHours: string | null;
}

export interface IMemberWithTeams extends Omit<IMember, 'teams'> {
  teams: { [teamId: string]: string };
}
