export interface ITeam {
  filecoinUser: boolean;
  fundingStage: string | null;
  acceleratorPrograms: string[];
  id: string;
  tags: string[];
  ipfsUser: boolean;
  members: string[];
  logo: string | null;
  longDescription: string | null;
  name: string | null;
  shortDescription: string | null;
  twitter: string | null;
  website: string | null;
}
