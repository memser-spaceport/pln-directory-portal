import { IMember } from '@protocol-labs-network/api';

import { TMemberResponse } from '@protocol-labs-network/contracts';
import { client } from '@protocol-labs-network/shared/data-access';
import { getMember, getMembers, getMembersFilters, parseMember } from './index';

jest.mock('@protocol-labs-network/shared/data-access', () => ({
  client: {
    members: {
      getMember: jest.fn(),
      getMembers: jest.fn(),
    },
  },
}));

const memberResponseMock: TMemberResponse = {
  uid: 'uid-john-smith',
  name: 'John Smith',
  email: 'john.smith@example.com',
  plnFriend: false,
  createdAt: '2021-12-23T17:32:28.168Z',
  updatedAt: '2022-12-23T01:41:29.628Z',
  locationUid: 'uid-new-york',
};

describe('getMembers', () => {
  it('should call getMembers appropriately', async () => {
    (<jest.Mock>client.members.getMembers).mockClear().mockReturnValueOnce({
      body: [memberResponseMock],
      status: 200,
    });

    const options = {
      'skills.title__with': 'Engineering',
    };
    const response = await getMembers(options);

    expect(client.members.getMembers).toHaveBeenCalledWith({
      query: options,
    });
    expect(response).toEqual({
      body: [memberResponseMock],
      status: 200,
    });
  });
});

describe('getMember', () => {
  it('should call getMember appropriately', async () => {
    (<jest.Mock>client.members.getMember).mockClear().mockReturnValueOnce({
      body: memberResponseMock,
      status: 200,
    });

    const id = memberResponseMock.uid;
    const response = await getMember(id);

    expect(client.members.getMember).toBeCalledWith({
      params: { uid: id },
      query: {},
    });
    expect(response).toEqual({
      body: memberResponseMock,
      status: 200,
    });
  });

  it('should call getMember appropriately', async () => {
    (<jest.Mock>client.members.getMember).mockClear().mockReturnValueOnce({
      body: memberResponseMock,
      status: 200,
    });

    const options = { select: 'name' };
    const id = memberResponseMock.uid;
    const response = await getMember(id, options);

    expect(client.members.getMember).toBeCalledWith({
      params: { uid: id },
      query: options,
    });
    expect(response).toEqual({
      body: memberResponseMock,
      status: 200,
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
      skills: [{ title: 'JavaScript' }, { title: 'TypeScript' }],
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

      skills: ['JavaScript', 'TypeScript'],
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

describe('getMembersFilters', () => {
  const options = {
    'skills.title__with': 'Skill 01',
  };

  const member01 = {
    skills: [{ title: 'Skill 1' }, { title: 'Skill 2' }],
    location: {
      continent: 'Continent 1',
      country: 'Country 1',
      city: 'City 1',
    },
  } as TMemberResponse;
  const member02 = {
    skills: [{ title: 'Skill 2' }, { title: 'Skill 3' }],
    location: {
      continent: 'Continent 2',
      country: 'Country 2',
      city: 'City 2',
    },
  } as TMemberResponse;

  it('should return the correct values and available values for members filters when the API returns a successful response', async () => {
    (<jest.Mock>client.members.getMembers)
      .mockClear()
      .mockReturnValueOnce({
        body: [member01, member02, {}],
        status: 200,
      })
      .mockReturnValueOnce({
        body: [member01],
        status: 200,
      });

    const result = await getMembersFilters(options);

    expect(client.members.getMembers).toHaveBeenCalledTimes(2);
    expect(client.members.getMembers).toHaveBeenNthCalledWith(1, {
      query: {
        pagination: false,
        select:
          'skills.title,location.continent,location.country,location.city',
      },
    });
    expect(client.members.getMembers).toHaveBeenNthCalledWith(2, {
      query: {
        'skills.title__with': 'Skill 01',
        pagination: false,
        select:
          'skills.title,location.continent,location.country,location.city',
      },
    });

    const expectedResult = {
      valuesByFilter: {
        skills: ['Skill 1', 'Skill 2', 'Skill 3'],
        region: ['Continent 1', 'Continent 2'],
        country: ['Country 1', 'Country 2'],
        metroArea: ['City 1', 'City 2'],
      },
      availableValuesByFilter: {
        skills: ['Skill 1', 'Skill 2'],
        region: ['Continent 1'],
        country: ['Country 1'],
        metroArea: ['City 1'],
      },
    };

    expect(result).toEqual(expectedResult);
  });

  it('should return empty filters if the API returns a non-200 status code', async () => {
    (<jest.Mock>client.members.getMembers)
      .mockClear()
      .mockReturnValueOnce({
        body: [],
        status: 404,
      })
      .mockReturnValueOnce({
        body: [{}],
        status: 200,
      });

    const result = await getMembersFilters(options);

    const expectedResult = {
      valuesByFilter: [],
      availableValuesByFilter: [],
    };

    expect(result).toEqual(expectedResult);
  });
});
