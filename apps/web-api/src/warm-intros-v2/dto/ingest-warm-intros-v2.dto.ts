/**
 * Warm Intros v2 — ConnectionEdge + WarmPathV2 service ingest + read queries.
 *
 * Upsert keys:
 *   edges: (fromProfileUid, toProfileUid, relationKind)
 *   paths: (targetProfileUid, targetSet, rank)
 * Pure upsert only — does not delete other rows.
 * Whole-batch fail on first invalid row (same as MasterProfile ingest).
 */

export interface ConnectionEdgeInput {
  fromProfileUid: string;
  toProfileUid: string;
  /** Default/expect `pl_direct`. */
  relationKind: string;
  score: number;
  confidence: number;
  /** `llm` | `hybrid`. */
  method: string;
  reasons: unknown;
  hintsUsed?: unknown | null;
  provider?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  contentHash?: string | null;
  /** May inherit batch runId when omitted. */
  runId?: string | null;
}

export interface IngestConnectionEdgesDto {
  runId?: string;
  edges: ConnectionEdgeInput[];
}

export interface WarmPathV2Input {
  targetProfileUid: string;
  targetSet: string;
  rank: number;
  score: number;
  /** `1` in iteration 1. */
  hopCount: number;
  hopChain: unknown;
  bestConnectorProfileUid?: string | null;
  alternateConnectorProfileUids?: unknown | null;
  runId?: string | null;
  /** ISO datetime; server defaults to now when omitted. */
  computedAt?: string | null;
}

export interface IngestWarmPathsV2Dto {
  runId?: string;
  paths: WarmPathV2Input[];
}

export interface IngestWarmIntrosV2Response {
  runId?: string;
  received: number;
  upserted: number;
  created: number;
  updated: number;
}

export class ListWarmPathsV2QueryDto {
  /** `neuro-fund-i` | `gold-co-investors` */
  targetSet?: string;
  /** Paths where bestConnector OR alternates include this uid. */
  connectorProfileUid?: string;
  minScore?: string;
  /** Default `1` (best path only for list view). */
  rank?: string;
  limit?: string;
  offset?: string;
}

export class GetWarmPathsByInvestorQueryDto {
  targetSet?: string;
}

export class ListConnectionEdgesQueryDto {
  fromProfileUid?: string;
  toProfileUid?: string;
  relationKind?: string;
  limit?: string;
}
