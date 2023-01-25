import {
  getMembersListOptions,
  getMembersOptionsFromQuery,
} from './members.utils';

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
      officeHours__not: null,
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
      officeHours__not: null,
      orderBy: 'name',
      'skills.title__with': 'Engineering,Leadership',
    });
  });
});

describe('#getMembersListOptions', () => {
  it('should append members cards list properties to the provided options', () => {
    expect(
      getMembersListOptions({
        orderBy: '-name',
        officeHours__not: null,
        'location.metroarea__with': 'Porto',
      })
    ).toEqual({
      'location.metroarea__with': 'Porto',
      officeHours__not: null,
      orderBy: '-name',
      pagination: false,
      select:
        'uid,name,image.url,location.metroArea,location.country,location.region,skills.title,teamMemberRoles.teamLead,teamMemberRoles.mainTeam,teamMemberRoles.role,teamMemberRoles.team.name,teamMemberRoles.team.uid',
    });
  });
});
