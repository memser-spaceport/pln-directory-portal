import { getListRequestOptionsFromQuery } from '../../../utils/api/list.utils';

describe('#getListRequestOptionsFromQuery', () => {
  it('should return valid options when sort is provided and is valid', () => {
    expect(
      getListRequestOptionsFromQuery({
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
        'AND(REGEX_MATCH({Name}, "(?i)^(void)"), SEARCH("Analytics", {Industry}), SEARCH("IPFS", {Funding Vehicle}), SEARCH("Seed", {Funding Stage}), {IPFS User} = TRUE())',
    });
  });

  it('should return valid options when sort is provided and is invalid', () => {
    expect(
      getListRequestOptionsFromQuery({
        sort: 'invalid',
      })
    ).toEqual({
      sort: [{ field: 'Name', direction: 'asc' }],
      filterByFormula: 'AND()',
    });
  });

  it('should return valid options when sort is not provided', () => {
    expect(
      getListRequestOptionsFromQuery({
        industry: 'Analytics',
        fundingStage: 'Seed',
        fundingVehicle: 'IPFS',
        searchBy: 'void',
        technology: 'IPFS|Filecoin',
      })
    ).toEqual({
      sort: [{ field: 'Name', direction: 'asc' }],
      filterByFormula:
        'AND(REGEX_MATCH({Name}, "(?i)^(void)"), SEARCH("Analytics", {Industry}), SEARCH("IPFS", {Funding Vehicle}), SEARCH("Seed", {Funding Stage}), {IPFS User} = TRUE(), {Filecoin User} = TRUE())',
    });
  });
});
