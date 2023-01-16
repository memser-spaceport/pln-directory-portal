import { getTeamsListOptions, getTeamsOptionsFromQuery } from './teams.utils';

describe('#getTeamsOptionsFromQuery', () => {
  it('should return valid options when sort is provided and is valid', () => {
    expect(
      getTeamsOptionsFromQuery({
        sort: 'Name,desc',
        tags: 'Analytics',
        fundingStage: 'Seed',
        acceleratorPrograms: 'IPFS',
        searchBy: 'void',
        technology: 'IPFS',
        includeFriends: 'true',
      })
    ).toEqual({
      'acceleratorPrograms.title__with': 'IPFS',
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
        acceleratorPrograms: 'IPFS',
        searchBy: 'void',
        technology: 'IPFS|Filecoin',
        includeFriends: 'true',
      })
    ).toEqual({
      'acceleratorPrograms.title__with': 'IPFS',
      'fundingStage.title__with': 'Seed',
      'industryTags.title__with': 'Analytics',
      name__istartswith: 'void',
      orderBy: 'name',
      'technologies.title__with': 'IPFS,Filecoin',
    });
  });
});

describe('#getTeamsListOptions', () => {
  it('should append teams cards list properties to the provided options', () => {
    expect(
      getTeamsListOptions({
        'acceleratorPrograms.title__with': 'IPFS',
        orderBy: '-name',
      })
    ).toEqual({
      'acceleratorPrograms.title__with': 'IPFS',
      orderBy: '-name',
      pagination: false,
      select: 'uid,name,shortDescription,logo.url,industryTags.title',
    });
  });
});
