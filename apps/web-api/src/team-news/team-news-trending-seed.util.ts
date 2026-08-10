/** Inclusive random integer in [min, max]. */
export function randomIntInclusive(min: number, max: number, rng: () => number = Math.random): number {
  if (max < min) throw new Error(`randomIntInclusive: max (${max}) < min (${min})`);
  return min + Math.floor(rng() * (max - min + 1));
}

/** Rank (1-based) → inclusive synthetic like count range. First 5 used for Popular. */
export const TRENDING_LIKE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [9, 10], // rank 1
  [7, 9], // rank 2
  [6, 8], // rank 3
  [5, 7], // rank 4
  [4, 6], // rank 5
];

/** Fixed count of synthetic-liked items for Popular this week. */
export const TRENDING_LIKED_LIMIT = 5;

/** Fixed count of editorial Top Stories picks. */
export const EDITORIAL_RANK_LIMIT = 3;

/** Max likes needed for rank 1 — size of the bot member pool. */
export const TRENDING_SEED_BOT_COUNT = 10;

export const TRENDING_SEED_EXTERNAL_ID_PREFIX = 'team-news-trending-seed-';

export function likesForRank(rank: number, rng: () => number = Math.random): number {
  const range = TRENDING_LIKE_RANGES[rank - 1];
  if (!range) {
    throw new Error(`likesForRank: rank ${rank} out of range 1..${TRENDING_LIKE_RANGES.length}`);
  }
  return randomIntInclusive(range[0], range[1], rng);
}

/**
 * Ensure a Protocol Labs news UID is in the ranked list when available.
 * If missing, inserts at a random rank in 2..limit (never forced to #1).
 */
export function forceIncludeProtocolLabs(
  rankedUids: string[],
  protocolLabsUid: string | null,
  limit: number,
  rng: () => number = Math.random
): string[] {
  const deduped = [...new Set(rankedUids.filter(Boolean))];
  if (!protocolLabsUid) {
    return deduped.slice(0, limit);
  }
  if (deduped.includes(protocolLabsUid)) {
    return deduped.slice(0, limit);
  }

  const next = deduped.slice(0, Math.max(0, limit - 1));
  if (next.length < 1) {
    return [protocolLabsUid].slice(0, limit);
  }

  const insertAt = randomIntInclusive(1, next.length, rng);
  next.splice(insertAt, 0, protocolLabsUid);
  return next.slice(0, limit);
}

/** Clamp requested trending (liked) limit to exactly TRENDING_LIKED_LIMIT (5). */
export function clampTrendingLimit(limit: number | undefined): number {
  const n = limit ?? TRENDING_LIKED_LIMIT;
  return Math.min(TRENDING_LIKED_LIMIT, Math.max(TRENDING_LIKED_LIMIT, Math.floor(n)));
}

/**
 * Remove any editorial UIDs from the liked list so Popular and Top Stories stay disjoint.
 * Editorial wins on conflict.
 */
export function enforceDisjoint(likedUids: string[], editorialUids: string[]): string[] {
  const editorial = new Set(editorialUids);
  return likedUids.filter((uid) => !editorial.has(uid));
}
