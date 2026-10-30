import { BadRequestException } from '@nestjs/common';
import { toPreferencePatch } from './member-preferences';
import { buildNewsTagVocabulary } from '../team-news/news-tag-vocabulary.service';

/**
 * LAB-2998: `newsTags` is a validated preference key, like `newsCategories`.
 * The real patch builder is under test; the jsonb merge it feeds is a top-level
 * `||` (see member-preferences-merge.spec.ts), stood in for by an object spread.
 */
const vocabulary = buildNewsTagVocabulary([
  { uid: 'fa-ai', title: 'AI', parentUid: null },
  { uid: 'fa-desci', title: 'DeSci', parentUid: null },
]);

const merge = (stored: Record<string, unknown>, body: unknown) => ({
  ...stored,
  ...toPreferencePatch(body, vocabulary),
});

describe('toPreferencePatch with newsTags', () => {
  it('stores the tags and leaves every other preference unchanged', () => {
    expect(merge({ showEmail: true, newsCategories: ['FUNDING'] }, { newsTags: ['ai', 'desci'] })).toEqual({
      showEmail: true,
      newsCategories: ['FUNDING'],
      newsTags: ['ai', 'desci'],
    });
  });

  it('stores an empty list', () => {
    expect(merge({ newsTags: ['ai'] }, { newsTags: [] })).toEqual({ newsTags: [] });
  });

  it('rejects an unknown slug, so nothing reaches the blob', () => {
    expect(() => toPreferencePatch({ newsTags: ['ai', 'not-a-focus-area'] }, vocabulary)).toThrow(BadRequestException);
  });

  it('drops a newsTagsSeeded marker echoed back by a client', () => {
    expect(toPreferencePatch({ newsTags: ['ai'], newsTagsSeeded: true }, vocabulary)).toEqual({ newsTags: ['ai'] });
  });

  it('needs no vocabulary for a body without newsTags', () => {
    expect(toPreferencePatch({ showForumBanner: false })).toEqual({ showForumBanner: false });
  });

  it('refuses to validate newsTags without the vocabulary', () => {
    expect(() => toPreferencePatch({ newsTags: ['ai'] })).toThrow('vocabulary');
  });
});
