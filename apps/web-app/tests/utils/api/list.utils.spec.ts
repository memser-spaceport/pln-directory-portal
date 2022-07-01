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
        sort: 'Name,desc',
      })
    ).toEqual({
      sort: [{ field: 'Name', direction: 'desc' }],
      filterByFormula: 'AND({Name} != "", {Teams} != "")',
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
    expect(getMembersDirectoryRequestOptionsFromQuery({})).toEqual({
      sort: [{ field: 'Name', direction: 'asc' }],
      filterByFormula: 'AND({Name} != "", {Teams} != "")',
    });
  });
});
