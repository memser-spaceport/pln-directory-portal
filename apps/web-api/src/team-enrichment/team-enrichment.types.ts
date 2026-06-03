export enum EnrichmentStatus {
  PendingEnrichment = 'PendingEnrichment',
  InProgress = 'InProgress',
  Enriched = 'Enriched',
  FailedToEnrich = 'FailedToEnrich',
  Reviewed = 'Reviewed',
  Approved = 'Approved',
}

export enum FieldEnrichmentStatus {
  Enriched = 'Enriched',
  ChangedByUser = 'ChangedByUser',
  CannotEnrich = 'CannotEnrich',
}

export enum FieldConfidence {
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

export enum EnrichmentSource {
  AI = 'ai',
  OpenGraph = 'open-graph',
  ScrapingDog = 'scrapingdog',
  /** Pulled from a team-lead Member row whose value matches the team's identity. */
  TeamLead = 'team-lead',
}

export enum JudgmentStatus {
  PendingJudgment = 'PendingJudgment',
  InProgress = 'InProgress',
  Judged = 'Judged',
  FailedToJudge = 'FailedToJudge',
}

export enum JudgmentVerdict {
  Agrees = 'agrees',
  Disagrees = 'disagrees',
  Uncertain = 'uncertain',
}

export enum JudgmentSource {
  ScrapingDog = 'scrapingdog',
  AI = 'ai',
  /** Stage 1.5 — deterministic cross-field corroboration (no LLM, no network). */
  Corroboration = 'corroboration',
}

export type NameMatchTier = 'exact' | 'partial' | 'none';

export interface FieldJudgment {
  confidence: FieldConfidence;
  score?: number;
  verdict: JudgmentVerdict;
  note?: string;
  judgedVia: JudgmentSource;
}

export const FIELD_JUDGMENT_NOTE_MAX_LENGTH = 60;
export const TEAM_JUDGMENT_ASSESSMENT_MAX_LENGTH = 120;

export interface FieldEnrichmentMeta {
  status: FieldEnrichmentStatus;
  confidence?: FieldConfidence;
  source?: EnrichmentSource;
  judgment?: FieldJudgment;

  // ISO timestamp of the most recent write to this field's value
  lastModifiedAt?: string;
}

/** Scalar fields on the Team model that can be enriched directly. */
export const ENRICHABLE_TEAM_FIELDS = [
  'website',
  'blog',
  'contactMethod',
  'twitterHandler',
  'linkedinHandler',
  'telegramHandler',
  'shortDescription',
  'longDescription',
  'moreDetails',
] as const;

/** Relational / array fields tracked in enrichment metadata but handled separately. */
export const ENRICHABLE_RELATION_FIELDS = ['industryTags', 'investmentFocus'] as const;

export type EnrichableTeamField = typeof ENRICHABLE_TEAM_FIELDS[number];
export type EnrichableRelationField = typeof ENRICHABLE_RELATION_FIELDS[number];
export type EnrichableField = EnrichableTeamField | EnrichableRelationField;

/**
 * Keys tracked in `dataEnrichment.fieldsMeta`. `logo` is included because the
 * enrichment pipeline records provenance for it, even though it isn't filled
 * by the AI text response (it comes from OG scraping or ScrapingDog).
 */
export type FieldMetaKey = EnrichableField | 'logo';

export type ForceEnrichmentMode = 'all' | 'cannotEnrich';

/**
 * Per-team quality block computed at judge time. Mirrors the 6-dimension
 * scoring doctrine from pln-data-enrichment/apps/signal-sourcing/src/quality.
 * `thinEvidence` is the surfaced flag — true when the team has too few
 * independent sources or core fields to be considered well-attested, even
 * if individual field judgments look high-confidence.
 */
export interface TeamQuality {
  /** Populated enrichable fields / total enrichable fields. */
  completeness: number;
  /** Fraction of populated URL/email-shaped fields that pass URL/email validation. */
  validity: number;
  /** 1 - days_since_enriched/365 (clamped [0,1]). */
  freshness: number;
  /** Count of distinct sources contributing any field (ai, open-graph, scrapingdog, website-signals). */
  distinctSources: number;
  /** distinctSources < 2 OR fewer than 3 core fields populated. */
  thinEvidence: boolean;
  /** Dedup'd list of every Stage 1.5 anchor note from this run (explainability). */
  anchorsFired: string[];
}

export interface TeamJudgment {
  status: JudgmentStatus;
  judgedAt?: string;
  judgedBy?: string;
  aiModel?: string;
  errorMessage?: string;
  overallAssessment?: string;
  fieldsForReview?: string[];
  scrapingDog?: {
    used: boolean;
    fetchedAt: string;
    nameMatch: NameMatchTier;
    companyNameFromLinkedIn: string | null;
    verifiedFields: string[];
    linkedinInternalId: string | null;
    websiteReachable?: boolean | null;
    websiteFinalHost?: string | null;
  };
  quality?: TeamQuality;
}

/**
 * Aggregated AI token usage + estimated cost for one stage (enrichment or judge)
 * of a team's pipeline. Accumulates across re-runs (force-enrichment, force-judge)
 * via `runs`. Cost is an estimate from the in-app pricing table — see
 * `team-enrichment-cost.ts` for the caveats.
 */
export interface AIUsageEntry {
  inputTokens: number;
  outputTokens: number;
  /** Only populated when the provider exposes a cached-prompt token count (Gemini, Anthropic, OpenAI Responses). */
  cachedInputTokens?: number;
  totalTokens: number;
  /** Estimated USD cost for the tokens, using the provider's published per-token rates. */
  costUsd: number;
  aiModel: string;
  /** Wall-clock time spent inside generateText for this stage, summed across runs. */
  durationMs: number;
  /** Number of AI calls accumulated into this entry. >1 means re-runs (force mode, retries). */
  runs: number;
  /** ISO timestamp of the most recent AI call contributing to this entry. */
  lastRunAt: string;
}

export interface TeamEnrichmentUsage {
  enrichment?: AIUsageEntry;
  judge?: AIUsageEntry;
}

/**
 * Self-declared signals extracted from the team's website HTML during enrichment
 * (JSON-LD, Twitter Cards, microdata, anchors, OG tags). Persisted as a
 * second independent source so the judge's Stage 1.5 corroboration layer can
 * verify AI-filled fields without consulting an LLM. Optional: only populated
 * when the website was reachable AND at least one signal was extracted.
 */
export interface WebsiteSignals {
  /** ISO timestamp of the extraction run. */
  extractedAt: string;
  /** Normalized host (no www., lowercase) the signals came from. */
  host?: string | null;
  twitterHandler?: string | null;
  linkedinHandler?: string | null;
  telegramHandler?: string | null;
  contactEmail?: string | null;
  jsonLdOrgName?: string | null;
  ogSiteName?: string | null;
  metaDescription?: string | null;
}

export interface TeamDataEnrichment {
  shouldEnrich: boolean;
  status: EnrichmentStatus;
  isAIGenerated: boolean;
  enrichedAt?: string;
  enrichedBy?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  errorMessage?: string;
  aiModel?: string;
  fieldsMeta: Partial<Record<FieldMetaKey, FieldEnrichmentMeta>>;
  scrapingDog?: {
    used: boolean;
    fetchedAt: string;
    fields: string[];
    linkedinInternalId?: string | null;
  };
  /** Second-source signals scraped from the team's website (independent of AI / ScrapingDog). */
  websiteSignals?: WebsiteSignals;
  judgment?: TeamJudgment;
  /** AI token usage + cost estimate per stage. Optional — pre-tracking teams won't have it. */
  usage?: TeamEnrichmentUsage;
}

export interface AIJudgeResponse {
  fields: Record<
    string,
    {
      confidence: 'high' | 'medium' | 'low';
      score: number;
      verdict: 'agrees' | 'disagrees' | 'uncertain';
      note: string;
    }
  >;
  overallAssessment: string;
}

export interface AITeamEnrichmentResponse {
  website: string | null;
  websiteOwnerName: string | null;
  websiteCandidates: string[];
  blog: string | null;
  contactMethod: string | null;
  linkedinHandler: string | null;
  twitterHandler: string | null;
  telegramHandler: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  moreDetails: string | null;
  industryTags: string[];
  investmentFocus: string[];
  confidence: Record<string, string>;
  sources: string[];
}
