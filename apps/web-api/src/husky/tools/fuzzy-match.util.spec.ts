import { fuzzyMatches, longestWord, resolveFocusAreaTitles, searchTerms } from './fuzzy-match.util';

describe('fuzzyMatches', () => {
  it('matches a model-normalized single word against a terser multi-word tag', () => {
    expect(fuzzyMatches('neuro tech', 'neurotechnology')).toBe(true);
  });

  it('matches a compound tag against a spaced-out search term', () => {
    expect(fuzzyMatches('DeepTech', 'deep tech')).toBe(true);
  });

  it('still matches an exact substring either direction', () => {
    expect(fuzzyMatches('neuro tech', 'neuro tech')).toBe(true);
    expect(fuzzyMatches('AI', 'ai focused investing')).toBe(true);
  });

  it('does not match unrelated terms', () => {
    expect(fuzzyMatches('neuro tech', 'climate')).toBe(false);
  });
});

describe('longestWord', () => {
  it('returns the longest word in a multi-word phrase', () => {
    expect(longestWord('senior rust engineer roles')).toBe('engineer');
  });

  it('returns undefined for a single word', () => {
    expect(longestWord('rust')).toBeUndefined();
  });
});

describe('searchTerms', () => {
  it('includes the raw search string, since a single compound word has nothing to split on', () => {
    expect(searchTerms('neurotechnology')).toEqual(['neurotechnology']);
  });

  it('adds each word of a multi-word search as its own term', () => {
    expect(searchTerms('deep tech')).toEqual(expect.arrayContaining(['deep tech', 'deep', 'tech']));
  });

  it('de-duplicates when the whole string and its tokenization coincide', () => {
    expect(searchTerms('neuro')).toEqual(['neuro']);
  });
});

describe('resolveFocusAreaTitles', () => {
  function prismaWith(titles: string[]) {
    return { focusArea: { findMany: jest.fn().mockResolvedValue(titles.map((title) => ({ title }))) } } as any;
  }

  it('resolves free text to real focus-area titles that fuzzy-match it', async () => {
    const prisma = prismaWith(['Neurotech', 'DeSci', 'AI & Robotics']);
    await expect(resolveFocusAreaTitles(prisma, 'neuro tech')).resolves.toEqual(['Neurotech']);
  });

  it('falls back to the raw text when nothing resembles it', async () => {
    const prisma = prismaWith(['Neurotech', 'DeSci']);
    await expect(resolveFocusAreaTitles(prisma, 'climate')).resolves.toEqual(['climate']);
  });
});
