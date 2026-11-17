import { BadRequestException } from '@nestjs/common';
import {
  NEWS_CATEGORY_TAGS,
  defaultCategoryTagsForTagSave,
  parseNewsCategoryTags,
  readNewsCategoryTags,
  resolveNewsCategoryTags,
} from './news-category-tags';

describe('news category tags (LAB-3140)', () => {
  it('offers Funding, Launch and Announcement', () => {
    expect(NEWS_CATEGORY_TAGS).toEqual(['FUNDING', 'LAUNCH', 'ANNOUNCEMENT']);
  });

  describe('parseNewsCategoryTags', () => {
    it('de-duplicates and returns enum order', () => {
      expect(parseNewsCategoryTags(['ANNOUNCEMENT', 'FUNDING', 'FUNDING'])).toEqual(['FUNDING', 'ANNOUNCEMENT']);
    });

    it('stores an empty list', () => {
      expect(parseNewsCategoryTags([])).toEqual([]);
    });

    it.each([[undefined], ['FUNDING'], [['PARTNERSHIP']], [['FUNDING', 'OTHER']], [[1]]])('rejects %p', (value) => {
      expect(() => parseNewsCategoryTags(value)).toThrow(BadRequestException);
    });
  });

  describe('readNewsCategoryTags', () => {
    it('returns an empty list when nothing is stored', () => {
      expect(readNewsCategoryTags(null)).toEqual([]);
      expect(readNewsCategoryTags({ newsCategories: ['FUNDING'] })).toEqual([]);
    });

    it('returns the stored list and drops values that are not category tags', () => {
      expect(readNewsCategoryTags({ newsCategoryTags: ['LAUNCH', 'PARTNERSHIP', 'GONE'] })).toEqual(['LAUNCH']);
    });
  });

  describe('resolveNewsCategoryTags (LAB-3284)', () => {
    const ALL = ['FUNDING', 'LAUNCH', 'ANNOUNCEMENT'];

    it('gives every category to a member who saved nothing', () => {
      expect(resolveNewsCategoryTags(null)).toEqual(ALL);
      expect(resolveNewsCategoryTags({ newsCategories: ['FUNDING'] })).toEqual(ALL);
    });

    it('gives every category to a member who removed every tag', () => {
      expect(resolveNewsCategoryTags({ newsTags: [], newsCategoryTags: [] })).toEqual(ALL);
    });

    it('gives no category to a member with saved tags and no category tags', () => {
      expect(resolveNewsCategoryTags({ newsTags: ['ai'] })).toEqual([]);
      expect(resolveNewsCategoryTags({ newsTags: ['ai'], newsCategoryTags: [] })).toEqual([]);
    });

    it('keeps the categories the member picked, with or without saved tags', () => {
      expect(resolveNewsCategoryTags({ newsCategoryTags: ['FUNDING'] })).toEqual(['FUNDING']);
      expect(resolveNewsCategoryTags({ newsTags: ['ai'], newsCategoryTags: ['LAUNCH'] })).toEqual(['LAUNCH']);
    });

    it('drops invalid stored entries before applying the rule', () => {
      expect(resolveNewsCategoryTags({ newsCategoryTags: ['PARTNERSHIP'] })).toEqual(ALL);
      expect(resolveNewsCategoryTags({ newsTags: ['ai'], newsCategoryTags: ['PARTNERSHIP'] })).toEqual([]);
    });

    it('returns a copy of the default list', () => {
      resolveNewsCategoryTags(null).pop();
      expect(NEWS_CATEGORY_TAGS).toHaveLength(3);
    });
  });

  describe('defaultCategoryTagsForTagSave (LAB-3284)', () => {
    it('adds every category to a save of 1 or more news tags', () => {
      expect(defaultCategoryTagsForTagSave({ newsTags: ['ai', 'desci'] })).toEqual({
        newsCategoryTags: ['FUNDING', 'LAUNCH', 'ANNOUNCEMENT'],
      });
    });

    it('adds nothing when the save carries its own category tags', () => {
      expect(defaultCategoryTagsForTagSave({ newsTags: ['ai'], newsCategoryTags: [] })).toBeNull();
    });

    it('adds nothing to an empty tag list or a save without news tags', () => {
      expect(defaultCategoryTagsForTagSave({ newsTags: [] })).toBeNull();
      expect(defaultCategoryTagsForTagSave({ showForumBanner: false })).toBeNull();
    });
  });
});
