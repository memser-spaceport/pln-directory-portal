/**
 * Per-row portfolio overlap edge sent inside an InvestorOutreachIngestItem.
 *
 * Each entry maps the investor (the row owner) to a PL portfolio Team they're known to be on the
 * cap table of. team_uid must refer to an existing Team. Sync semantics: see service docs.
 */
export interface InvestorOutreachPortfolioOverlapInput {
  team_uid: string;
  deal_amount?: number;
  /** YYYY-MM-DD */
  deal_date?: string;
  deal_stage?: string;
  is_lead_investor?: boolean;
  /** Free-form attribution string (e.g. "PL Capital", "PLVS"). Validated against vocab. */
  attribution_fund?: string;
}

/**
 * Top-level entry describing PL portfolio team metadata used by the warm-intros workspace.
 * Independent of the per-row items array; team_uid must refer to an existing Team.
 */
export interface InvestorOutreachPortfolioTeamInput {
  team_uid: string;
  /** YYYY-MM-DD */
  pl_invested_at?: string;
  pl_invested_stage?: string;
  raising_now?: string;
  raising_stage?: string;
  last_round_stage?: string;
  /** YYYY-MM-DD */
  last_round_date?: string;
  /** YYYY-MM-DD */
  raising_as_of?: string;
  raising_source?: string;
  /** Comma-separated sector tags, matching the row-level sector_tags convention. */
  sectors?: string;
  geo?: string;
}

export interface InvestorOutreachIngestItem {
  investor_id: string;
  canonical_id?: string;
  dedupe_key: string;
  source: string;
  first_name?: string;
  last_name?: string;
  email: string;
  /** Secondary emails beyond `email`; omitted on update preserves existing values. */
  additional_emails?: string[];
  email_status: string;
  linkedin_url?: string;
  firm?: string;
  firm_domain?: string;
  title?: string;
  /** Firm-level warm-intro reachability, e.g. "VC+1A", "C". Free string, ≤8 chars. */
  proximity_code?: string;
  investor_type: string;
  fund_thesis?: string;
  aum_range?: string;
  check_size_range?: string;
  stage_focus: string;
  sector_tags?: string;
  geo_focus?: string;
  recent_deals?: string;
  outreach_touches?: number;
  outreach_campaigns?: string;
  opened?: number;
  clicked?: number;
  registered?: number;
  first_sent_date?: string;
  last_sent_date?: string;
  engagement_tier: string;
  enrichment_status: string;
  enrichment_date?: string;
  last_enrichment_attempt?: string;
  enrichment_notes?: string;
  tags?: string[];
  portfolio_overlaps?: InvestorOutreachPortfolioOverlapInput[];
}

export interface IngestInvestorOutreachDto {
  runId?: string;
  source?: string;
  items: InvestorOutreachIngestItem[];
  portfolio_teams?: InvestorOutreachPortfolioTeamInput[];
}

export interface IngestInvestorOutreachResponse {
  received: number;
  ingested: number;
  created: number;
  updated: number;
  failed: number;
  overlaps_synced?: number;
  portfolio_teams_upserted?: number;
  errors?: string[];
}
