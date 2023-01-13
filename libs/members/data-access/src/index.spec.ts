import { IMember } from '@protocol-labs-network/api';

const memberMock: TMemberResponse = {
  uid: 'uid-lucy',
  name: 'Lucy',
  email: 'Joshuah_Anderson@yahoo.com',
  imageUid: 'uid-82',
  githubHandler: 'Lucy.Weber79',
  discordHandler: 'Lucy.Bradtke26',
  twitterHandler: 'Lucy_Crona',
  officeHours: 'https://immaterial-subset.com',
  plnFriend: false,
  createdAt: '2021-12-23T17:32:28.168Z',
  updatedAt: '2022-12-23T01:41:29.628Z',
  locationUid: 'uid-halmouth',
  image: {
    uid: 'uid-82',
    cid: 'cid-82',
    width: 33,
    height: 142,
    url: 'https://loremflickr.com/640/480/animals',
    filename: 'filename-82',
    size: 314,
    type: 'PNG',
    version: 'ORIGINAL',
    thumbnailToUid: null,
    createdAt: '2022-10-12T13:47:51.649Z',
    updatedAt: '2022-12-22T14:18:21.895Z',
  },
  location: {
    uid: 'uid-halmouth',
    city: 'Halmouth',
    country: 'Democratic Republic of the Congo',
    continent: 'Africa',
    region: 'West Virginia',
    regionAbbreviation: 'NY',
    placeId: 'placeId-halmouth',
    metroArea: 'Halmouth',
    latitude: -49.1688,
    longitude: -136.4366,
    createdAt: '2022-12-11T06:41:19.453Z',
    updatedAt: '2022-12-22T14:11:41.837Z',
  },
  teamMemberRoles: [
    {
      mainRole: true,
      teamLead: false,
      member: {
        uid: 'uid-lucy',
        name: 'Lucy',
        email: 'Joshuah_Anderson@yahoo.com',
        imageUid: 'uid-82',
        githubHandler: 'Lucy.Weber79',
        discordHandler: 'Lucy.Bradtke26',
        twitterHandler: 'Lucy_Crona',
        officeHours: 'https://immaterial-subset.com',
        plnFriend: false,
        createdAt: '2021-12-23T17:32:28.168Z',
        updatedAt: '2022-12-23T01:41:29.628Z',
        locationUid: 'uid-halmouth',
      },
      role: {
        uid: 'uid-film-executive-producer',
        title: 'Film Executive Producer',
        description: null,
        startDate: new Date('2022-02-27T07:26:59.029Z'),
        endDate: null,
        createdAt: new Date('2022-09-18T01:30:43.969Z'),
        updatedAt: new Date('2022-12-22T21:19:49.085Z'),
      },
      team: {
        uid: 'uid-dubuque---pfeffer',
        name: 'DuBuque - Pfeffer',
        logoUid: 'uid-54',
        blog: 'https://bold-destroyer.info',
        website: 'https://bad-scam.biz',
        twitterHandler: 'Yazmin',
        shortDescription:
          'Exercitationem voluptas sunt id ad voluptatem sit aut.',
        longDescription:
          'Ex nihil quia. Commodi reprehenderit qui aspernatur. Necessitatibus odio voluptas incidunt enim tenetur. Distinctio ut consequatur provident labore eveniet nisi dolores eligendi. At voluptates sunt tempora qui. Fugit nihil quisquam voluptatem consectetur autem.',
        plnFriend: false,
        startDate: '2022-07-19T15:14:04.546Z',
        endDate: '2022-12-23T07:08:34.014Z',
        createdAt: '2022-10-20T21:51:42.988Z',
        updatedAt: '2022-12-22T22:37:15.365Z',
        fundingStageUid: 'uid-pre-seed',
        filecoinUser: true,
        ipfsUser: false,
      },
    },
    {
      mainRole: true,
      teamLead: false,
      member: {
        uid: 'uid-lucy',
        name: 'Lucy',
        email: 'Joshuah_Anderson@yahoo.com',
        imageUid: 'uid-82',
        githubHandler: 'Lucy.Weber79',
        discordHandler: 'Lucy.Bradtke26',
        twitterHandler: 'Lucy_Crona',
        officeHours: 'https://immaterial-subset.com',
        plnFriend: false,
        createdAt: '2021-12-23T17:32:28.168Z',
        updatedAt: '2022-12-23T01:41:29.628Z',
        locationUid: 'uid-halmouth',
      },
      role: {
        uid: 'uid-dj',
        title: 'DJ',
        description: null,
        startDate: new Date('2022-04-08T13:47:31.755Z'),
        endDate: null,
        createdAt: new Date('2022-05-27T15:03:30.750Z'),
        updatedAt: new Date('2022-12-23T08:26:36.438Z'),
      },
      team: {
        uid: 'uid-ebert-tremblay-and-kling',
        name: 'Ebert, Tremblay and Kling',
        logoUid: 'uid-78',
        blog: 'http://wealthy-trend.net',
        website: 'http://square-button.name',
        twitterHandler: 'Palma',
        shortDescription:
          'Beatae id illum minima quidem tempora ab molestiae consectetur hic.',
        longDescription:
          'Doloremque voluptatum adipisci est sunt. Quasi et omnis voluptates quasi animi. Quia consequatur error voluptatem assumenda nemo ea ducimus. Blanditiis et eveniet cum animi sit.',
        plnFriend: true,
        startDate: '2022-06-16T17:23:49.080Z',
        endDate: '2022-12-22T23:22:05.997Z',
        createdAt: '2022-04-02T22:21:10.673Z',
        updatedAt: '2022-12-22T13:48:05.761Z',
        fundingStageUid: 'uid-series-d',
        filecoinUser: true,
        ipfsUser: true,
      },
    },
  ],
  skills: [
    {
      uid: 'uid-engineering',
      title: 'Engineering',
      description: 'Sit consequatur architecto ab et eum.',
      createdAt: '2022-06-24T01:08:09.111Z',
      updatedAt: '2022-12-23T04:36:48.998Z',
    },
    {
      uid: 'uid-operations',
      title: 'Operations',
      description: 'Unde nobis blanditiis.',
      createdAt: '2022-06-25T11:04:48.941Z',
      updatedAt: '2022-12-23T04:05:26.686Z',
    },
    {
      uid: 'uid-recruiting',
      title: 'Recruiting',
      description: 'Odio esse qui error unde illum.',
      createdAt: '2022-03-08T13:42:38.106Z',
      updatedAt: '2022-12-23T04:06:15.886Z',
    },
    {
      uid: 'uid-research',
      title: 'Research',
      description: 'Provident modi veritatis quas assumenda sunt animi ut sed.',
      createdAt: '2022-07-13T19:50:01.492Z',
      updatedAt: '2022-12-23T08:36:43.031Z',
    },
    {
      uid: 'uid-tax',
      title: 'Tax',
      description:
        'Eaque deserunt pariatur et numquam ut aperiam quae atque adipisci.',
      createdAt: '2022-06-28T19:57:35.018Z',
      updatedAt: '2022-12-22T20:21:34.186Z',
    },
  ],
};

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
        },
        {
          role: 'Manager',
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

  it('should return correct location string when country and region are provided', () => {
    const memberResponse = {
      ...memberResponseMock,
      location: { country: 'USA', region: 'New York Region' },
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
      location: 'New York Region, USA',
      skills: [],
      role: null,
      teamLead: false,
      teams: [],
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
