import { BadRequestException } from '@nestjs/common';
import { toPreferencePatch } from './member-preferences';
import { buildNewsTagVocabulary } from '../team-news/news-tag-vocabulary.service';
import { defaultCategoryTagsForTagSave, resolveNewsCategoryTags } from '../team-news/utils/news-category-tags';
import { readChosenNewsTags } from '../team-news/utils/news-tags';

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

describe('toPreferencePatch with newsCategoryTags', () => {
  it('stores the categories and leaves every other preference unchanged', () => {
    expect(
      merge({ showEmail: true, newsTags: ['ai'] }, { newsCategoryTags: ['ANNOUNCEMENT', 'FUNDING', 'FUNDING'] })
    ).toEqual({
      showEmail: true,
      newsTags: ['ai'],
      newsCategoryTags: ['FUNDING', 'ANNOUNCEMENT'],
    });
  });

  it('stores an empty list', () => {
    expect(merge({ newsCategoryTags: ['FUNDING'] }, { newsCategoryTags: [] })).toEqual({ newsCategoryTags: [] });
  });

  it('rejects a category that is not offered, so nothing reaches the blob', () => {
    expect(() => toPreferencePatch({ newsCategoryTags: ['FUNDING', 'PARTNERSHIP'] })).toThrow(BadRequestException);
  });
});

/**
 * LAB-3284: the preferences save, with the first-tag-save rule of
 * `MembersService.updatePreference`. The SQL condition on the stored row is
 * stood in for by the same check in JS.
 */
const save = (stored: Record<string, unknown>, body: unknown) => {
  const patch = toPreferencePatch(body, vocabulary);
  const hasNoSavedChoice =
    !readChosenNewsTags(stored) && resolveNewsCategoryTags({ ...stored, newsTags: ['x'] }).length === 0;
  return { ...stored, ...patch, ...(hasNoSavedChoice ? defaultCategoryTagsForTagSave(patch) ?? {} : {}) };
};

describe('default category tags (LAB-3284)', () => {
  const ALL = ['FUNDING', 'LAUNCH', 'ANNOUNCEMENT'];

  it('reads every category for a member with no saved tags and no category tags', () => {
    expect(resolveNewsCategoryTags({ showEmail: true })).toEqual(ALL);
  });

  it('reads no category for a member with saved tags and no category tags', () => {
    expect(resolveNewsCategoryTags(merge({}, { newsCategoryTags: [] }))).toEqual(ALL);
    expect(resolveNewsCategoryTags({ newsTags: ['ai'] })).toEqual([]);
  });

  it('stores every category with the first saved tags', () => {
    expect(save({}, { newsTags: ['ai', 'desci'] })).toEqual({ newsTags: ['ai', 'desci'], newsCategoryTags: ALL });
    expect(save({ newsTags: [], newsCategoryTags: [] }, { newsTags: ['ai'] })).toEqual({
      newsTags: ['ai'],
      newsCategoryTags: ALL,
    });
  });

  it('does not replace categories the member picked', () => {
    expect(save({ newsCategoryTags: ['FUNDING'] }, { newsTags: ['ai'] })).toEqual({
      newsTags: ['ai'],
      newsCategoryTags: ['FUNDING'],
    });
  });

  it('stores no category for a member who already has saved tags', () => {
    const stored = save({ newsTags: ['ai'] }, { newsTags: ['ai', 'desci'] });
    expect(stored).toEqual({ newsTags: ['ai', 'desci'] });
    expect(resolveNewsCategoryTags(stored)).toEqual([]);
  });

  it('stores the category tags the request carries', () => {
    expect(save({}, { newsTags: ['ai'], newsCategoryTags: [] })).toEqual({ newsTags: ['ai'], newsCategoryTags: [] });
  });

  it('stores no category with an empty tag list', () => {
    expect(save({}, { newsTags: [] })).toEqual({ newsTags: [] });
  });
});
