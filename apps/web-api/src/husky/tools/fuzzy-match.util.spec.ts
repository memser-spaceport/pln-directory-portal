import { Prisma } from '@prisma/client';
import {
  fuzzyMatches,
  fuzzySqlTermCondition,
  longestWord,
  resolveFocusAreaTitles,
  searchTerms,
  textMentions,
} from './fuzzy-match.util';

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

  it('still matches a short value exactly, including a single character', () => {
    expect(fuzzyMatches('C', 'C')).toBe(true);
    expect(fuzzyMatches('Go', 'go')).toBe(true);
    expect(fuzzyMatches('R', 'rust')).toBe(false);
  });

  it('only matches a two-letter token as a whole word, never inside another word', () => {
    // "decentralized AI" tokenizes to "ai", which is a substring of plenty of unrelated names.
    for (const name of ['Craig', 'Claire Lim', 'Haim Sadger', 'Yolan Romailler', 'Champ Suthipongchai', 'Aaileen']) {
      expect(fuzzyMatches(name, 'decentralized ai')).toBe(false);
    }
    expect(fuzzyMatches('Sustainability', 'AI')).toBe(false);
    expect(fuzzyMatches('AI/ML', 'decentralized ai')).toBe(true);
    expect(fuzzyMatches('Decentralized AI', 'decentralized ai investments')).toBe(true);
    expect(fuzzyMatches('AI & Robotics', 'AI')).toBe(true);
  });
});

describe('textMentions', () => {
  it('matches the whole phrase or every topic word as a word prefix', () => {
    expect(textMentions('FilOz builds decentralized storage on Filecoin', 'storage')).toBe(true);
    expect(textMentions('Long-term data storages for the network', 'storage')).toBe(true);
    expect(textMentions('We work on decentralized storage networks', 'decentralized storage')).toBe(true);
  });

  it('does not treat a single overlapping word or an embedded two-letter token as a mention', () => {
    expect(textMentions('We work on decentralized identity', 'decentralized storage')).toBe(false);
    expect(textMentions('Craig leads the team', 'ai')).toBe(false);
    expect(textMentions('Applied AI research lab', 'ai')).toBe(true);
  });
});

describe('fuzzySqlTermCondition', () => {
  function render(sql: Prisma.Sql): string {
    return sql.strings.reduce(
      (out, part, index) => out + part + (index < sql.values.length ? JSON.stringify(sql.values[index]) : ''),
      ''
    );
  }

  it('uses a substring LIKE for terms long enough to be distinctive, in both directions', () => {
    const rendered = render(fuzzySqlTermCondition(Prisma.sql`focus_item`, 'neurotechnology'));
    expect(rendered).toContain(`LIKE '%' || "neurotechnology" || '%'`);
    expect(rendered).toContain(`"neurotechnology" LIKE '%' || LOWER(NULLIF(focus_item, '')) || '%'`);
    expect(rendered).not.toContain(' ~ ');
  });

  it('matches a short term only at word boundaries, and a short stored value only by equality', () => {
    const sql = fuzzySqlTermCondition(Prisma.sql`focus_item`, 'ai');
    const rendered = render(sql);
    expect(rendered).toContain(' ~ ');
    expect(sql.values).toContain('\\mai\\M');
    expect(rendered).not.toContain(`LIKE '%' || "ai" || '%'`);
    expect(rendered).toContain(`LENGTH(LOWER(NULLIF(focus_item, ''))) >= 3`);
    expect(rendered).toContain(`LOWER(NULLIF(focus_item, '')) = "ai"`);
  });

  it('never splices a non-alphanumeric short term into the regex', () => {
    const rendered = render(fuzzySqlTermCondition(Prisma.sql`focus_item`, 'c+'));
    expect(rendered).not.toContain(' ~ ');
    expect(rendered).toContain(`= "c+"`);
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
