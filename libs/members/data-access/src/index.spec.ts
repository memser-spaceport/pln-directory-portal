import { IMember } from '@protocol-labs-network/api';
import { TMemberResponse } from '@protocol-labs-network/contracts';
import { client } from '@protocol-labs-network/shared/data-access';
import { getMember, getMembers, parseMember } from './index';

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
    (<jest.Mock>client.members.getMembers).mockReturnValueOnce({
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
    (<jest.Mock>client.members.getMember).mockReturnValueOnce({
      body: memberResponseMock,
      status: 200,
    });

    const id = memberResponseMock.uid;
    const response = await getMember(id);

    expect(client.members.getMember).toBeCalledWith({
      params: { uid: id },
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
      location: { city: 'New York', country: 'USA' },
      officeHours: 'https://example.com/office-hours',
      skills: [{ title: 'JavaScript' }, { title: 'TypeScript' }],
      teamMemberRoles: [
        {
          role: { title: 'Developer' },
          team: { uid: 'team-1', name: 'Team 1' },
          teamLead: true,
        },
        {
          role: { title: 'Manager' },
          team: { uid: 'team-2', name: 'Team 2' },
          teamLead: false,
        },
      ],
      twitterHandler: 'jsmith',
    } as TMemberResponse;

    const expectedResult: IMember = {
      id: 'uid-john-smith',
      name: 'John Smith',
      displayName: 'John Smith',
      email: 'john.smith@example.com',
      image: 'https://example.com/image.jpg',
      githubHandle: 'jsmith',
      discordHandle: 'jsmith#1234',
      twitter: 'jsmith',
      officeHours: 'https://example.com/office-hours',
      location: 'New York, USA',
      skills: ['JavaScript', 'TypeScript'],
      role: 'Developer,Manager',
      teamLead: true,
      teams: [
        { id: 'team-1', name: 'Team 1' },
        { id: 'team-2', name: 'Team 2' },
      ],
    };

    expect(parseMember(memberResponse)).toEqual(expectedResult);
  });

  it('should return correct defaults when optional fields are missing', () => {
    const expectedOutput: IMember = {
      id: 'uid-john-smith',
      name: 'John Smith',
      displayName: 'John Smith',
      email: 'john.smith@example.com',
      image: null,
      githubHandle: null,
      discordHandle: null,
      twitter: null,
      officeHours: null,
      location: 'Not provided',
      skills: [],
      role: null,
      teamLead: false,
      teams: [],
    };

    expect(parseMember(memberResponseMock)).toEqual(expectedOutput);
  });

  it('should return correct location string when only city is provided', () => {
    const memberResponse = {
      ...memberResponseMock,
      location: { city: 'New York' },
    } as TMemberResponse;

    const expectedOutput: IMember = {
      id: 'uid-john-smith',
      name: 'John Smith',
      displayName: 'John Smith',
      email: 'john.smith@example.com',
      image: null,
      githubHandle: null,
      discordHandle: null,
      twitter: null,
      officeHours: null,
      location: 'New York',
      skills: [],
      role: null,
      teamLead: false,
      teams: [],
    };

    expect(parseMember(memberResponse)).toEqual(expectedOutput);
  });

  it('should return correct location string when only country is provided', () => {
    const memberResponse = {
      ...memberResponseMock,
      location: { country: 'USA' },
    } as TMemberResponse;

    const expectedOutput: IMember = {
      id: 'uid-john-smith',
      name: 'John Smith',
      displayName: 'John Smith',
      email: 'john.smith@example.com',
      image: null,
      githubHandle: null,
      discordHandle: null,
      twitter: null,
      officeHours: null,
      location: 'USA',
      skills: [],
      role: null,
      teamLead: false,
      teams: [],
    };

    expect(parseMember(memberResponse)).toEqual(expectedOutput);
  });
});
