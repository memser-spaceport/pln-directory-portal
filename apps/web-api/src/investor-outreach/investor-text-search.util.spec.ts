import { buildInvestorTextSearch } from './investor-text-search.util';

describe('buildInvestorTextSearch', () => {
  it('returns empty for blank query', () => {
    expect(buildInvestorTextSearch('')).toEqual({});
    expect(buildInvestorTextSearch('   ')).toEqual({});
  });

  it('matches a single token across name, email, and firm fields', () => {
    expect(buildInvestorTextSearch('Josh')).toEqual({
      OR: [
        { firstName: { contains: 'Josh', mode: 'insensitive' } },
        { lastName: { contains: 'Josh', mode: 'insensitive' } },
        { email: { contains: 'Josh', mode: 'insensitive' } },
        { firm: { contains: 'Josh', mode: 'insensitive' } },
      ],
    });
  });

  it('requires each token to match for multi-word full names', () => {
    expect(buildInvestorTextSearch('Josh Wolfe')).toEqual({
      AND: [
        {
          OR: [
            { firstName: { contains: 'Josh', mode: 'insensitive' } },
            { lastName: { contains: 'Josh', mode: 'insensitive' } },
            { email: { contains: 'Josh', mode: 'insensitive' } },
            { firm: { contains: 'Josh', mode: 'insensitive' } },
          ],
        },
        {
          OR: [
            { firstName: { contains: 'Wolfe', mode: 'insensitive' } },
            { lastName: { contains: 'Wolfe', mode: 'insensitive' } },
            { email: { contains: 'Wolfe', mode: 'insensitive' } },
            { firm: { contains: 'Wolfe', mode: 'insensitive' } },
          ],
        },
      ],
    });
  });

  it('collapses extra whitespace between tokens', () => {
    expect(buildInvestorTextSearch('Josh  Wolfe')).toEqual(buildInvestorTextSearch('Josh Wolfe'));
  });

  it('matches firm names with multiple tokens', () => {
    expect(buildInvestorTextSearch('Lux Capital')).toEqual({
      AND: [
        {
          OR: [
            { firstName: { contains: 'Lux', mode: 'insensitive' } },
            { lastName: { contains: 'Lux', mode: 'insensitive' } },
            { email: { contains: 'Lux', mode: 'insensitive' } },
            { firm: { contains: 'Lux', mode: 'insensitive' } },
          ],
        },
        {
          OR: [
            { firstName: { contains: 'Capital', mode: 'insensitive' } },
            { lastName: { contains: 'Capital', mode: 'insensitive' } },
            { email: { contains: 'Capital', mode: 'insensitive' } },
            { firm: { contains: 'Capital', mode: 'insensitive' } },
          ],
        },
      ],
    });
  });
});
