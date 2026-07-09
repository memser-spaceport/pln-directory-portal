/**
 * Affinity-direct path builder for neuro seed (mirrors data-enrichment
 * affinity-direct-path.util.ts — keep in sync).
 */
import { affinityBoost } from './affinity-warmth-boost.util';

export const AFFINITY_DIRECT_STRENGTH_THRESHOLD = 0.3;

export interface PlConnectorInput {
  name: string;
  internalId?: number;
  strength?: number | null;
  recencyDays?: number | null;
  evidenceKind?: string | null;
  evidenceDate?: string | null;
  eventOnly?: boolean;
  tier?: number;
  attributionSource?: 'affinity-v1' | 'keyContact' | 'lastContact' | 'lastEmail';
}

const ROSTER_SOURCES = new Set(['keyContact', 'lastContact', 'lastEmail']);

/**
 * True when the connector is strong enough to *create* an Affinity-direct warm path.
 * Email-tier / one-way ties alone do not qualify (LAB-2108); they may still appear
 * as Affinity attribution on other paths. Roster CRM hints still qualify.
 */
export function passesAffinityDirectThreshold(connector: PlConnectorInput): boolean {
  if (connector.attributionSource && ROSTER_SOURCES.has(connector.attributionSource)) {
    return true;
  }
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
  const { targetInvestorId, plConnector, caliber, caliberConfidence } = input;
  const score = affinityBoost(plConnector);
  const caliberSuffix = caliber ?? '';
  // Affinity copy lives in hopChain.attributionLines (seed); keep explanation for
  // route/prior-backing narrative only (LAB-2108).
  const provenance =
    plConnector.attributionSource && plConnector.attributionSource !== 'affinity-v1'
      ? 'affinity-direct-roster'
      : 'affinity-direct';

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
          provenance,
        },
      ],
      explanation: '',
      plConnector,
    },
  };
}
