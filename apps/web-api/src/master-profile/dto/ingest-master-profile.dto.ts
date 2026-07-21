/**
 * Warm Intros v2 — MasterProfile service ingest.
 * Posted to POST /v1/service/master-profiles/ingest (ServiceAuthGuard).
 *
 * Validation: whole-batch fail on first invalid row (empty personKey / canonicalName).
 * Upsert key: personKey (unique). Does not delete other profiles.
 * Each profile write is a full field replace: omitted optional fields are stored as null.
 */

export interface MasterProfileInput {
  personKey: string;
  types: string[];
  canonicalName: string;
  memberUid?: string | null;
  affinityPersonId?: string | null;
  investorOutreachId?: string | null;
  emails?: unknown;
  phones?: unknown;
  socials?: unknown;
  organizations?: unknown;
  experience?: unknown;
  education?: unknown;
  investorMeta?: unknown;
  funds?: unknown;
  investedIn?: unknown;
  locations?: unknown;
  listMemberships?: unknown;
  raw?: unknown;
  sourceSnapshots?: unknown;
  currentOrg?: string | null;
  currentTitle?: string | null;
  bio?: string | null;
  contentHash?: string | null;
  enrichmentVersion?: string | null;
  /** ISO datetime; server defaults to now when omitted. */
  enrichedAt?: string | null;
}

export interface IngestMasterProfileDto {
  runId?: string;
  profiles: MasterProfileInput[];
}

export interface IngestMasterProfileResponse {
  runId?: string;
  received: number;
  upserted: number;
  created: number;
  updated: number;
}

export class ListMasterProfilesQueryDto {
  personKey?: string;
  affinityPersonId?: string;
  memberUid?: string;
  investorOutreachId?: string;
  /** Filter profiles whose `types` array contains this value. */
  type?: string;
  limit?: string;
}
