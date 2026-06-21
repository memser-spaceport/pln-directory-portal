/**
 * Must match pln-data-enrichment/.../pathfinder/affinity-warmth-boost.util.ts
 */
const RECENCY_FLOOR = 0.1;
const RECENCY_SPAN_DAYS = 365;

const ConnectorTier = { EventOnly: 0, Email: 1, Strength: 2 } as const;

export interface PlConnectorBoostInput {
  strength?: number | null;
  recencyDays?: number | null;
  tier?: number;
  eventOnly?: boolean;
}

export function affinityBoost(connector: PlConnectorBoostInput | null | undefined): number {
  if (!connector) return 0;
  if (connector.strength != null && Number.isFinite(connector.strength)) {
    return Math.min(1, Math.max(0, connector.strength));
  }
  if (connector.recencyDays != null && Number.isFinite(connector.recencyDays)) {
    const t = Math.min(RECENCY_SPAN_DAYS, Math.max(0, connector.recencyDays));
    return RECENCY_FLOOR + (1 - RECENCY_FLOOR) * (1 - t / RECENCY_SPAN_DAYS);
  }
  if (connector.tier === ConnectorTier.Email) return 0.3;
  if (connector.tier === ConnectorTier.EventOnly) return 0.15;
  return 0;
}

export function blendGraphScore(graphScore: number, boost: number): number {
  const g = Math.min(1, Math.max(0, graphScore));
  const b = Math.min(1, Math.max(0, boost));
  return Math.min(1, g * (0.7 + 0.3 * b));
}

export function comparePathsByWarmth(
  a: { hops: number; score: number; rank?: number },
  b: { hops: number; score: number; rank?: number },
): number {
  if (a.hops !== b.hops) return a.hops - b.hops;
  if (b.score !== a.score) return b.score - a.score;
  return (a.rank ?? 0) - (b.rank ?? 0);
}
