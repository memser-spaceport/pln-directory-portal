export interface IMember {
  discordHandle: string | null;
  displayName: string | null;
  email: string | null;
  id: string | null;
  image: string | null;
  name: string | null;
  role: string | null;
  twitter: string | null;
  teams: string[];
}

export interface IMemberWithTeams extends Omit<IMember, 'teams'> {
  teams: { [teamId: string]: string };
}
