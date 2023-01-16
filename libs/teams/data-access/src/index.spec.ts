import { TTeamResponse } from '@protocol-labs-network/contracts';
import { client } from '@protocol-labs-network/shared/data-access';
import { getTeam, getTeams, getTeamsFilters, parseTeam } from './index';

jest.mock('@protocol-labs-network/shared/data-access', () => ({
  client: {
    teams: {
      getTeam: jest.fn(),
      getTeams: jest.fn(),
    },
  },
}));

const teamResponseMock: TTeamResponse = {
  uid: 'team-01',
  name: 'Team 01',
  plnFriend: false,
  createdAt: '2022-09-30T23:20:06.960Z',
  updatedAt: '2022-12-22T20:36:25.081Z',
  filecoinUser: false,
  ipfsUser: false,
};

describe('getTeams', () => {
  it('should call getTeams appropriately', async () => {
    (<jest.Mock>client.teams.getTeams).mockClear().mockReturnValueOnce({
      body: [teamResponseMock],
      status: 200,
    });

    const options = {
      'technologies.title__with': 'IPFS',
    };
    const response = await getTeams(options);

    expect(client.teams.getTeams).toHaveBeenCalledWith({
      query: options,
    });
    expect(response).toEqual({
      body: [teamResponseMock],
      status: 200,
    });
  });
});

describe('getTeam', () => {
  it('should call getTeam appropriately', async () => {
    (<jest.Mock>client.teams.getTeam).mockClear().mockReturnValueOnce({
      body: teamResponseMock,
      status: 200,
    });

    const id = teamResponseMock.uid;
    const response = await getTeam(id);

    expect(client.teams.getTeam).toBeCalledWith({
      params: { uid: id },
    });
    expect(response).toEqual({
      body: teamResponseMock,
      status: 200,
    });
  });
});

describe('parseTeam', () => {
  it('should correctly parse a TTeamResponse object into an ITeam object', () => {
    const teamResponse = {
      ...teamResponseMock,
      logo: { url: 'https://myteam.com/logo.png' },
      website: 'https://myteam.com',
      twitterHandler: '@myteam',
      shortDescription: 'We build cool stuff',
      longDescription:
        'We are a team of skilled engineers who build innovative products',
      technologies: [{ title: 'Filecoin' }, { title: 'IPFS' }],
      membershipSources: [
        { title: 'Membership Source A' },
        { title: 'Membership Source B' },
      ],
      industryTags: [
        { title: 'Software Development' },
        { title: 'Blockchain' },
      ],
      fundingStage: { title: 'Seed' },
      teamMemberRoles: [{ member: { uid: '456' } }, { member: { uid: '789' } }],
    } as TTeamResponse;

    const expectedResult = {
      id: 'team-01',
      name: 'Team 01',
      logo: 'https://myteam.com/logo.png',
      website: 'https://myteam.com',
      twitter: '@myteam',
      shortDescription: 'We build cool stuff',
      longDescription:
        'We are a team of skilled engineers who build innovative products',
      filecoinUser: true,
      ipfsUser: true,
      fundingStage: 'Seed',
      membershipSources: ['Membership Source A', 'Membership Source B'],
      tags: ['Software Development', 'Blockchain'],
      members: ['456', '789'],
      contactMethod: null,
    };

    expect(parseTeam(teamResponse)).toEqual(expectedResult);
  });

  it('should correctly parse a TTeamResponse object into an ITeam object', () => {
    const expectedResult = {
      id: 'team-01',
      name: 'Team 01',
      logo: null,
      website: null,
      twitter: null,
      shortDescription: null,
      longDescription: null,
      filecoinUser: false,
      ipfsUser: false,
      fundingStage: null,
      membershipSources: [],
      tags: [],
      members: [],
      contactMethod: null,
    };

    expect(parseTeam(teamResponseMock)).toEqual(expectedResult);
  });
});

describe('getTeamsFilterValues', () => {
  const options = {
    'technologies.title__with': 'Tag 01',
  };

  it('should be able to get all teams filter values and available teams filter values', async () => {
    (client.teams.getTeams as jest.Mock)
      .mockClear()
      .mockReturnValueOnce({
        body: [
          {
            industryTags: [{ title: 'Tag 01' }, { title: 'Tag 02' }],
            fundingStage: { title: 'Funding Stage 01' },
            membershipSources: [
              { title: 'Membership Source 01' },
              { title: 'Membership Source 02' },
            ],
            technologies: [{ title: 'IPFS' }, { title: 'Filecoin' }],
          },
          {
            industryTags: [
              { title: 'Tag 01' },
              { title: 'Tag 02' },
              { title: 'Tag 03' },
            ],
            fundingStage: { title: 'Funding Stage 02' },
            membershipSources: [
              { title: 'Membership Source 02' },
              { title: 'Membership Source 03' },
            ],
          },
          {
            industryTags: [{ title: 'Tag 04' }, { title: 'Tag 05' }],
            fundingStage: { title: 'Funding Stage 03' },
            membershipSources: [{ title: 'Membership Source 04' }],
          },
          {},
        ],
        status: 200,
      })
      .mockReturnValueOnce({
        body: [
          {
            industryTags: [{ title: 'Tag 01' }, { title: 'Tag 02' }],
            fundingStage: { title: 'Funding Stage 01' },
            membershipSources: [
              { title: 'Membership Source 01' },
              { title: 'Membership Source 02' },
            ],
            technologies: [{ title: 'IPFS' }, { title: 'Filecoin' }],
          },
          {
            industryTags: [
              { title: 'Tag 01' },
              { title: 'Tag 02' },
              { title: 'Tag 03' },
            ],
            fundingStage: { title: 'Funding Stage 02' },
            membershipSources: [
              { title: 'Membership Source 02' },
              { title: 'Membership Source 03' },
            ],
          },
        ],
        status: 200,
      });

    const result = await getTeamsFilters(options);

    expect(client.teams.getTeams).toHaveBeenCalledTimes(2);
    expect(client.teams.getTeams).toHaveBeenNthCalledWith(1, {
      query: {
        pagination: false,
        select:
          'industryTags.title,membershipSources.title,fundingStage.title,technologies.title',
      },
    });
    expect(client.teams.getTeams).toHaveBeenNthCalledWith(2, {
      query: {
        'technologies.title__with': 'Tag 01',
        pagination: false,
        select:
          'industryTags.title,membershipSources.title,fundingStage.title,technologies.title',
      },
    });

    const expectedResult = {
      valuesByFilter: {
        tags: ['Tag 01', 'Tag 02', 'Tag 03', 'Tag 04', 'Tag 05'],
        fundingStage: [
          'Funding Stage 01',
          'Funding Stage 02',
          'Funding Stage 03',
        ],
        membershipSources: [
          'Membership Source 01',
          'Membership Source 02',
          'Membership Source 03',
          'Membership Source 04',
        ],
        technology: ['Filecoin', 'IPFS'],
      },
      availableValuesByFilter: {
        tags: ['Tag 01', 'Tag 02', 'Tag 03'],
        fundingStage: ['Funding Stage 01', 'Funding Stage 02'],
        membershipSources: [
          'Membership Source 01',
          'Membership Source 02',
          'Membership Source 03',
        ],
        technology: ['Filecoin', 'IPFS'],
      },
    };

    expect(result).toEqual(expectedResult);
  });

  it('should return empty filters if the API returns a non-200 status code', async () => {
    (<jest.Mock>client.teams.getTeams)
      .mockClear()
      .mockReturnValueOnce({
        body: [],
        status: 404,
      })
      .mockReturnValueOnce({
        body: [{}],
        status: 200,
      });

    const filters = await getTeamsFilters(options);

    expect(filters).toEqual({
      valuesByFilter: [],
      availableValuesByFilter: [],
    });
  });
});
