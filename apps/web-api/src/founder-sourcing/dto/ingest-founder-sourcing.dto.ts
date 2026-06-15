export type FounderFundCode = 'PLVS' | 'NEURO' | 'CRYPTO';

export interface FounderFundTagInput {
  fund: FounderFundCode;
  confidence: number;
  primary_signal?: string;
  matched_terms?: string[];
  domain?: string;
}

export interface FounderReviewStateInput {
  profile_id: string;
  status: 'new' | 'in-review' | 'approved' | 'rejected' | 'hold';
  feedback?: 'good' | 'bad' | 'wrong-fund' | 'needs-context';
  decided_at?: string;
  note?: string;
}

export interface FounderIngestItem {
  founder_id: string;
  dedupe_key: string;
  source: string;
  sources: string[];
  run_id?: string;
  signal_sourcing_version?: string;
  is_known?: boolean;

  name?: string;
  first_name?: string;
  last_name?: string;
  emails?: string[];
  primary_email?: string;
  github?: string;
  twitter?: string;
  linkedin?: string;
  telegram?: string;
  farcaster?: string;
  website?: string;
  org?: string;
  team?: string;
  team_priority?: number;
  bio?: string;
  topics?: string[];
  external_ids?: Record<string, string>;
  directory_member_id?: string;
  directory_team_id?: string;
  identity_completeness?: number;

  fund_tags?: FounderFundTagInput[];
  focus_area?: string;
  criteria_headline?: string;
  pedigree?: string;
  plvs_score?: number;
  plvs_recommendation?: 'Pass' | 'Progress' | 'Strong Pass';
  plvs_features?: Record<string, number>;
  plvs_weights_version?: string;
  alignment_max?: number;

  quality?: Record<string, number>;

  pln_proximity?: number;
  pl_alignment?: number;
  near_network?: boolean;
  pl_aligned?: boolean;
  reputation_flags?: Array<Record<string, unknown>>;
  warm_intro_paths?: Array<Record<string, unknown>>;
  intent_signals?: Array<Record<string, unknown>>;
  is_raising?: boolean;
  is_cofounder_search?: boolean;
  is_coming_out_of_stealth?: boolean;

  provenance?: Array<Record<string, unknown>>;
  last_signal_at?: string;
  last_activity_seen_at?: string;
  why_now?: string;
  thin_evidence?: boolean;
}

export interface IngestFounderSourcingDto {
  runId?: string;
  source?: string;
  methodology_version?: string;
  methodology?: Record<string, unknown>;
  items: FounderIngestItem[];
}

export interface IngestFounderSourcingResponse {
  received: number;
  ingested: number;
  created: number;
  updated: number;
  failed: number;
  errors?: string[];
}
