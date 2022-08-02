import { MEMBER_CARD_FIELDS } from '../../../components/shared/members/member-card/member-card.constants';
import { TEAM_CARD_FIELDS } from '../../../components/shared/teams/team-card/team-card.constants';
import { ITEMS_PER_PAGE } from '../../../constants';
import {
  getMembersDirectoryListOptions,
  getMembersDirectoryRequestOptionsFromQuery,
  getMembersDirectoryRequestParametersFromQuery,
  getTeamsDirectoryListOptions,
  getTeamsDirectoryRequestOptionsFromQuery,
  getTeamsDirectoryRequestParametersFromQuery,
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
      sort: [{ field: 'Name', direction: 'desc' }],
      filterByFormula:
        'AND({Name} != "", {Short description} != "", {Friend of PLN} = FALSE(), REGEX_MATCH({Name}, "(?i)^(void)"), SEARCH("Analytics", ARRAYJOIN({Tags lookup})), SEARCH("IPFS", {Accelerator Programs}), SEARCH("Seed", {Funding Stage}), {IPFS User} = TRUE())',
    });
  });

  it('should return valid options when sort is provided and is invalid', () => {
    expect(
      getTeamsDirectoryRequestOptionsFromQuery({
        sort: 'invalid',
      })
    ).toEqual({
      sort: [{ field: 'Name', direction: 'asc' }],
      filterByFormula:
        'AND({Name} != "", {Short description} != "", {Friend of PLN} = FALSE())',
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
      sort: [{ field: 'Name', direction: 'asc' }],
      filterByFormula:
        'AND({Name} != "", {Short description} != "", {Friend of PLN} = FALSE(), REGEX_MATCH({Name}, "(?i)^(void)"), SEARCH("Analytics", ARRAYJOIN({Tags lookup})), SEARCH("IPFS", {Accelerator Programs}), SEARCH("Seed", {Funding Stage}), {IPFS User} = TRUE(), {Filecoin User} = TRUE())',
    });
  });
});

describe('#getTeamsDirectoryListOptions', () => {
  it('should append teams cards list properties to the provided options', () => {
    expect(
      getTeamsDirectoryListOptions({
        sort: [{ field: 'Name', direction: 'desc' }],
        filterByFormula: 'AND({Name} != "", {Short description} != "")',
      })
    ).toEqual({
      sort: [{ field: 'Name', direction: 'desc' }],
      filterByFormula: 'AND({Name} != "", {Short description} != "")',
      fields: TEAM_CARD_FIELDS,
      pageSize: ITEMS_PER_PAGE,
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
        'AND({Name} != "", {Teams} != "", {Friend of PLN} = FALSE(), REGEX_MATCH({Name}, "(?i)^(void)"), SEARCH("Engineering", {Skills}), SEARCH("Leadership", {Skills}), SEARCH("Portugal", {Country}), SEARCH("Porto", {Metro Area}))',
    });
  });

  it('should return valid options when sort is provided and is invalid', () => {
    expect(
      getMembersDirectoryRequestOptionsFromQuery({
        sort: 'invalid',
      })
    ).toEqual({
      sort: [{ field: 'Name', direction: 'asc' }],
      filterByFormula:
        'AND({Name} != "", {Teams} != "", {Friend of PLN} = FALSE())',
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
        'AND({Name} != "", {Teams} != "", {Friend of PLN} = FALSE(), REGEX_MATCH({Name}, "(?i)^(void)"), SEARCH("Engineering", {Skills}), SEARCH("Leadership", {Skills}), SEARCH("Portugal", {Country}), SEARCH("Porto", {Metro Area}))',
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

describe('#getTeamsDirectoryRequestParametersFromQuery', () => {
  it('should return a valid query parameters string when sort is provided and is valid', () => {
    const encodedFormula = encodeURIComponent(
      'AND({Name} != "", {Short description} != "", {Friend of PLN} = FALSE(), REGEX_MATCH({Name}, "(?i)^(void)"), SEARCH("Analytics", ARRAYJOIN({Tags lookup})), SEARCH("IPFS", {Accelerator Programs}), SEARCH("Seed", {Funding Stage}), {IPFS User} = TRUE())'
    );

    expect(
      getTeamsDirectoryRequestParametersFromQuery({
        sort: 'Name,desc',
        tags: 'Analytics',
        acceleratorPrograms: 'IPFS',
        fundingStage: 'Seed',
        searchBy: 'void',
        technology: 'IPFS',
      })
    ).toEqual(
      `fields[]=Name&fields[]=Logo&fields[]=Short description&fields[]=Tags lookup&fields[]=Website&fields[]=Twitter&sort[0][field]=Name&sort[0][direction]=desc&filterByFormula=${encodedFormula}&pageSize=9`
    );
  });

  it('should return a valid query parameters string when sort is provided and is invalid', () => {
    const encodedFormula = encodeURIComponent(
      'AND({Name} != "", {Short description} != "", {Friend of PLN} = FALSE())'
    );

    expect(
      getTeamsDirectoryRequestParametersFromQuery({
        sort: 'invalid',
      })
    ).toEqual(
      `fields[]=Name&fields[]=Logo&fields[]=Short description&fields[]=Tags lookup&fields[]=Website&fields[]=Twitter&sort[0][field]=Name&sort[0][direction]=asc&filterByFormula=${encodedFormula}&pageSize=9`
    );
  });

  it('should return a valid query parameters string when sort is not provided', () => {
    const encodedFormula = encodeURIComponent(
      'AND({Name} != "", {Short description} != "", {Friend of PLN} = FALSE(), REGEX_MATCH({Name}, "(?i)^(void)"), SEARCH("Analytics", ARRAYJOIN({Tags lookup})), SEARCH("IPFS", {Accelerator Programs}), SEARCH("Seed", {Funding Stage}), {IPFS User} = TRUE(), {Filecoin User} = TRUE())'
    );

    expect(
      getTeamsDirectoryRequestParametersFromQuery({
        tags: 'Analytics',
        acceleratorPrograms: 'IPFS',
        fundingStage: 'Seed',
        searchBy: 'void',
        technology: 'IPFS|Filecoin',
      })
    ).toEqual(
      `fields[]=Name&fields[]=Logo&fields[]=Short description&fields[]=Tags lookup&fields[]=Website&fields[]=Twitter&sort[0][field]=Name&sort[0][direction]=asc&filterByFormula=${encodedFormula}&pageSize=9`
    );
  });
});

describe('#getMembersDirectoryRequestParametersFromQuery', () => {
  const encodedFormula = encodeURIComponent(
    'AND({Name} != "", {Teams} != "", {Friend of PLN} = FALSE(), REGEX_MATCH({Name}, "(?i)^(void)"), SEARCH("Engineering", {Skills}), SEARCH("Leadership", {Skills}), SEARCH("Portugal", {Country}), SEARCH("Porto", {Metro Area}))'
  );

  it('should return a valid query parameters string when sort is provided and is valid', () => {
    expect(
      getMembersDirectoryRequestParametersFromQuery({
        country: 'Portugal',
        metroArea: 'Porto',
        searchBy: 'void',
        skills: 'Engineering|Leadership',
        sort: 'Name,desc',
      })
    ).toEqual(
      `fields[]=Name&fields[]=Profile picture&fields[]=Role&fields[]=Teams&fields[]=Team name&fields[]=Country&fields[]=State / Province&fields[]=City&fields[]=Metro Area&fields[]=Email&fields[]=Twitter&fields[]=Github Handle&fields[]=Team lead&fields[]=Skills&sort[0][field]=Name&sort[0][direction]=desc&filterByFormula=${encodedFormula}&pageSize=9`
    );
  });

  it('should return a valid query parameters string when sort is provided and is invalid', () => {
    const encodedFormula = encodeURIComponent(
      'AND({Name} != "", {Teams} != "", {Friend of PLN} = FALSE())'
    );

    expect(
      getMembersDirectoryRequestParametersFromQuery({
        sort: 'invalid',
      })
    ).toEqual(
      `fields[]=Name&fields[]=Profile picture&fields[]=Role&fields[]=Teams&fields[]=Team name&fields[]=Country&fields[]=State / Province&fields[]=City&fields[]=Metro Area&fields[]=Email&fields[]=Twitter&fields[]=Github Handle&fields[]=Team lead&fields[]=Skills&sort[0][field]=Name&sort[0][direction]=asc&filterByFormula=${encodedFormula}&pageSize=9`
    );
  });

  it('should return a valid query parameters string when sort is not provided', () => {
    const encodedFormula = encodeURIComponent(
      'AND({Name} != "", {Teams} != "", {Friend of PLN} = FALSE(), REGEX_MATCH({Name}, "(?i)^(void)"), SEARCH("Engineering", {Skills}), SEARCH("Leadership", {Skills}), SEARCH("Portugal", {Country}), SEARCH("Porto", {Metro Area}))'
    );

    expect(
      getMembersDirectoryRequestParametersFromQuery({
        country: 'Portugal',
        metroArea: 'Porto',
        searchBy: 'void',
        skills: 'Engineering|Leadership',
      })
    ).toEqual(
      `fields[]=Name&fields[]=Profile picture&fields[]=Role&fields[]=Teams&fields[]=Team name&fields[]=Country&fields[]=State / Province&fields[]=City&fields[]=Metro Area&fields[]=Email&fields[]=Twitter&fields[]=Github Handle&fields[]=Team lead&fields[]=Skills&sort[0][field]=Name&sort[0][direction]=asc&filterByFormula=${encodedFormula}&pageSize=9`
    );
  });
});
