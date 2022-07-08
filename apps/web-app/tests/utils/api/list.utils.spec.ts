import { MEMBER_CARD_FIELDS } from '../../../components/shared/members/member-card/member-card.constants';
import { TEAM_CARD_FIELDS } from '../../../components/shared/teams/team-card/team-card.constants';
import {
  getMembersDirectoryRequestOptionsFromQuery,
  getTeamsDirectoryRequestOptionsFromQuery,
} from '../../../utils/api/list.utils';

describe('#getTeamsDirectoryRequestOptionsFromQuery', () => {
  it('should return valid options when sort is provided and is valid', () => {
    expect(
      getTeamsDirectoryRequestOptionsFromQuery({
        sort: 'Name,desc',
        industry: 'Analytics',
        fundingStage: 'Seed',
        fundingVehicle: 'IPFS',
        searchBy: 'void',
        technology: 'IPFS',
      })
    ).toEqual({
      fields: TEAM_CARD_FIELDS,
      sort: [{ field: 'Name', direction: 'desc' }],
      filterByFormula:
        'AND({Name} != "", {Short description} != "", REGEX_MATCH({Name}, "(?i)^(void)"), SEARCH("Analytics", {Industry}), SEARCH("IPFS", {Funding Vehicle}), SEARCH("Seed", {Funding Stage}), {IPFS User} = TRUE())',
    });
  });

  it('should return valid options when sort is provided and is invalid', () => {
    expect(
      getTeamsDirectoryRequestOptionsFromQuery({
        sort: 'invalid',
      })
    ).toEqual({
      fields: TEAM_CARD_FIELDS,
      sort: [{ field: 'Name', direction: 'asc' }],
      filterByFormula: 'AND({Name} != "", {Short description} != "")',
    });
  });

  it('should return valid options when sort is not provided', () => {
    expect(
      getTeamsDirectoryRequestOptionsFromQuery({
        industry: 'Analytics',
        fundingStage: 'Seed',
        fundingVehicle: 'IPFS',
        searchBy: 'void',
        technology: 'IPFS|Filecoin',
      })
    ).toEqual({
      fields: TEAM_CARD_FIELDS,
      sort: [{ field: 'Name', direction: 'asc' }],
      filterByFormula:
        'AND({Name} != "", {Short description} != "", REGEX_MATCH({Name}, "(?i)^(void)"), SEARCH("Analytics", {Industry}), SEARCH("IPFS", {Funding Vehicle}), SEARCH("Seed", {Funding Stage}), {IPFS User} = TRUE(), {Filecoin User} = TRUE())',
    });
  });
});

describe('#getMembersDirectoryRequestOptionsFromQuery', () => {
  it('should return valid options when sort is provided and is valid', () => {
    expect(
      getMembersDirectoryRequestOptionsFromQuery({
        country: 'Portugal',
        metroArea: 'Porto',
        searchBy: 'void',
        skills: 'Engineering|Leadership',
        sort: 'Name,desc',
      })
    ).toEqual({
      fields: MEMBER_CARD_FIELDS,
      sort: [{ field: 'Name', direction: 'desc' }],
      filterByFormula:
        'AND({Name} != "", {Teams} != "", REGEX_MATCH({Name}, "(?i)^(void)"), SEARCH("Engineering", {Skills}), SEARCH("Leadership", {Skills}), SEARCH("Portugal", {Country}), SEARCH("Porto", {Metro Area}))',
    });
  });

  it('should return valid options when sort is provided and is invalid', () => {
    expect(
      getMembersDirectoryRequestOptionsFromQuery({
        sort: 'invalid',
      })
    ).toEqual({
      fields: MEMBER_CARD_FIELDS,
      sort: [{ field: 'Name', direction: 'asc' }],
      filterByFormula: 'AND({Name} != "", {Teams} != "")',
    });
  });

  it('should return valid options when sort is not provided', () => {
    expect(
      getMembersDirectoryRequestOptionsFromQuery({
        country: 'Portugal',
        metroArea: 'Porto',
        searchBy: 'void',
        skills: 'Engineering|Leadership',
      })
    ).toEqual({
      fields: MEMBER_CARD_FIELDS,
      sort: [{ field: 'Name', direction: 'asc' }],
      filterByFormula:
        'AND({Name} != "", {Teams} != "", REGEX_MATCH({Name}, "(?i)^(void)"), SEARCH("Engineering", {Skills}), SEARCH("Leadership", {Skills}), SEARCH("Portugal", {Country}), SEARCH("Porto", {Metro Area}))',
    });
  });
});
