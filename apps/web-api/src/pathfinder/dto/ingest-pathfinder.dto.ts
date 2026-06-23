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

/** People-first route presentation (task 06). Stored camelCase in DB JSON. */
export interface RouteNodeContact {
  name: string;
  role?: string;
  email?: string;
  linkedin?: string;
  telegram?: string;
  memberUid?: string;
  imageUrl?: string;
  affinityId?: string;
  source?: 'gold_list' | 'v8' | 'labos' | 'portfolio';
}

export interface PathRouteNode {
  label: string;
  orgName?: string;
  memberUid?: string;
  teamUid?: string;
  logo?: string;
  variant: 'member' | 'external' | 'org';
  contacts?: RouteNodeContact[];
}

/** Table/drawer hop node — matches FE PathHopNode / mapHopNode contract. */
export interface PathHopNodeDto {
  id: string;
  label: string;
  type: 'person' | 'org';
  memberUid?: string;
  teamUid?: string;
  orgName?: string;
  imageUrl?: string;
  email?: string;
  contacts?: RouteNodeContact[];
}

export interface PathContactPerson {
  name: string;
  role: string;
  email?: string;
  linkedin?: string;
  telegram?: string;
  memberUid?: string;
  teams?: Array<{ name: string; teamUid?: string; logo?: string }>;
}

export interface PathOrgConnector {
  name: string;
  teamUid?: string;
  logo?: string;
  description: string;
  tags: string[];
  email?: string;
  website?: string;
  affinityOrgId?: string;
  contacts?: RouteNodeContact[];
}

export interface PathConnectorTeam {
  name: string;
  teamUid?: string;
  leads: PathContactPerson[];
}

export interface PathfinderHopChain {
  nodes: PathfinderHopChainNode[];
  edges: PathfinderHopChainEdge[];
  explanation: string;
  /**
   * People-first route chain for table/drawer (stored as camelCase `routeNodes` in DB).
   * May be 2–3 nodes before investor terminus:
   *   case 1 — [PL connector person, investor]
   *   case 2 — [PL connector person, bridge, investor]
   *   case 3 — [Protocol Labs org, bridge, investor]
   */
  route_nodes?: PathRouteNode[];
  contact?: PathContactPerson;
  /** @deprecated Prefer org_connectors[0] */
  org_connector?: PathOrgConnector;
  org_connectors?: PathOrgConnector[];
  connector_team?: PathConnectorTeam;
  pl_connector?: Record<string, unknown>;
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
