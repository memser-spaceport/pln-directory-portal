/**
 * Affinity-direct path builder for neuro seed (mirrors data-enrichment
 * affinity-direct-path.util.ts — keep in sync).
 */
import { affinityBoost } from './affinity-warmth-boost.util';

export const AFFINITY_DIRECT_STRENGTH_THRESHOLD = 0.3;

const ConnectorTier = { EventOnly: 0, Email: 1, Strength: 2 } as const;

export interface PlConnectorInput {
  name: string;
  internalId?: number;
  strength?: number | null;
  recencyDays?: number | null;
  evidenceKind?: string | null;
  evidenceDate?: string | null;
  eventOnly?: boolean;
  tier?: number;
}

export function passesAffinityDirectThreshold(connector: PlConnectorInput): boolean {
  const tier = connector.tier ?? ConnectorTier.EventOnly;
  if (tier >= ConnectorTier.Email) return true;
  const strength = connector.strength;
  if (strength != null && strength >= AFFINITY_DIRECT_STRENGTH_THRESHOLD) return true;
  return false;
}

export interface AffinityDirectPathShape {
  targetInvestorId: string;
  connectorType: string;
  hops: number;
  caliber: string | null;
  caliberConfidence: number | null;
  proximityCode: string;
  score: number;
  hopChain: Record<string, unknown>;
}

export function buildAffinityDirectPath(input: {
  targetInvestorId: string;
  plConnector: PlConnectorInput;
  caliber: string | null;
  caliberConfidence: number | null;
  targetSet: string;
  summary?: string | null;
}): AffinityDirectPathShape {
  const { targetInvestorId, plConnector, caliber, caliberConfidence, summary } = input;
  const score = affinityBoost(plConnector);
  const caliberSuffix = caliber ?? '';
  const explanation = summary?.trim() || `Reach directly through ${plConnector.name} (Affinity relationship).`;

  return {
    targetInvestorId,
    connectorType: 'PL',
    hops: 1,
    caliber,
    caliberConfidence,
    proximityCode: `PL+1${caliberSuffix}`,
    score,
    hopChain: {
      nodes: [
        { id: 'PL', label: 'Protocol Labs', type: 'org' },
        { id: targetInvestorId, label: 'Investor', type: 'person' },
      ],
      edges: [
        {
          from: 'PL',
          to: targetInvestorId,
          connectorType: 'PL',
          probability: score,
          evidence: plConnector.evidenceKind ?? null,
          provenance: 'affinity-direct',
        },
      ],
      explanation,
      plConnector,
    },
  };
}
