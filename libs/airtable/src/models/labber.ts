import { IAirtableImage } from './common';

export interface IAirtableLabber {
  id: string;
  fields: IAirtableLabberFields;
}

export interface IAirtableLabberFields {
  Name?: string;
  'Display Name'?: string;
  'PLN Start Date'?: Date;
  'PLN End Date'?: Date;
  'Profile picture'?: IAirtableLabberPicture[];
  Skills?: string[];
  'Github Handle'?: string;
  'Office hours link'?: string;
  'Team lead'?: boolean;
  Teams?: string[];
  Role?: string;
  Location?: string;
  Email?: string;
  Twitter?: string;
  'Discord Handle'?: string;
  Notes?: string;
  'Date contacted'?: Date;
  'State / Province'?: string;
  Country?: string;
  City?: string;
  Created?: string;
  Technology?: string[];
  'Did we miss something?'?: string;
  'Notes INTERNAL'?: string;
  'Tagged in Discord'?: boolean;
  'What industry or industries do you specialize in?'?: string[];
  'Professional Functions'?: string[];
  'Metro Area'?: string;
  'Location backup'?: string;
  'Friend of PLN'?: boolean;
}

export interface IAirtableLabberPicture {
  id?: string;
  width?: number;
  height?: number;
  url?: string;
  filename?: string;
  size?: number;
  type?: string;
  thumbnails?: {
    small?: IAirtableImage;
    large?: IAirtableImage;
  };
}
