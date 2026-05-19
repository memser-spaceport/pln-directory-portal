// Deterministic shuffle helpers for the public team-news "All" feed.
//
// Why: the "All" feed sorted strictly by date tends to be dominated by one
// focus area's recent batch (e.g. DHR funding rounds), making it look identical
// to that focus area's own tab. We shuffle items per ingest run so the mix
// looks distinct, while keeping order stable across page refreshes within the
// same run.

/**
 * Mulberry32 — small, fast 32-bit PRNG. Same seed → same sequence.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a 32-bit hash for turning an arbitrary string (e.g. an ISO date) into a
 * PRNG seed.
 */
export function hashStringToSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Fisher–Yates shuffle driven by a seeded PRNG. Pure: returns a new array.
 */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * Compute a stable run seed from a set of item createdAt timestamps. Uses the
 * max timestamp so each ingest run (which inserts items with fresh createdAt)
 * yields a new seed, while repeat reads of the same dataset return the same
 * seed.
 *
 * Returns 0 for an empty input — callers can treat that as "no shuffle needed".
 */
export function computeRunSeedFromCreatedAt(createdAts: readonly Date[]): number {
  if (createdAts.length === 0) return 0;
  let maxMs = 0;
  for (const d of createdAts) {
    const ms = d.getTime();
    if (ms > maxMs) maxMs = ms;
  }
  if (maxMs === 0) return 0;
  return hashStringToSeed(new Date(maxMs).toISOString());
}
