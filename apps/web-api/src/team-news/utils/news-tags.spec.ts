import { BadRequestException } from '@nestjs/common';
import { buildNewsTagVocabulary } from '../news-tag-vocabulary.service';
import { parseNewsTags, readStoredNewsTags, resolveNewsTags } from './news-tags';

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

  it('returns a saved empty list as a choice, not as "never saved"', () => {
    expect(readStoredNewsTags({ newsTags: [] })).toEqual([]);
  });
});

describe('resolveNewsTags', () => {
  it('returns the saved list without the seeded marker, and does not seed', async () => {
    const seed = jest.fn(async () => ['desci']);

    await expect(resolveNewsTags({ newsTags: ['ai'] }, seed)).resolves.toEqual({ newsTags: ['ai'] });
    expect(seed).not.toHaveBeenCalled();
  });

  it('returns a saved empty list as is', async () => {
    await expect(resolveNewsTags({ newsTags: [] }, async () => ['desci'])).resolves.toEqual({ newsTags: [] });
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
