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

const memberMock01: IAirtableMember = {
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
    'Discord handle': '@member01',
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
const memberMock02: IAirtableMember = {
  id: 'member_id_02',
  fields: {
    Name: 'John Doe',
    Country: 'United Kingdom',
    City: 'London',
  },
};
const memberMock03: IAirtableMember = {
  id: 'member_id_03',
  fields: {
    Name: 'Jane Doe',
    Country: 'Portugal',
    'State / Province': 'Aveiro',
  },
};
const memberMock04: IAirtableMember = {
  id: 'member_id_04',
  fields: {
    Name: 'Ayrton Senna',
    Country: 'Brazil',
  },
};
const emptyMemberMock: IAirtableMember = { id: 'member_id_02', fields: {} };
const membersMock = [
  memberMock01,
  memberMock02,
  memberMock03,
  memberMock04,
  emptyMemberMock,
];
const membersTableMock: Airtable.Table<Record<string, string>> = {
  select: jest.fn().mockReturnValue({
    all: jest.fn().mockReturnValue(membersMock),
  }),
  find: jest.fn().mockReturnValue(memberMock01),
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
    (<jest.Mock>teamsTableMock.select().all).mockClear();
    (<jest.Mock>teamsTableMock.select).mockClear();

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
    (<jest.Mock>teamsTableMock.find).mockClear();

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

  it('should be able to get teams details with the provided id from teams table', async () => {
    (teamsTableMock.select as jest.Mock).mockClear().mockReturnValueOnce({
      all: jest.fn().mockReturnValue([
        {
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
          },
        },
        {
          id: 'team_id_02',
          fields: {
            Name: 'Team 02',
            'Short description': 'Short description for Team 02',
            'Long description': 'Long description for Team 02',
            Website: 'http://team02.com/ http://team0X.com/',
            Twitter: '@team02',
            'Funding Vehicle': ['Seed'],
            'Network members': ['member_id_02'],
            Logo: [{ id: 'team_logo_02', url: 'http://team02.com/logo.svg' }],
            Industry: ['IT'],
            'Last Audited': new Date('28/02/1904'),
            Notes: 'Some notes.',
            'Last Modified': new Date('28/02/1904'),
            'Eligible for marketplace credits': true,
            'Grants program': true,
          },
        },
      ]),
    });

    const teams = await airtableService.getTeamCardsData([
      'team_id_01',
      'team_id_02',
    ]);

    expect(teamsTableMock.select).toHaveBeenCalledWith({
      filterByFormula:
        'AND(AND({Name} != "", {Short description} != ""), OR(RECORD_ID()=\'team_id_01\', RECORD_ID()=\'team_id_02\'))',
      fields: [
        'Name',
        'Logo',
        'Short description',
        'Industry',
        'Website',
        'Twitter',
      ],
      sort: [{ direction: 'asc', field: 'Name' }],
    });

    expect(teams).toEqual([
      {
        id: 'team_id_01',
        logo: 'http://team01.com/logo.svg',
        longDescription: 'Long description for Team 01',
        members: ['member_id_01'],
        name: 'Team 01',
        shortDescription: 'Short description for Team 01',
        twitter: '@team01',
        website: 'http://team01.com/',
        fundingStage: null,
        filecoinUser: false,
        fundingVehicle: ['Seed'],
        industry: ['IT'],
        ipfsUser: false,
      },
      {
        id: 'team_id_02',
        logo: 'http://team02.com/logo.svg',
        longDescription: 'Long description for Team 02',
        members: ['member_id_02'],
        name: 'Team 02',
        shortDescription: 'Short description for Team 02',
        twitter: '@team02',
        website: 'http://team02.com/',
        fundingStage: null,
        filecoinUser: false,
        fundingVehicle: ['Seed'],
        industry: ['IT'],
        ipfsUser: false,
      },
    ]);
  });

  it('should be able to get all teams filter values and available teams filter values from teams table', async () => {
    (teamsTableMock.select as jest.Mock)
      .mockClear()
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
      filterByFormula: '',
    });

    expect(teamsTableMock.select).toHaveBeenCalledTimes(2);
    expect(teamsTableMock.select).toHaveBeenNthCalledWith(1, {
      fields: [
        'Industry',
        'Funding Stage',
        'Funding Vehicle',
        'IPFS User',
        'Filecoin User',
      ],
    });
    expect(teamsTableMock.select).toHaveBeenNthCalledWith(2, {
      fields: [
        'Industry',
        'Funding Stage',
        'Funding Vehicle',
        'IPFS User',
        'Filecoin User',
      ],
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
    (<jest.Mock>membersTableMock.select().all).mockClear();
    (<jest.Mock>membersTableMock.select).mockClear();

    const members = await airtableService.getMembers();

    expect(membersTableMock.select).toHaveBeenCalledTimes(1);
    expect(membersTableMock.select().all).toHaveBeenCalledTimes(1);
    expect(members).toEqual([
      {
        discordHandle: memberMock01.fields['Discord handle'],
        displayName: memberMock01.fields['Display Name'],
        email: memberMock01.fields.Email,
        githubHandle: memberMock01.fields['Github Handle'],
        id: memberMock01.id,
        image: memberMock01.fields['Profile picture']?.[0].url,
        location: memberMock01.fields['Metro Area'],
        name: memberMock01.fields.Name,
        officeHours: memberMock01.fields['Office hours link'],
        role: memberMock01.fields.Role,
        skills: [memberMock01.fields.Skills?.[0]],
        teams: memberMock01.fields.Teams,
        twitter: memberMock01.fields.Twitter,
      },
      {
        discordHandle: null,
        displayName: null,
        email: null,
        githubHandle: null,
        id: memberMock02.id,
        image: null,
        location: `${memberMock02.fields.City}, ${memberMock02.fields.Country}`,
        name: memberMock02.fields.Name,
        officeHours: null,
        role: null,
        skills: [],
        teams: [],
        twitter: null,
      },
      {
        discordHandle: null,
        displayName: null,
        email: null,
        githubHandle: null,
        id: memberMock03.id,
        image: null,
        location: `${memberMock03.fields['State / Province']}, ${memberMock03.fields.Country}`,
        name: memberMock03.fields.Name,
        officeHours: null,
        role: null,
        skills: [],
        teams: [],
        twitter: null,
      },
      {
        discordHandle: null,
        displayName: null,
        email: null,
        githubHandle: null,
        id: memberMock04.id,
        image: null,
        location: memberMock04.fields.Country,
        name: memberMock04.fields.Name,
        officeHours: null,
        role: null,
        skills: [],
        teams: [],
        twitter: null,
      },
      {
        discordHandle: null,
        displayName: null,
        email: null,
        githubHandle: null,
        id: emptyMemberMock.id,
        image: null,
        location: 'Not provided',
        name: null,
        officeHours: null,
        role: null,
        skills: [],
        teams: [],
        twitter: null,
      },
    ]);
  });

  it('should be able to find and retrieve the member with the provided id on members table', async () => {
    (<jest.Mock>membersTableMock.find).mockClear();

    const member = await airtableService.getMember(memberMock01.id);

    expect(membersTableMock.find).toHaveBeenCalledTimes(1);
    expect(membersTableMock.find).toHaveBeenCalledWith(memberMock01.id);
    expect(member).toEqual({
      discordHandle: memberMock01.fields['Discord handle'],
      displayName: memberMock01.fields['Display Name'],
      email: memberMock01.fields.Email,
      githubHandle: memberMock01.fields['Github Handle'],
      id: memberMock01.id,
      image: memberMock01.fields['Profile picture']?.[0].url,
      location: memberMock01.fields['Metro Area'],
      name: memberMock01.fields.Name,
      officeHours: memberMock01.fields['Office hours link'],
      role: memberMock01.fields.Role,
      skills: [memberMock01.fields.Skills?.[0]],
      teams: memberMock01.fields.Teams,
      twitter: memberMock01.fields.Twitter,
    });
  });

  it('should be able to get all members filter values and available members filter values from members table', async () => {
    (membersTableMock.select as jest.Mock)
      .mockClear()
      .mockReturnValueOnce({
        all: jest.fn().mockReturnValue([
          {
            fields: {
              Skills: ['Skill 01', 'Skill 02'],
              Country: 'Country 01',
              'Metro Area': 'Metro Area 01',
            },
          },
          {
            fields: {
              Skills: ['Skill 01', 'Skill 02', 'Skill 03'],
              Country: 'Country 02',
              'Metro Area': 'Metro Area 02',
            },
          },
          {
            fields: {
              Skills: ['Skill 04', 'Skill 05'],
              Country: 'Country 03',
              'Metro Area': 'Metro Area 03',
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
              Skills: ['Skill 01', 'Skill 02'],
              Country: 'Country 01',
              'Metro Area': 'Metro Area 01',
            },
          },
          {
            fields: {
              Skills: ['Skill 01', 'Skill 02', 'Skill 03'],
              Country: 'Country 02',
              'Metro Area': 'Metro Area 02',
            },
          },
        ]),
      });

    const filtersValues = await airtableService.getMembersFiltersValues({
      filterByFormula: '',
    });

    expect(membersTableMock.select).toHaveBeenCalledTimes(2);
    expect(membersTableMock.select).toHaveBeenNthCalledWith(1, {
      fields: ['Skills', 'Country', 'Metro Area'],
    });
    expect(membersTableMock.select).toHaveBeenNthCalledWith(2, {
      fields: ['Skills', 'Country', 'Metro Area'],
      filterByFormula: '',
    });

    expect(filtersValues).toEqual({
      valuesByFilter: {
        skills: ['Skill 01', 'Skill 02', 'Skill 03', 'Skill 04', 'Skill 05'],
        country: ['Country 01', 'Country 02', 'Country 03'],
        metroArea: ['Metro Area 01', 'Metro Area 02', 'Metro Area 03'],
      },
      availableValuesByFilter: {
        skills: ['Skill 01', 'Skill 02', 'Skill 03'],
        country: ['Country 01', 'Country 02'],
        metroArea: ['Metro Area 01', 'Metro Area 02'],
      },
    });
  });

  it('should be able to return members with the teams they belong to, identified by an id and name', async () => {
    (membersTableMock.select as jest.Mock).mockClear().mockReturnValueOnce({
      all: jest.fn().mockReturnValue([
        {
          id: 'member_id_01',
          fields: {
            Name: 'Aarsh Dan Shah',
            'Display Name': 'Aarsh Shah',
            'Profile picture': [
              {
                id: 'att2TxEATPkbk9dta',
                url: 'https://dl.airtable.com/.attachments/f3ce65a21764f91ed7a907bb330ca60e/4dbc4f0c/adam_photo2.jpg?ts=1650540687&userId=usr6bGImQsm8pYc83&cs=9de9f8e366186ad5',
              },
            ],
            Teams: ['team_id_01', 'team_id_02'],
            Role: 'CEO',
            Email: 'aarsh.shah@protocol.ai',
            Twitter: '@member01',
            'Discord handle': 'member01#123',
            'Github Handle': 'member01',
            'Office hours link': 'https://calendly.com/protoadin',
          },
        },
        {
          id: 'member_id_02',
          fields: {
            Name: 'Dan Shah',
            'Display Name': 'Dan Shah',
            'Profile picture': [
              {
                id: 'att2TxEATPkbk9dta',
                url: '',
              },
            ],
            Teams: ['team_id_03'],
            Role: 'CEO',
            Email: 'dan.shah@protocol.ai',
            Twitter: '@member01',
            'Discord handle': 'member02#123',
            'Github Handle': 'member02',
          },
        },
        {
          id: 'member_id_03',
          fields: {
            Name: 'Shah',
            'Display Name': 'Shah',
            'Profile picture': [
              {
                id: 'att2TxEATPkbk9dta',
                url: 'https://dl.airtable.com/.attachments/f3ce65a21764f91ed7a907bb330ca60e/4dbc4f0c/adam_photo2.jpg?ts=1650540687&userId=usr6bGImQsm8pYc83&cs=9de9f8e366186ad5',
              },
            ],
            Teams: ['team_id_02', 'team_id_01'],
            Role: 'CEO',
            Email: 'shah@protocol.ai',
            Twitter: '@member03',
            'Discord handle': 'member03#123',
            'Github Handle': 'member03',
          },
        },
      ]),
    });

    (teamsTableMock.select as jest.Mock).mockClear().mockReturnValueOnce({
      all: jest.fn().mockReturnValue([
        {
          id: 'team_id_01',
          fields: {
            Name: 'Team 01',
          },
        },
        {
          id: 'team_id_02',
          fields: {
            Name: 'Team 02',
          },
        },
        {
          id: 'team_id_03',
          fields: {
            Name: 'Team 03',
          },
        },
        {
          id: 'team_id_04',
          fields: {
            Name: 'Team 04',
          },
        },
      ]),
    });

    const members = await airtableService.getTeamMembers('Team 01');

    expect(membersTableMock.select).toHaveBeenCalledTimes(1);
    expect(membersTableMock.select).toHaveBeenCalledWith({
      filterByFormula: 'SEARCH("Team 01",Teams)',
      fields: [
        'Name',
        'Role',
        'Profile picture',
        'Email',
        'Twitter',
        'Teams',
        'Github Handle',
        'Discord handle',
      ],
      sort: [{ field: 'Name', direction: 'asc' }],
    });

    expect(teamsTableMock.select).toHaveBeenCalledTimes(1);
    expect(teamsTableMock.select).toHaveBeenCalledWith({
      filterByFormula:
        "AND(AND({Name} != \"\", {Short description} != \"\"), OR(RECORD_ID()='team_id_01', RECORD_ID()='team_id_02', RECORD_ID()='team_id_03'))",
      fields: ['Name'],
    });

    expect(members).toStrictEqual([
      {
        discordHandle: 'member01#123',
        displayName: 'Aarsh Shah',
        email: 'aarsh.shah@protocol.ai',
        githubHandle: 'member01',
        id: 'member_id_01',
        image:
          'https://dl.airtable.com/.attachments/f3ce65a21764f91ed7a907bb330ca60e/4dbc4f0c/adam_photo2.jpg?ts=1650540687&userId=usr6bGImQsm8pYc83&cs=9de9f8e366186ad5',
        location: 'Not provided',
        name: 'Aarsh Dan Shah',
        officeHours: 'https://calendly.com/protoadin',
        role: 'CEO',
        skills: [],
        teams: { team_id_01: 'Team 01', team_id_02: 'Team 02' },
        twitter: '@member01',
      },
      {
        discordHandle: 'member02#123',
        displayName: 'Dan Shah',
        email: 'dan.shah@protocol.ai',
        githubHandle: 'member02',
        id: 'member_id_02',
        image: null,
        location: 'Not provided',
        name: 'Dan Shah',
        officeHours: null,
        role: 'CEO',
        skills: [],
        teams: { team_id_03: 'Team 03' },
        twitter: '@member01',
      },
      {
        discordHandle: 'member03#123',
        displayName: 'Shah',
        email: 'shah@protocol.ai',
        githubHandle: 'member03',
        id: 'member_id_03',
        image:
          'https://dl.airtable.com/.attachments/f3ce65a21764f91ed7a907bb330ca60e/4dbc4f0c/adam_photo2.jpg?ts=1650540687&userId=usr6bGImQsm8pYc83&cs=9de9f8e366186ad5',
        location: 'Not provided',
        name: 'Shah',
        officeHours: null,
        role: 'CEO',
        skills: [],
        teams: { team_id_01: 'Team 01', team_id_02: 'Team 02' },
        twitter: '@member03',
      },
    ]);
  });
});
