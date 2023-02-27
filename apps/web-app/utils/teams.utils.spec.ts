import { TTeamResponse } from '@protocol-labs-network/contracts';
import {
  getTeamsListOptions,
  getTeamsOptionsFromQuery,
  parseTeam,
} from './teams.utils';

const teamResponseMock: TTeamResponse = {
  uid: 'team-01',
  name: 'Team 01',
  plnFriend: false,
  createdAt: '2022-09-30T23:20:06.960Z',
  updatedAt: '2022-12-22T20:36:25.081Z',
  filecoinUser: false,
  ipfsUser: false,
};

describe('#getTeamsOptionsFromQuery', () => {
  it('should return valid options when sort is provided and is valid', () => {
    expect(
      getTeamsOptionsFromQuery({
        sort: 'Name,desc',
        tags: 'Analytics',
        fundingStage: 'Seed',
        membershipSources: 'IPFS',
        searchBy: 'void',
        technology: 'IPFS',
        includeFriends: 'true',
      })
    ).toEqual({
      'membershipSources.title__with': 'IPFS',
      'fundingStage.title__with': 'Seed',
      'industryTags.title__with': 'Analytics',
      name__istartswith: 'void',
      orderBy: '-name',
      'technologies.title__with': 'IPFS',
    });
  });

  it('should return valid options when sort is provided and is invalid', () => {
    expect(
      getTeamsOptionsFromQuery({
        sort: 'invalid',
      })
    ).toEqual({
      orderBy: 'name',
      plnFriend: false,
    });
  });

  it('should return valid options when sort is not provided', () => {
    expect(
      getTeamsOptionsFromQuery({
        tags: 'Analytics',
        fundingStage: 'Seed',
        membershipSources: 'IPFS',
        searchBy: 'void',
        technology: 'IPFS|Filecoin',
        includeFriends: 'true',
      })
    ).toEqual({
      'membershipSources.title__with': 'IPFS',
      'fundingStage.title__with': 'Seed',
      'industryTags.title__with': 'Analytics',
      name__istartswith: 'void',
      orderBy: 'name',
      'technologies.title__with': 'IPFS,Filecoin',
    });
  });

  it('should return searchBy with no whitespace at the beginning or end', () => {
    expect(
      getTeamsOptionsFromQuery({
        searchBy: '  lorem ipsum  ',
      })
    ).toEqual({
      orderBy: 'name',
      plnFriend: false,
      name__istartswith: 'lorem ipsum',
    });
  });
});

describe('#getTeamsListOptions', () => {
  it('should append teams cards list properties to the provided options', () => {
    expect(
      getTeamsListOptions({
        'membershipSources.title__with': 'IPFS',
        orderBy: '-name',
      })
    ).toEqual({
      'membershipSources.title__with': 'IPFS',
      orderBy: '-name',
      pagination: false,
      select: 'uid,name,shortDescription,logo.url,industryTags.title',
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
        {
          uid: '',
          createdAt: '',
          updatedAt: '',
          title: 'Software Development',
          industryCategoryUid: '',
        },
        {
          uid: '',
          createdAt: '',
          updatedAt: '',
          title: 'Blockchain',
          industryCategoryUid: '',
        },
      ],
      fundingStage: { title: 'Seed' },
      teamMemberRoles: [{ member: { uid: '456' } }, { member: { uid: '789' } }],
      contactMethod: 'https://myteam.com/contact',
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
      technologies: [
        {
          title: 'Filecoin',
        },
        {
          title: 'IPFS',
        },
      ],
      fundingStage: 'Seed',
      industryTags: [
        {
          createdAt: '',
          industryCategoryUid: '',
          title: 'Software Development',
          uid: '',
          updatedAt: '',
        },
        {
          createdAt: '',
          industryCategoryUid: '',
          title: 'Blockchain',
          uid: '',
          updatedAt: '',
        },
      ],
      membershipSources: [
        {
          title: 'Membership Source A',
        },
        {
          title: 'Membership Source B',
        },
      ],
      members: ['456', '789'],
      contactMethod: 'https://myteam.com/contact',
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
      technologies: [],
      fundingStage: null,
      membershipSources: [],
      industryTags: [],
      members: [],
      contactMethod: null,
    };

    expect(parseTeam(teamResponseMock)).toEqual(expectedResult);
  });
});
