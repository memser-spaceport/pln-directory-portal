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
  };
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
  judgment?: TeamJudgment;
}

export interface AIJudgeResponse {
  fields: Record<string, {
    confidence: 'high' | 'medium' | 'low';
    score: number;
    verdict: 'agrees' | 'disagrees' | 'uncertain';
    note: string;
  }>;
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
