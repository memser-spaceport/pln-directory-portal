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
  'Funding Vehicle'?: string[];
  'Network members'?: string[];
  Logo?: IAirtableTeamLogo[];
  Industry?: string[];
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
  industry: string[];
  fundingStage: string[];
  fundingVehicle: string[];
  technology: string[];
}
