const teamMock: IAirtableTeam = {
  id: 'team_id_01',
  fields: {
    Name: 'Team 01',
    'Short description': 'Short description for Team 01',
    'Long description': 'Long description for Team 01',
    Website: 'http://team01.com/',
    Twitter: '@team01',
    'Funding Vehicle': ['Seed'],
    'Network members': ['labber_id_01'],
    Logo: [{ id: 'team_logo_01', url: 'http://team01.com/logo.svg' }],
    Industry: ['IT'],
    'Last Audited': new Date('28/02/1904'),
    Notes: 'Some notes.',
    'Last Modified': new Date('28/02/1904'),
    'Eligible for marketplace credits': true,
    'Grants program': true,
    Blog: 'http://team01.com/blog/',
    'IPFS User': true,
    'Filecoin User': true,
    Created: '28/02/1904',
    Video: 'http://team01.com/video.mp4',
    'Funding Stage': 'Seed',
    'Accelerator Programs': ['Outplay - Pilot'],
    'Friend of PLN': true,
  },
};
const emptyTeamMock: IAirtableTeam = { id: 'team_id_02', fields: {} };
const teamsMock = [teamMock, emptyTeamMock];
const teamsTableMock: Airtable.Table<Record<string, string>> = {
  select: jest.fn().mockReturnValue({
    all: jest.fn().mockReturnValue(teamsMock),
  }),
  find: jest.fn().mockReturnValue(teamMock),
} as unknown as Airtable.Table<Record<string, string>>;

const labberMock: IAirtableLabber = {
  id: 'labber_id_01',
  fields: {
    Name: 'Aarsh Dan Shah',
    'Display Name': 'Aarsh Shah',
    'PLN Start Date': new Date('28/02/1904'),
    'PLN End Date': new Date('28/02/1904'),
    'Profile picture': [
      {
        id: 'att2TxEATPkbk9dta',
        url: 'https://dl.airtable.com/.attachments/f3ce65a21764f91ed7a907bb330ca60e/4dbc4f0c/adam_photo2.jpg?ts=1650540687&userId=usr6bGImQsm8pYc83&cs=9de9f8e366186ad5',
      },
    ],
    Skills: ['Product'],
    'Github Handle': 'aarshkshah1992',
    'Office hours link': 'https://calendly.com/protoadin',
    'Team lead': true,
    Teams: ['team_id_01'],
    Role: 'CEO',
    Location: 'Seattle, WA',
    Email: 'aarsh.shah@protocol.ai',
    Twitter: '@labber01',
    'Discord Handle': '@labber01',
    Notes: 'Some notes.',
    'Date contacted': new Date('28/02/1904'),
    'State / Province': 'Washington',
    Country: 'United States',
    City: 'Seattle',
    Created: '28/02/1904',
    Technology: ['IPFS'],
    'Did we miss something?': 'Nope.',
    'Notes INTERNAL': 'Some notes.',
    'Tagged in Discord': true,
    'What industry or industries do you specialize in?': ['IT'],
    'Professional Functions': ['Engineering'],
    'Metro Area': 'Seattle Metro',
    'Location backup': 'Seattle, WA',
    'Friend of PLN': true,
  },
};
const emptyLabberMock: IAirtableLabber = { id: 'labber_id_02', fields: {} };
const labbersMock = [labberMock, emptyLabberMock];
const labbersTableMock: Airtable.Table<Record<string, string>> = {
  select: jest.fn().mockReturnValue({
    all: jest.fn().mockReturnValue(labbersMock),
  }),
  find: jest.fn().mockReturnValue(labberMock),
} as unknown as Airtable.Table<Record<string, string>>;

const baseFunctionMock = jest.fn((tableId: string) => {
  return tableId === 'MOCK_AIRTABLE_TEAMS_TABLE_ID'
    ? teamsTableMock
    : labbersTableMock;
});
const baseMock = jest.fn(() => baseFunctionMock);
const airtableMock = jest.fn(() => ({
  base: baseMock,
}));

jest.mock('airtable', () => ({
  __esModule: true,
  default: airtableMock,
}));

import { ILabber, ITeam } from '@protocol-labs-network/api';
import { IAirtableLabber, IAirtableTeam } from '../models';
import airtableService from './airtable';
import Airtable = require('airtable');

describe('AirtableService', () => {
  describe('when initialized', () => {
    it('should create a new Airtable instance', () => {
      expect(airtableMock).toHaveBeenCalledTimes(1);
      expect(airtableMock).toHaveBeenCalledWith({
        apiKey: 'MOCK_AIRTABLE_API_KEY',
      });
    });

    it('should get the Airtable base', () => {
      expect(baseMock).toHaveBeenCalledTimes(1);
      expect(baseMock).toHaveBeenCalledWith('MOCK_AIRTABLE_BASE_ID');
    });

    it('should get the Airtable tables', () => {
      expect(baseFunctionMock).toHaveBeenCalledTimes(2);
      expect(baseFunctionMock).toHaveBeenCalledWith(
        'MOCK_AIRTABLE_TEAMS_TABLE_ID'
      );
      expect(baseFunctionMock).toHaveBeenCalledWith(
        'MOCK_AIRTABLE_LABBERS_TABLE_ID'
      );
    });
  });

  describe('#getTeams', () => {
    let teams: ITeam[];

    beforeEach(async () => {
      teams = await airtableService.getTeams();
    });

    it('should select all teams from teams table', () => {
      expect(teamsTableMock.select).toHaveBeenCalledTimes(1);
      expect(teamsTableMock.select().all).toHaveBeenCalledTimes(1);
    });

    it('should retrieve all teams', () => {
      expect(teams).toEqual([
        {
          filecoinUser: teamMock.fields['Filecoin User'],
          fundingStage: teamMock.fields['Funding Stage'],
          fundingVehicle: teamMock.fields['Funding Vehicle'],
          id: teamMock.id,
          industry: teamMock.fields.Industry,
          ipfsUser: teamMock.fields['IPFS User'],
          labbers: teamMock.fields['Network members'],
          logo: teamMock.fields.Logo?.[0].url,
          longDescription: teamMock.fields['Long description'],
          name: teamMock.fields.Name,
          shortDescription: teamMock.fields['Short description'],
          twitter: teamMock.fields.Twitter,
          website: teamMock.fields.Website,
        },
        {
          filecoinUser: false,
          fundingStage: null,
          fundingVehicle: [],
          id: emptyTeamMock.id,
          industry: [],
          ipfsUser: false,
          labbers: [],
          logo: null,
          longDescription: null,
          name: null,
          shortDescription: null,
          twitter: null,
          website: null,
        },
      ]);
    });
  });

  describe('#getTeam', () => {
    let team: ITeam;

    beforeEach(async () => {
      team = await airtableService.getTeam(teamMock.id);
    });

    it('should find the team with the provided id on teams table', () => {
      expect(teamsTableMock.find).toHaveBeenCalledTimes(1);
      expect(teamsTableMock.find).toHaveBeenCalledWith(teamMock.id);
    });

    it('should retrieve the team with the provided id', () => {
      expect(team).toEqual({
        filecoinUser: teamMock.fields['Filecoin User'],
        fundingStage: teamMock.fields['Funding Stage'],
        fundingVehicle: teamMock.fields['Funding Vehicle'],
        id: teamMock.id,
        industry: teamMock.fields.Industry,
        ipfsUser: teamMock.fields['IPFS User'],
        labbers: teamMock.fields['Network members'],
        logo: teamMock.fields.Logo?.[0].url,
        longDescription: teamMock.fields['Long description'],
        name: teamMock.fields.Name,
        shortDescription: teamMock.fields['Short description'],
        twitter: teamMock.fields.Twitter,
        website: teamMock.fields.Website,
      });
    });
  });

  describe('#getLabbers', () => {
    let labbers: ILabber[];

    beforeEach(async () => {
      labbers = await airtableService.getLabbers();
    });

    it('should select all labbers from labbers table', () => {
      expect(labbersTableMock.select).toHaveBeenCalledTimes(1);
      expect(labbersTableMock.select().all).toHaveBeenCalledTimes(1);
    });

    it('should retrieve all labbers', () => {
      expect(labbers).toEqual([
        {
          discordHandle: labberMock.fields['Discord Handle'],
          displayName: labberMock.fields['Display Name'],
          email: labberMock.fields.Email,
          id: labberMock.id,
          image: labberMock.fields['Profile picture']?.[0].url,
          name: labberMock.fields.Name,
          role: labberMock.fields.Role,
          twitter: labberMock.fields.Twitter,
        },
        {
          discordHandle: null,
          displayName: null,
          email: null,
          id: emptyLabberMock.id,
          image: null,
          name: null,
          role: null,
          twitter: null,
        },
      ]);
    });
  });

  describe('#getLabber', () => {
    let labber: ILabber;

    beforeEach(async () => {
      labber = await airtableService.getLabber(labberMock.id);
    });

    it('should find the labber with the provided id on labbers table', () => {
      expect(labbersTableMock.find).toHaveBeenCalledTimes(1);
      expect(labbersTableMock.find).toHaveBeenCalledWith(labberMock.id);
    });

    it('should retrieve the labber with the provided id', () => {
      expect(labber).toEqual({
        discordHandle: labberMock.fields['Discord Handle'],
        displayName: labberMock.fields['Display Name'],
        email: labberMock.fields.Email,
        id: labberMock.id,
        image: labberMock.fields['Profile picture']?.[0].url,
        name: labberMock.fields.Name,
        role: labberMock.fields.Role,
        twitter: labberMock.fields.Twitter,
      });
    });
  });
});
