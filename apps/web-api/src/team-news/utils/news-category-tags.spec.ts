import { BadRequestException } from '@nestjs/common';
import { NEWS_CATEGORY_TAGS, parseNewsCategoryTags, readNewsCategoryTags } from './news-category-tags';

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
});
