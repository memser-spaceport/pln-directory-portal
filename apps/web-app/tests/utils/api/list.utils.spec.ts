import { MEMBER_CARD_FIELDS } from '../../../components/shared/members/member-card/member-card.constants';
import { TEAM_CARD_FIELDS } from '../../../components/shared/teams/team-card/team-card.constants';
import {
  getMembersDirectoryListOptions,
  getMembersDirectoryRequestOptionsFromQuery,
  getTeamsDirectoryRequestOptionsFromQuery,
} from '../../../utils/api/list.utils';

describe('#getTeamsDirectoryRequestOptionsFromQuery', () => {
  it('should return valid options when sort is provided and is valid', () => {
    expect(
      getTeamsDirectoryRequestOptionsFromQuery({
        sort: 'Name,desc',
        tags: 'Analytics',
        fundingStage: 'Seed',
        acceleratorPrograms: 'IPFS',
        searchBy: 'void',
        technology: 'IPFS',
      })
    ).toEqual({
      fields: TEAM_CARD_FIELDS,
      sort: [{ field: 'Name', direction: 'desc' }],
      filterByFormula:
        'AND({Name} != "", {Short description} != "", REGEX_MATCH({Name}, "(?i)^(void)"), SEARCH("Analytics", ARRAYJOIN({Tags lookup})), SEARCH("IPFS", {Accelerator Programs}), SEARCH("Seed", {Funding Stage}), {IPFS User} = TRUE())',
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
        tags: 'Analytics',
        fundingStage: 'Seed',
        acceleratorPrograms: 'IPFS',
        searchBy: 'void',
        technology: 'IPFS|Filecoin',
      })
    ).toEqual({
      fields: TEAM_CARD_FIELDS,
      sort: [{ field: 'Name', direction: 'asc' }],
      filterByFormula:
        'AND({Name} != "", {Short description} != "", REGEX_MATCH({Name}, "(?i)^(void)"), SEARCH("Analytics", ARRAYJOIN({Tags lookup})), SEARCH("IPFS", {Accelerator Programs}), SEARCH("Seed", {Funding Stage}), {IPFS User} = TRUE(), {Filecoin User} = TRUE())',
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
      sort: [{ field: 'Name', direction: 'asc' }],
      filterByFormula:
        'AND({Name} != "", {Teams} != "", REGEX_MATCH({Name}, "(?i)^(void)"), SEARCH("Engineering", {Skills}), SEARCH("Leadership", {Skills}), SEARCH("Portugal", {Country}), SEARCH("Porto", {Metro Area}))',
    });
  });
});

describe('#getMembersDirectoryListOptions', () => {
  it('should append members cards list properties to the provided options', () => {
    expect(
      getMembersDirectoryListOptions({
        sort: [{ field: 'Name', direction: 'desc' }],
        filterByFormula: 'AND({Name} != "", {Teams} != "")',
      })
    ).toEqual({
      sort: [{ field: 'Name', direction: 'desc' }],
      filterByFormula: 'AND({Name} != "", {Teams} != "")',
      fields: MEMBER_CARD_FIELDS,
    });
  });
});
