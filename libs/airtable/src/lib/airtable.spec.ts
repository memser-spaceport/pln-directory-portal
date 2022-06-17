const teamMock: IAirtableTeam = {
  id: 'team_id_01',
  fields: {
    Name: 'Team 01',
    'Short description': 'Short description for Team 01',
    'Long description': 'Long description for Team 01',
    Website: 'http://team01.com/ http://team0X.com/',
    Twitter: '@team01',
    'Funding Vehicle': ['Seed'],
    'Network members': ['member_id_01'],
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

const memberMock: IAirtableMember = {
  id: 'member_id_01',
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
    Twitter: '@member01',
    'Discord Handle': '@member01',
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
const emptyMemberMock: IAirtableMember = { id: 'member_id_02', fields: {} };
const membersMock = [memberMock, emptyMemberMock];
const membersTableMock: Airtable.Table<Record<string, string>> = {
  select: jest.fn().mockReturnValue({
    all: jest.fn().mockReturnValue(membersMock),
  }),
  find: jest.fn().mockReturnValue(memberMock),
} as unknown as Airtable.Table<Record<string, string>>;

const baseFunctionMock = jest.fn((tableId: string) => {
  return tableId === 'MOCK_AIRTABLE_TEAMS_TABLE_ID'
    ? teamsTableMock
    : membersTableMock;
});
const baseMock = jest.fn(() => baseFunctionMock);
const airtableMock = jest.fn(() => ({
  base: baseMock,
}));

jest.mock('airtable', () => ({
  __esModule: true,
  default: airtableMock,
}));

import { IAirtableMember, IAirtableTeam } from '../models';
import airtableService from './airtable';
import Airtable = require('airtable');

describe('AirtableService', () => {
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
      'MOCK_AIRTABLE_MEMBERS_TABLE_ID'
    );
  });

  it('should be able to select and retrieve all teams from teams table', async () => {
    const teams = await airtableService.getTeams({
      sort: [{ field: 'Name', direction: 'asc' }],
      filterByFormula: '',
    });

    expect(teamsTableMock.select).toHaveBeenCalledTimes(1);
    expect(teamsTableMock.select).toHaveBeenCalledWith({
      sort: [{ field: 'Name', direction: 'asc' }],
      filterByFormula: '',
    });
    expect(teamsTableMock.select().all).toHaveBeenCalledTimes(1);
    expect(teams).toEqual([
      {
        filecoinUser: teamMock.fields['Filecoin User'],
        fundingStage: teamMock.fields['Funding Stage'],
        fundingVehicle: teamMock.fields['Funding Vehicle'],
        id: teamMock.id,
        industry: teamMock.fields.Industry,
        ipfsUser: teamMock.fields['IPFS User'],
        members: teamMock.fields['Network members'],
        logo: teamMock.fields.Logo?.[0].url,
        longDescription: teamMock.fields['Long description'],
        name: teamMock.fields.Name,
        shortDescription: teamMock.fields['Short description'],
        twitter: teamMock.fields.Twitter,
        website: 'http://team01.com/',
      },
      {
        filecoinUser: false,
        fundingStage: null,
        fundingVehicle: [],
        id: emptyTeamMock.id,
        industry: [],
        ipfsUser: false,
        members: [],
        logo: null,
        longDescription: null,
        name: null,
        shortDescription: null,
        twitter: null,
        website: null,
      },
    ]);
  });

  it('should be able to find and retrieve the team with the provided id on teams table', async () => {
    const team = await airtableService.getTeam(teamMock.id);

    expect(teamsTableMock.find).toHaveBeenCalledTimes(1);
    expect(teamsTableMock.find).toHaveBeenCalledWith(teamMock.id);
    expect(team).toEqual({
      filecoinUser: teamMock.fields['Filecoin User'],
      fundingStage: teamMock.fields['Funding Stage'],
      fundingVehicle: teamMock.fields['Funding Vehicle'],
      id: teamMock.id,
      industry: teamMock.fields.Industry,
      ipfsUser: teamMock.fields['IPFS User'],
      members: teamMock.fields['Network members'],
      logo: teamMock.fields.Logo?.[0].url,
      longDescription: teamMock.fields['Long description'],
      name: teamMock.fields.Name,
      shortDescription: teamMock.fields['Short description'],
      twitter: teamMock.fields.Twitter,
      website: 'http://team01.com/',
    });
  });

  it('should be able to get all teams filter values and available teams filter values from teams table', async () => {
    (teamsTableMock.select as jest.Mock)
      .mockReset()
      .mockReturnValueOnce({
        all: jest.fn().mockReturnValue([
          {
            fields: {
              Industry: ['Industry 01', 'Industry 02'],
              'Funding Stage': 'Funding Stage 01',
              'Funding Vehicle': ['Funding Vehicle 01', 'Funding Vehicle 02'],
              'IPFS User': true,
              'Filecoin User': true,
            },
          },
          {
            fields: {
              Industry: ['Industry 01', 'Industry 02', 'Industry 03'],
              'Funding Stage': 'Funding Stage 02',
              'Funding Vehicle': ['Funding Vehicle 02', 'Funding Vehicle 03'],
            },
          },
          {
            fields: {
              Industry: ['Industry 04', 'Industry 05'],
              'Funding Stage': 'Funding Stage 03',
              'Funding Vehicle': ['Funding Vehicle 04'],
            },
          },
          {
            fields: {},
          },
        ]),
      })
      .mockReturnValueOnce({
        all: jest.fn().mockReturnValue([
          {
            fields: {
              Industry: ['Industry 01', 'Industry 02'],
              'Funding Stage': 'Funding Stage 01',
              'Funding Vehicle': ['Funding Vehicle 01', 'Funding Vehicle 02'],
              'IPFS User': true,
              'Filecoin User': true,
            },
          },
          {
            fields: {
              Industry: ['Industry 01', 'Industry 02', 'Industry 03'],
              'Funding Stage': 'Funding Stage 02',
              'Funding Vehicle': ['Funding Vehicle 02', 'Funding Vehicle 03'],
            },
          },
        ]),
      });

    const filtersValues = await airtableService.getTeamsFiltersValues({
      sort: [{ field: 'Name', direction: 'asc' }],
      filterByFormula: '',
    });

    expect(filtersValues).toEqual({
      valuesByFilter: {
        industry: [
          'Industry 01',
          'Industry 02',
          'Industry 03',
          'Industry 04',
          'Industry 05',
        ],
        fundingStage: [
          'Funding Stage 01',
          'Funding Stage 02',
          'Funding Stage 03',
        ],
        fundingVehicle: [
          'Funding Vehicle 01',
          'Funding Vehicle 02',
          'Funding Vehicle 03',
          'Funding Vehicle 04',
        ],
        technology: ['Filecoin', 'IPFS'],
      },
      availableValuesByFilter: {
        industry: ['Industry 01', 'Industry 02', 'Industry 03'],
        fundingStage: ['Funding Stage 01', 'Funding Stage 02'],
        fundingVehicle: [
          'Funding Vehicle 01',
          'Funding Vehicle 02',
          'Funding Vehicle 03',
        ],
        technology: ['Filecoin', 'IPFS'],
      },
    });
  });

  it('should be able to select and retrieve all members from members table', async () => {
    const members = await airtableService.getMembers();

    expect(membersTableMock.select).toHaveBeenCalledTimes(1);
    expect(membersTableMock.select().all).toHaveBeenCalledTimes(1);
    expect(members).toEqual([
      {
        discordHandle: memberMock.fields['Discord Handle'],
        displayName: memberMock.fields['Display Name'],
        email: memberMock.fields.Email,
        id: memberMock.id,
        image: memberMock.fields['Profile picture']?.[0].url,
        name: memberMock.fields.Name,
        role: memberMock.fields.Role,
        teams: memberMock.fields.Teams,
        twitter: memberMock.fields.Twitter,
      },
      {
        discordHandle: null,
        displayName: null,
        email: null,
        id: emptyMemberMock.id,
        image: null,
        name: null,
        role: null,
        teams: [],
        twitter: null,
      },
    ]);
  });

  it('should be able to find and retrieve the member with the provided id on members table', async () => {
    const member = await airtableService.getMember(memberMock.id);

    expect(membersTableMock.find).toHaveBeenCalledTimes(1);
    expect(membersTableMock.find).toHaveBeenCalledWith(memberMock.id);
    expect(member).toEqual({
      discordHandle: memberMock.fields['Discord Handle'],
      displayName: memberMock.fields['Display Name'],
      email: memberMock.fields.Email,
      id: memberMock.id,
      image: memberMock.fields['Profile picture']?.[0].url,
      name: memberMock.fields.Name,
      role: memberMock.fields.Role,
      teams: memberMock.fields.Teams,
      twitter: memberMock.fields.Twitter,
    });
  });
});
