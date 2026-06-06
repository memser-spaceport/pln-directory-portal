/**
 * PL Path Finder — service-ingest payload (snake_case, mirroring the
 * investor-outreach ingest convention). Produced by the offline graph job in
 * pln-data-enrichment and posted to POST /v1/service/pathfinder/ingest.
 *
 * Ingest is replace-per-target: for each (targetSet, target_investor_id) the
 * existing PathfinderPath rows are deleted and replaced, so a recompute is
 * idempotent and never leaves stale paths.
 */

export interface PathfinderHopChainNode {
  id: string;
  label: string;
  type: 'person' | 'org';
}

export interface PathfinderHopChainEdge {
  from: string;
  to: string;
  connector_type: string;
  probability: number;
  evidence: string | null;
}

export interface PathfinderHopChain {
  nodes: PathfinderHopChainNode[];
  edges: PathfinderHopChainEdge[];
  explanation: string;
}

export interface PathfinderPathInput {
  target_investor_id: string;
  connector_type: string;
  hops: number;
  caliber?: string | null;
  proximity_code: string;
  score: number;
  caliber_confidence?: number | null;
  hop_chain: PathfinderHopChain | Record<string, unknown>;
  rank?: number;
}

export interface PathfinderCrosswalkInput {
  canonical_id: string;
  directory_uid?: string | null;
  affinity_id?: string | null;
  investor_id?: string | null;
  entity_type: string;
  display_name?: string | null;
  firm?: string | null;
  match_method: string;
  match_confidence: number;
  is_confirmed?: boolean;
  is_founder_lp_link?: boolean;
  needs_review?: boolean;
}

export interface PathfinderTargetSummaryInput {
  investor_id: string;
  best_proximity_code: string;
  has_path: boolean;
}

export interface IngestPathfinderDto {
  runId?: string;
  targetSet: string;
  paths: PathfinderPathInput[];
  crosswalk?: PathfinderCrosswalkInput[];
  summaries?: PathfinderTargetSummaryInput[];
}

export interface IngestPathfinderResponse {
  received: number;
  paths_ingested: number;
  targets_replaced: number;
  crosswalk_upserted: number;
  summaries_applied: number;
  failed: number;
  errors?: string[];
}
