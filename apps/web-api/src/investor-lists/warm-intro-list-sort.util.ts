/** Sort keys for graphed Warm Intros list members (Task 07). Smaller = warmer / higher priority. */

export interface WarmIntroSortFields {
  hasPath: boolean;
  hops: number | null;
  score: number | null;
  bestProximityCode: string | null;
  lastName: string | null;
}

function caliberRank(code: string | null): number {
  if (!code) return 2;
  const m = /\+(\d)([AB])/.exec(code);
  if (!m) return 2;
  return m[2] === 'A' ? 0 : 1;
}

/**
 * Comparator for listMembers sort: cold last → direct (fewer hops) → higher score
 * → caliber A before B → last name.
 */
export function compareWarmIntroMembers(a: WarmIntroSortFields, b: WarmIntroSortFields): number {
  if (a.hasPath !== b.hasPath) return a.hasPath ? -1 : 1;

  if (!a.hasPath && !b.hasPath) {
    return (a.lastName ?? '').localeCompare(b.lastName ?? '');
  }

  const hopsA = a.hops ?? 99;
  const hopsB = b.hops ?? 99;
  if (hopsA !== hopsB) return hopsA - hopsB;

  const scoreA = a.score ?? 0;
  const scoreB = b.score ?? 0;
  if (scoreB !== scoreA) return scoreB - scoreA;

  const calDiff = caliberRank(a.bestProximityCode) - caliberRank(b.bestProximityCode);
  if (calDiff !== 0) return calDiff;

  return (a.lastName ?? '').localeCompare(b.lastName ?? '');
}
