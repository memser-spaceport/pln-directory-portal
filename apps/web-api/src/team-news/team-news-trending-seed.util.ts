/** Inclusive random integer in [min, max]. */
export function randomIntInclusive(min: number, max: number, rng: () => number = Math.random): number {
  if (max < min) throw new Error(`randomIntInclusive: max (${max}) < min (${min})`);
  return min + Math.floor(rng() * (max - min + 1));
}

/** Rank (1-based) → inclusive synthetic like count range. */
export const TRENDING_LIKE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [9, 10], // rank 1
  [7, 9], // rank 2
  [6, 8], // rank 3
  [5, 7], // rank 4
  [4, 6], // rank 5
  [3, 5], // rank 6
  [2, 4], // rank 7
];

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

/** Clamp requested trending limit to 5–7. */
export function clampTrendingLimit(limit: number | undefined): number {
  const n = limit ?? 7;
  return Math.min(7, Math.max(5, Math.floor(n)));
}
