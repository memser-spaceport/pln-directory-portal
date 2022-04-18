import { IAirtableImage } from './common';

export interface IAirtableLabber {
  id: string;
  fields: IAirtableLabberFields;
}

export interface IAirtableLabberFields {
  Name: string;
  'Display Name': string;
  'PLN Start Date': Date;
  'PLN End Date': Date;
  'Profile picture': IAirtableLabberPicture[];
  Skills: string[];
  'Github Handle': string;
  'Office hours link': string;
  'Team lead': boolean;
  Teams: string[];
  Role: string;
  Location: string;
  Email: string;
  Twitter: string;
  'Discord Handle': string;
  Notes: string;
  'Date contacted': Date;
  'Location (text)': string;
  'Team Name': string;
}

export interface IAirtableLabberPicture {
  id: string;
  width: number;
  height: number;
  url: string;
  filename: string;
  size: number;
  type: string;
  thumbnails: {
    small: IAirtableImage;
    large: IAirtableImage;
  };
}
