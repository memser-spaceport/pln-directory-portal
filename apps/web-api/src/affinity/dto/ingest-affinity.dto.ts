export type AffinityIngestScope = 'full' | 'founders' | 'companies';

export interface AffinityListMembershipInput {
  affinity_list_id: number;
  affinity_list_entry_id: number;
  list_name: string;
  list_fields?: Record<string, unknown> | null;
}

export interface AffinityPersonOrganizationInput {
  affinity_org_id: string;
  is_current?: boolean;
  job_title?: string | null;
}

export interface AffinityCompanyIngestItem {
  affinity_org_id: string;
  name: string;
  domain?: string | null;
  domains?: string[];
  builders_funnel_record_id?: string | null;
  deal_status?: string | null;
  tags?: string[];
  token_status?: string | null;
  post_money_valuation?: number | null;
  exit_date?: string | null;
  deck_link?: string | null;
  accelerator_program?: string | null;
  investor_type?: string | null;
  relationship_roles?: string[];
  fund_relevance?: string[];
  description?: string | null;
  investment_stage?: string | null;
  industries?: string[];
  investors?: string[];
  year_founded?: number | null;
  total_funding_usd?: number | null;
  last_funding_usd?: number | null;
  last_funding_date?: string | null;
  linkedin_url?: string | null;
  employee_count?: number | null;
  linkedin_headcount?: number | null;
  location?: Record<string, unknown> | null;
  priority?: string | null;
  kpi_list_status?: string | null;
  mrr?: number | null;
  revenue_ltm?: number | null;
  monthly_burn?: number | null;
  cash_balance?: number | null;
  runway_months?: number | null;
  team_fte?: number | null;
  total_users?: number | null;
  maus?: number | null;
  daus?: number | null;
  initial_investment_usd?: number | null;
  valuation_at_investment_usd?: number | null;
  latest_post_money_usd?: number | null;
  funded_via?: string[];
  kpi_last_update_at?: string | null;
  plan_to_fundraise_6mo?: string | null;
  last_contact_at?: string | null;
  last_email_at?: string | null;
  first_email_at?: string | null;
  last_event_at?: string | null;
  first_event_at?: string | null;
  next_event_at?: string | null;
  source_of_introduction?: Record<string, unknown> | null;
  linked_person_ids?: number[];
  raw_fields: Record<string, unknown>;
  list_memberships?: AffinityListMembershipInput[];
}

export interface AffinityPersonIngestItem {
  affinity_person_id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  primary_email?: string | null;
  email_addresses?: string[];
  builders_funnel_record_id?: string | null;
  telegram?: string | null;
  linkedin_url?: string | null;
  phone_numbers?: string[];
  current_job_title?: string | null;
  current_organization_name?: string | null;
  current_organization_affinity_id?: string | null;
  industries?: string[];
  location?: Record<string, unknown> | null;
  relationship_tiers?: string[];
  relationship_roles?: string[];
  fund_relevance?: string[];
  investor_types?: string[];
  stage_preference?: string | null;
  sector_focus?: string | null;
  data_sources?: string[];
  data_quality?: string | null;
  engagement_score?: number | null;
  relationship_score?: number | null;
  quality_score?: number | null;
  key_contact?: string | null;
  standing?: string | null;
  list_status?: string | null;
  gender?: string | null;
  last_contact_at?: string | null;
  last_email_at?: string | null;
  first_email_at?: string | null;
  last_event_at?: string | null;
  first_event_at?: string | null;
  next_event_at?: string | null;
  source_of_introduction?: Record<string, unknown> | null;
  raw_fields: Record<string, unknown>;
  list_memberships?: AffinityListMembershipInput[];
  organizations?: AffinityPersonOrganizationInput[];
  relationship_owner?: {
    name: string;
    email?: string | null;
    affinity_person_id?: string | null;
  } | null;
  last_contact_summary?: string | null;
  last_contact_method?: string | null;
  touchpoints_6m?: number | null;
  touchpoints_by_month?: { label: string; count: number }[] | null;
  frequency_tier?: 'high' | 'neglected' | null;
  interaction_window_months?: number | null;
}

export interface IngestAffinityDto {
  runId: string;
  scope: AffinityIngestScope;
  dryRun?: boolean;
  companies?: AffinityCompanyIngestItem[];
  persons?: AffinityPersonIngestItem[];
}

export interface IngestAffinityResponse {
  runId: string;
  received: { companies: number; persons: number };
  ingested: { companies: number; persons: number };
  linked: {
    companiesToTeam: number;
    personsToMember: number;
    personsToCompany: number;
  };
  unmatched: { companies: number; persons: number };
  failed: number;
  errors?: string[];
}
