import { TMemberResponse } from '@protocol-labs-network/contracts';
import { IMember } from './members.types';
import {
  getMembersListOptions,
  getMembersOptionsFromQuery,
  parseMember,
  parseTeamMember,
} from './members.utils';

const memberResponseMock: TMemberResponse = {
  uid: 'uid-john-smith',
  name: 'John Smith',
  email: 'john.smith@example.com',
  plnFriend: false,
  createdAt: '2021-12-23T17:32:28.168Z',
  updatedAt: '2022-12-23T01:41:29.628Z',
  locationUid: 'uid-new-york',
};

describe('#getMembersOptionsFromQuery', () => {
  it('should return valid options when sort is provided and is valid', () => {
    expect(
      getMembersOptionsFromQuery({
        region: 'Europe',
        country: 'Portugal',
        includeFriends: 'true',
        metroArea: 'Porto',
        officeHoursOnly: 'true',
        searchBy: 'void',
        skills: 'Engineering|Leadership',
        sort: 'Name,desc',
      })
    ).toEqual({
      'location.continent__with': 'Europe',
      'location.country__with': 'Portugal',
      'location.metroArea__with': 'Porto',
      name__istartswith: 'void',
      officeHours__not: 'null',
      orderBy: '-name',
      'skills.title__with': 'Engineering,Leadership',
    });
  });

  it('should return valid options when sort is provided and is invalid', () => {
    expect(
      getMembersOptionsFromQuery({
        sort: 'invalid',
      })
    ).toEqual({
      orderBy: 'name',
      plnFriend: false,
    });
  });

  it('should return valid options when sort is not provided', () => {
    expect(
      getMembersOptionsFromQuery({
        region: 'Europe',
        country: 'Portugal',
        includeFriends: 'true',
        metroArea: 'Porto',
        officeHoursOnly: 'true',
        searchBy: 'void',
        skills: 'Engineering|Leadership',
      })
    ).toEqual({
      'location.continent__with': 'Europe',
      'location.country__with': 'Portugal',
      'location.metroArea__with': 'Porto',
      name__istartswith: 'void',
      officeHours__not: 'null',
      orderBy: 'name',
      'skills.title__with': 'Engineering,Leadership',
    });
  });

  it('should return searchBy with no whitespace at the beginning or end', () => {
    expect(
      getMembersOptionsFromQuery({
        searchBy: '  lorem ipsum  ',
      })
    ).toEqual({
      orderBy: 'name',
      plnFriend: false,
      name__istartswith: 'lorem ipsum',
    });
  });
});

describe('#getMembersListOptions', () => {
  it('should append members cards list properties to the provided options', () => {
    expect(
      getMembersListOptions({
        orderBy: '-name',
        officeHours__not: 'null',
        'location.metroarea__with': 'Porto',
      })
    ).toEqual({
      'location.metroarea__with': 'Porto',
      officeHours__not: 'null',
      orderBy: '-name',
      pagination: false,
      select:
        'uid,name,image.url,location.metroArea,location.country,location.region,skills.title,teamMemberRoles.teamLead,teamMemberRoles.mainTeam,teamMemberRoles.role,teamMemberRoles.team.name,teamMemberRoles.team.uid',
    });
  });
});

describe('parseMember', () => {
  it('should correctly parse a TMemberResponse into an IMember object', () => {
    const memberResponse = {
      ...memberResponseMock,
      discordHandler: 'jsmith#1234',
      githubHandler: 'jsmith',
      image: { url: 'https://example.com/image.jpg' },
      location: { country: 'USA', region: 'New York Region', city: 'New York' },
      officeHours: 'https://example.com/office-hours',
      skills: [
        { uid: '', createdAt: '', updatedAt: '', title: 'JavaScript' },
        { uid: '', createdAt: '', updatedAt: '', title: 'TypeScript' },
      ],
      teamMemberRoles: [
        {
          role: 'Developer',
          team: { uid: 'team-1', name: 'Team 1' },
          teamLead: true,
          mainTeam: false,
        },
        {
          role: 'Manager',
          team: { uid: 'team-2', name: 'Team 2' },
          teamLead: false,
          mainTeam: true,
        },
      ],
      twitterHandler: 'jsmith',
    } as TMemberResponse;

    const expectedResult: IMember = {
      id: 'uid-john-smith',
      name: 'John Smith',
      email: 'john.smith@example.com',
      image: 'https://example.com/image.jpg',
      githubHandle: 'jsmith',
      discordHandle: 'jsmith#1234',
      twitter: 'jsmith',
      officeHours: 'https://example.com/office-hours',
      location: 'New York, USA',
      skills: [
        {
          uid: '',
          createdAt: '',
          updatedAt: '',
          title: 'JavaScript',
        },
        {
          uid: '',
          createdAt: '',
          updatedAt: '',
          title: 'TypeScript',
        },
      ],
      teamLead: true,
      teams: [
        {
          id: 'team-1',
          name: 'Team 1',
          role: 'Developer',
          teamLead: true,
          mainTeam: false,
        },
        {
          id: 'team-2',
          name: 'Team 2',
          role: 'Manager',
          teamLead: false,
          mainTeam: true,
        },
      ],
      mainTeam: {
        id: 'team-2',
        name: 'Team 2',
        role: 'Manager',
        teamLead: false,
        mainTeam: true,
      },
    };

    expect(parseMember(memberResponse)).toEqual(expectedResult);
  });

  it('should return correct defaults when optional fields are missing', () => {
    const expectedOutput: IMember = {
      id: 'uid-john-smith',
      name: 'John Smith',
      email: 'john.smith@example.com',
      image: null,
      githubHandle: null,
      discordHandle: null,
      twitter: null,
      officeHours: null,
      location: 'Not provided',
      skills: [],
      teamLead: false,
      teams: [],
      mainTeam: null,
    };

    expect(parseMember(memberResponseMock)).toEqual(expectedOutput);
  });

  it('should return correct location string when only country is provided', () => {
    const memberResponse = {
      ...memberResponseMock,
      location: { country: 'USA' },
    } as TMemberResponse;

    const expectedOutput: IMember = {
      id: 'uid-john-smith',
      name: 'John Smith',
      email: 'john.smith@example.com',
      image: null,
      githubHandle: null,
      discordHandle: null,
      twitter: null,
      officeHours: null,
      location: 'USA',
      skills: [],
      teamLead: false,
      teams: [],
      mainTeam: null,
    };

    expect(parseMember(memberResponse)).toEqual(expectedOutput);
  });

  it('should return correct location string when country and region are provided', () => {
    const memberResponse = {
      ...memberResponseMock,
      location: { country: 'USA', region: 'New York Region' },
    } as TMemberResponse;

    const expectedOutput: IMember = {
      id: 'uid-john-smith',
      name: 'John Smith',
      email: 'john.smith@example.com',
      image: null,
      githubHandle: null,
      discordHandle: null,
      twitter: null,
      officeHours: null,
      location: 'New York Region, USA',
      skills: [],
      teamLead: false,
      teams: [],
      mainTeam: null,
    };

    expect(parseMember(memberResponse)).toEqual(expectedOutput);
  });
});

describe('parseTeamMember', () => {
  const memberResponse = {
    ...memberResponseMock,
    discordHandler: 'jsmith#1234',
    githubHandler: 'jsmith',
    image: { url: 'https://example.com/image.jpg' },
    location: { country: 'USA', region: 'New York Region', city: 'New York' },
    officeHours: 'https://example.com/office-hours',
    skills: [
      { uid: '', createdAt: '', updatedAt: '', title: 'JavaScript' },
      { uid: '', createdAt: '', updatedAt: '', title: 'TypeScript' },
    ],
    teamMemberRoles: [
      {
        role: 'Developer',
        team: { uid: 'team-1', name: 'Team 1' },
        teamLead: true,
        mainTeam: false,
      },
      {
        role: 'Manager',
        team: { uid: 'team-2', name: 'Team 2' },
        teamLead: false,
        mainTeam: true,
      },
    ],
    twitterHandler: 'jsmith',
  } as TMemberResponse;

  it('should correctly parse a TMemberResponse into an IMember object, excluding non-matching teams', () => {
    const expectedResult: IMember = {
      id: 'uid-john-smith',
      name: 'John Smith',
      email: 'john.smith@example.com',
      image: 'https://example.com/image.jpg',
      githubHandle: 'jsmith',
      discordHandle: 'jsmith#1234',
      twitter: 'jsmith',
      officeHours: 'https://example.com/office-hours',
      location: 'New York, USA',

      skills: [
        { uid: '', createdAt: '', updatedAt: '', title: 'JavaScript' },
        { uid: '', createdAt: '', updatedAt: '', title: 'TypeScript' },
      ],
      teamLead: true,
      teams: [
        {
          id: 'team-1',
          name: 'Team 1',
          role: 'Developer',
          teamLead: true,
          mainTeam: false,
        },
      ],
      mainTeam: null,
    };

    expect(parseTeamMember(memberResponse, 'team-1')).toEqual(expectedResult);
  });

  it('should correctly parse a TMemberResponse into an IMember object, excluding non-matching teams', () => {
    const expectedResult: IMember = {
      id: 'uid-john-smith',
      name: 'John Smith',
      email: 'john.smith@example.com',
      image: 'https://example.com/image.jpg',
      githubHandle: 'jsmith',
      discordHandle: 'jsmith#1234',
      twitter: 'jsmith',
      officeHours: 'https://example.com/office-hours',
      location: 'New York, USA',

      skills: [
        { uid: '', createdAt: '', updatedAt: '', title: 'JavaScript' },
        { uid: '', createdAt: '', updatedAt: '', title: 'TypeScript' },
      ],
      teamLead: false,
      teams: [
        {
          id: 'team-2',
          name: 'Team 2',
          role: 'Manager',
          teamLead: false,
          mainTeam: true,
        },
      ],
      mainTeam: {
        id: 'team-2',
        name: 'Team 2',
        role: 'Manager',
        teamLead: false,
        mainTeam: true,
      },
    };

    expect(parseTeamMember(memberResponse, 'team-2')).toEqual(expectedResult);
  });
});
