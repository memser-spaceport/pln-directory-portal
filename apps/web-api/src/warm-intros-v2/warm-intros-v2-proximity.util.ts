/**
 * Display rules for Warm Intros v2 path list/detail (API-computed; FE must not invent).
 *
 * Score bands (scorePercent 0–100):
 *   >60 green · 25–60 yellow · 1–25 red · else none
 *
 * Caliber: "A" if score >= 0.60, else "B" when score > 0; null if score ≤ 0.
 * proximityCode: `{family}+{hopCount}{caliber}` e.g. PL+1A.
 */

export type WarmPathCaliber = 'A' | 'B';
export type WarmPathScoreBand = 'green' | 'yellow' | 'red' | 'none';

export type WarmPathProximity = {
  caliber: WarmPathCaliber | null;
  scorePercent: number;
  scoreBand: WarmPathScoreBand;
  /** Null when caliber is null (no display code). */
  proximityCode: string | null;
};

/**
 * Derive connector family for proximity codes.
 * Iteration 1: PL-direct paths → `PL`.
 */
export function deriveConnectorFamily(input: { hopChain?: unknown; relationKind?: string | null }): string {
  const relationKind =
    (typeof input.relationKind === 'string' && input.relationKind.trim()) ||
    (input.hopChain &&
    typeof input.hopChain === 'object' &&
    !Array.isArray(input.hopChain) &&
    typeof (input.hopChain as Record<string, unknown>).relationKind === 'string'
      ? String((input.hopChain as Record<string, unknown>).relationKind).trim()
      : '');

  if (relationKind === 'pl_direct') return 'PL';

  if (input.hopChain && typeof input.hopChain === 'object' && !Array.isArray(input.hopChain)) {
    const hops = (input.hopChain as Record<string, unknown>).hops;
    if (
      Array.isArray(hops) &&
      hops.some((h) => h && typeof h === 'object' && (h as Record<string, unknown>).role === 'pl_connector')
    ) {
      return 'PL';
    }
  }

  return 'PL';
}

export function computeCaliber(score: number): WarmPathCaliber | null {
  if (!Number.isFinite(score) || score <= 0) return null;
  if (score >= 0.6) return 'A';
  return 'B';
}

export function computeScorePercent(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.round(Math.min(Math.max(score, 0), 1) * 100);
}

/**
 * Color bands for FE: based on scorePercent (0–100).
 * >60 green · 25–60 yellow · 1–25 red · else none
 */
export function computeScoreBand(scorePercent: number): WarmPathScoreBand {
  if (!Number.isFinite(scorePercent) || scorePercent <= 0) return 'none';
  if (scorePercent > 60) return 'green';
  if (scorePercent >= 25) return 'yellow';
  return 'red'; // 1–25
}

export function buildProximityCode(family: string, hopCount: number, caliber: WarmPathCaliber | null): string | null {
  if (!caliber) return null;
  const hops = Number.isFinite(hopCount) && hopCount > 0 ? Math.trunc(hopCount) : 1;
  const fam = (family || 'PL').trim() || 'PL';
  return `${fam}+${hops}${caliber}`;
}

export function computeWarmPathProximity(input: {
  score: number;
  hopCount?: number | null;
  hopChain?: unknown;
  relationKind?: string | null;
  connectorFamily?: string | null;
}): WarmPathProximity {
  const caliber = computeCaliber(input.score);
  const scorePercent = computeScorePercent(input.score);
  const scoreBand = computeScoreBand(scorePercent);
  const family =
    (input.connectorFamily && input.connectorFamily.trim()) ||
    deriveConnectorFamily({ hopChain: input.hopChain, relationKind: input.relationKind });
  const hopCount = input.hopCount ?? 1;
  const proximityCode = buildProximityCode(family, hopCount, caliber);

  return { caliber, scorePercent, scoreBand, proximityCode };
}
