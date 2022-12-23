import { IAirtableImage } from './common';

export interface IAirtableTeam {
  id: string;
  fields: IAirtableTeamFields;
}

export interface IAirtableTeamFields {
  Name?: string;
  'Short description'?: string;
  'Long description'?: string;
  Website?: string;
  Twitter?: string;
  'Network members'?: string[];
  Logo?: IAirtableTeamLogo[];
  'Tags lookup'?: string[];
  'Last Audited'?: Date;
  Notes?: string;
  'Last Modified'?: Date;
  'Eligible for marketplace credits'?: boolean;
  'Grants program'?: boolean;
  Blog?: string;
  'IPFS User'?: boolean;
  'Filecoin User'?: boolean;
  Created?: string;
  Video?: string;
  'Funding Stage'?: string;
  'Accelerator Programs'?: string[];
  'Friend of PLN'?: boolean;
  'Preferred Method of Contact'?: string;
}

export interface IAirtableTeamLogo {
  id: string;
  width?: number;
  height?: number;
  url?: string;
  filename?: string;
  size?: number;
  type?: string;
  thumbnails?: {
    small?: IAirtableImage;
    large?: IAirtableImage;
    full?: IAirtableImage;
  };
}

export interface IAirtableTeamsFiltersValues {
  tags: string[];
  acceleratorPrograms: string[];
  fundingStage: string[];
  technology: string[];
}
