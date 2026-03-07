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

export const ENRICHABLE_TEAM_FIELDS = [
  'blog',
  'contactMethod',
  'twitterHandler',
  'linkedinHandler',
  'telegramHandler',
  'shortDescription',
  'longDescription',
  'moreDetails',
] as const;

export type EnrichableTeamField = typeof ENRICHABLE_TEAM_FIELDS[number];

export interface TeamDataEnrichment {
  shouldEnrich: boolean;
  status: EnrichmentStatus;
  isAIGenerated: boolean;
  enrichedAt?: string;
  enrichedBy?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  errorMessage?: string;
  fields: Partial<Record<EnrichableTeamField, FieldEnrichmentStatus>>;
}

export interface AITeamEnrichmentResponse {
  blog: string | null;
  contactMethod: string | null;
  linkedinHandler: string | null;
  twitterHandler: string | null;
  telegramHandler: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  moreDetails: string | null;
  confidence: Record<string, string>;
  sources: string[];
}
