import {
  clampTrendingLimit,
  forceIncludeProtocolLabs,
  likesForRank,
  randomIntInclusive,
  TRENDING_LIKE_RANGES,
} from './team-news-trending-seed.util';

describe('team-news-trending-seed.util', () => {
  describe('randomIntInclusive', () => {
    it('returns min when rng is 0', () => {
      expect(randomIntInclusive(2, 4, () => 0)).toBe(2);
    });

    it('returns max when rng approaches 1', () => {
      expect(randomIntInclusive(2, 4, () => 0.999999)).toBe(4);
    });
  });

  describe('likesForRank', () => {
    it.each(
      TRENDING_LIKE_RANGES.map((range, i) => ({
        rank: i + 1,
        min: range[0],
        max: range[1],
      }))
    )('rank $rank stays within [$min, $max]', ({ rank, min, max }) => {
      for (let i = 0; i < 20; i++) {
        const likes = likesForRank(rank, () => i / 20);
        expect(likes).toBeGreaterThanOrEqual(min);
        expect(likes).toBeLessThanOrEqual(max);
      }
    });

    it('throws for out-of-range rank', () => {
      expect(() => likesForRank(0)).toThrow(/out of range/);
      expect(() => likesForRank(8)).toThrow(/out of range/);
    });
  });

  describe('forceIncludeProtocolLabs', () => {
    const pl = 'pl-news-1';

    it('returns sliced list unchanged when PL already present', () => {
      expect(forceIncludeProtocolLabs(['a', pl, 'b', 'c'], pl, 3, () => 0)).toEqual(['a', pl, 'b']);
    });

    it('returns unchanged when no PL uid provided', () => {
      expect(forceIncludeProtocolLabs(['a', 'b', 'c'], null, 3)).toEqual(['a', 'b', 'c']);
    });

    it('inserts PL at a non-top position when missing', () => {
      const result = forceIncludeProtocolLabs(['a', 'b', 'c', 'd'], pl, 4, () => 0);
      expect(result).toContain(pl);
      expect(result[0]).not.toBe(pl);
      expect(result).toHaveLength(4);
    });

    it('dedupes and clamps to limit', () => {
      expect(forceIncludeProtocolLabs(['a', 'a', 'b'], pl, 2, () => 0)).toEqual(['a', pl]);
    });
  });

  describe('clampTrendingLimit', () => {
    it('defaults to 7', () => {
      expect(clampTrendingLimit(undefined)).toBe(7);
    });

    it('clamps to 5–7', () => {
      expect(clampTrendingLimit(3)).toBe(5);
      expect(clampTrendingLimit(5)).toBe(5);
      expect(clampTrendingLimit(6)).toBe(6);
      expect(clampTrendingLimit(10)).toBe(7);
    });
  });
});
