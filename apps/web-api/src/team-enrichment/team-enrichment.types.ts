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

export interface FieldEnrichmentMeta {
  status: FieldEnrichmentStatus;
  confidence?: FieldConfidence;
  source?: EnrichmentSource;
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
  fieldsMeta: Partial<Record<EnrichableField | 'logo', FieldEnrichmentMeta>>;
  scrapingDog?: {
    used: boolean;
    fetchedAt: string;
    fields: string[];
    linkedinInternalId?: string | null;
  };
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
