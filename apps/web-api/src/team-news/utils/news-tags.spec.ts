import { BadRequestException } from '@nestjs/common';
import { buildNewsTagVocabulary } from '../news-tag-vocabulary.service';
import {
  isNewsProfileStartingTagsEnabled,
  isNewsTagPicksEnabled,
  parseNewsTags,
  readChosenNewsTags,
  readStoredNewsTags,
  resolveNewsTags,
} from './news-tags';

/** LAB-2998: a member's news tags, stored as focus-area slugs in `Member.preferences.newsTags`. */
const vocabulary = buildNewsTagVocabulary([
  { uid: 'fa-ai', title: 'AI', parentUid: null },
  { uid: 'fa-desci', title: 'DeSci', parentUid: null },
]);

describe('parseNewsTags', () => {
  it('accepts focus-area slugs, de-duplicated in the order given', () => {
    expect(parseNewsTags(['desci', 'ai', 'desci'], vocabulary)).toEqual(['desci', 'ai']);
  });

  it('accepts an empty list: the member removed every tag', () => {
    expect(parseNewsTags([], vocabulary)).toEqual([]);
  });

  it.each([
    ['an unknown slug', ['ai', 'not-a-focus-area']],
    ['a legacy verb tag', ['launch']],
    ['a non-string entry', ['ai', 3]],
    ['a non-list', 'ai'],
    ['null', null],
  ])('rejects %s with 400', (_case, value) => {
    expect(() => parseNewsTags(value, vocabulary)).toThrow(BadRequestException);
  });
});

describe('readStoredNewsTags', () => {
  it('is undefined when the member never saved news tags', () => {
    expect(readStoredNewsTags({ showEmail: true })).toBeUndefined();
    expect(readStoredNewsTags(null)).toBeUndefined();
  });

  it('returns a saved empty list as stored', () => {
    expect(readStoredNewsTags({ newsTags: [] })).toEqual([]);
  });
});

describe('readChosenNewsTags (LAB-3243)', () => {
  it('is undefined when the member never saved news tags', () => {
    expect(readChosenNewsTags({ showEmail: true })).toBeUndefined();
    expect(readChosenNewsTags(null)).toBeUndefined();
  });

  it('is undefined for a saved empty list', () => {
    expect(readChosenNewsTags({ newsTags: [] })).toBeUndefined();
  });

  it('returns a saved list with 1 or more tags', () => {
    expect(readChosenNewsTags({ newsTags: ['ai', 'desci'] })).toEqual(['ai', 'desci']);
  });
});

describe('resolveNewsTags', () => {
  it('returns the saved list without the seeded marker, and does not seed', async () => {
    const seed = jest.fn(async () => ['desci']);

    await expect(resolveNewsTags({ newsTags: ['ai', 'desci'] }, seed)).resolves.toEqual({
      newsTags: ['ai', 'desci'],
    });
    expect(seed).not.toHaveBeenCalled();
  });

  it('seeds a member who saved an empty list, and marks the tags as seeded (LAB-3243)', async () => {
    await expect(resolveNewsTags({ newsTags: [] }, async () => ['desci'])).resolves.toEqual({
      newsTags: ['desci'],
      newsTagsSeeded: true,
    });
  });

  it('marks an empty seed as seeded for a saved empty list too (no team, no profile)', async () => {
    await expect(resolveNewsTags({ newsTags: [] }, async () => [])).resolves.toEqual({
      newsTags: [],
      newsTagsSeeded: true,
    });
  });

  it('seeds a member who never saved, and marks the tags as seeded', async () => {
    await expect(resolveNewsTags({ showEmail: true }, async () => ['desci', 'ai'])).resolves.toEqual({
      newsTags: ['desci', 'ai'],
      newsTagsSeeded: true,
    });
  });

  it('marks an empty seed as seeded too (a member on no team)', async () => {
    await expect(resolveNewsTags(null, async () => [])).resolves.toEqual({ newsTags: [], newsTagsSeeded: true });
  });
});

describe('isNewsTagPicksEnabled (LAB-2999)', () => {
  it.each([
    ['true', true],
    ['TRUE', true],
    [' true ', true],
    ['false', false],
    ['1', false],
    ['', false],
    [undefined, false],
  ])('reads %p as %p', (value, expected) => {
    expect(isNewsTagPicksEnabled({ NEWS_TAG_PICKS_ENABLED: value } as NodeJS.ProcessEnv)).toBe(expected);
  });
});

describe('isNewsProfileStartingTagsEnabled (LAB-3199)', () => {
  it.each([
    ['true', true],
    ['TRUE', true],
    [' true ', true],
    ['false', false],
    ['1', false],
    ['', false],
    [undefined, false],
  ])('reads %p as %p', (value, expected) => {
    expect(isNewsProfileStartingTagsEnabled({ NEWS_PROFILE_STARTING_TAGS_ENABLED: value } as NodeJS.ProcessEnv)).toBe(
      expected
    );
  });
});
