import { hasJobTextMatch, tokenizeJobMatchText } from './job-openings-for-you-match';

const matches = (memberText: Array<string | null>, jobText: Array<string | null>) =>
  hasJobTextMatch(tokenizeJobMatchText(memberText), tokenizeJobMatchText(jobText));

describe('tokenizeJobMatchText', () => {
  it('keeps two-letter tokens that mean something on their own', () => {
    expect([...tokenizeJobMatchText(['AI Research, UX & QA'])]).toEqual(
      expect.arrayContaining(['ai', 'research', 'ux', 'qa'])
    );
  });

  it('keeps + and # inside a token', () => {
    const tokens = tokenizeJobMatchText(['C++ and C#']);

    expect(tokens.has('c++')).toBe(true);
    expect(tokens.has('c#')).toBe(true);
  });

  it('drops seniority markers, employment terms, and grammar', () => {
    expect([...tokenizeJobMatchText(['Senior Staff Engineer, Full Time, Remote'])]).toEqual(['engineer']);
  });

  it('ignores null and empty values', () => {
    expect(tokenizeJobMatchText([null, undefined, '']).size).toBe(0);
  });
});

describe('hasJobTextMatch', () => {
  it('matches a current role against a role title', () => {
    expect(matches(['Software Engineer'], ['Senior Backend Engineer'])).toBe(true);
  });

  it('matches across the noun forms members and the board actually use', () => {
    // The board's roleCategory values are 'Engineering', 'Design', 'Product'.
    expect(matches(['Engineer'], ['Engineering'])).toBe(true);
    expect(matches(['Product Designer'], ['Design'])).toBe(true);
  });

  it('matches a past experience title even when the current role does not', () => {
    expect(matches(['Founder', 'Data Scientist'], ['Machine Learning Scientist'])).toBe(true);
  });

  it('matches a skill when it happens to be named in the role', () => {
    expect(matches(['Solidity'], ['Solidity Engineer'])).toBe(true);
  });

  it('does not match on seniority alone', () => {
    expect(matches(['Senior Engineer'], ['Senior Designer'])).toBe(false);
  });

  it('does not match unrelated disciplines', () => {
    expect(matches(['Backend Engineer'], ['Community Manager'])).toBe(false);
  });

  it('does not let a two-letter token match by prefix', () => {
    expect(matches(['AI'], ['Airflow Operations'])).toBe(false);
  });

  it('is false when either side has no usable tokens', () => {
    expect(matches([], ['Backend Engineer'])).toBe(false);
    expect(matches(['Backend Engineer'], [null])).toBe(false);
  });
});
