export interface InvestorOutreachIngestItem {
  investor_id: string;
  canonical_id?: string;
  dedupe_key: string;
  source: string;
  first_name?: string;
  last_name?: string;
  email: string;
  email_status: string;
  linkedin_url?: string;
  firm?: string;
  firm_domain?: string;
  title?: string;
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
}

export interface IngestInvestorOutreachDto {
  runId?: string;
  /** Provenance tag for ingest batch (distinct from row `source`) */
  source?: string;
  items: InvestorOutreachIngestItem[];
}

export interface IngestInvestorOutreachResponse {
  received: number;
  ingested: number;
  created: number;
  updated: number;
  failed: number;
  errors?: string[];
}
