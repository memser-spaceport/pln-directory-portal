import { BadRequestException } from '@nestjs/common';
import { NEWS_CATEGORIES, narrowsNews, parseNewsCategories, readNewsCategories } from './news-categories';

describe('news categories (LAB-2940)', () => {
  it('offers every news event type', () => {
    expect(NEWS_CATEGORIES).toEqual(['FUNDING', 'LAUNCH', 'PARTNERSHIP', 'ANNOUNCEMENT', 'MILESTONE', 'OTHER']);
  });

  describe('parseNewsCategories', () => {
    it('de-duplicates and returns enum order', () => {
      expect(parseNewsCategories(['OTHER', 'FUNDING', 'OTHER'])).toEqual(['FUNDING', 'OTHER']);
    });

    it.each([[[]], [undefined], ['FUNDING'], [['FUNDING', 'DEALS']], [[1]]])('rejects %p', (value) => {
      expect(() => parseNewsCategories(value)).toThrow(BadRequestException);
    });
  });

  describe('readNewsCategories', () => {
    it('returns every category when nothing is stored', () => {
      expect(readNewsCategories(null)).toEqual(NEWS_CATEGORIES);
      expect(readNewsCategories({ showEmail: true })).toEqual(NEWS_CATEGORIES);
    });

    it('returns the stored list, ignoring values it no longer knows', () => {
      expect(readNewsCategories({ newsCategories: ['LAUNCH', 'GONE'] })).toEqual(['LAUNCH']);
    });

    it('falls back to every category when nothing valid is stored', () => {
      expect(readNewsCategories({ newsCategories: ['GONE'] })).toEqual(NEWS_CATEGORIES);
    });
  });

  it('narrowsNews is true only when a category is off', () => {
    expect(narrowsNews([...NEWS_CATEGORIES])).toBe(false);
    expect(narrowsNews(['FUNDING'])).toBe(true);
  });
});
