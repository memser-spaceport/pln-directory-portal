/**
 * Types for Fund Data Enrichment CLI Command
 */

// Database query result types
export interface FundToEnrich {
  uid: string;
  name: string;
  website: string | null;
  blog: string | null;
  linkedinHandler: string | null;
  twitterHandler: string | null;
  telegramHandler: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  moreDetails: string | null;
  investorProfile: {
    uid: string;
    investmentFocus: string[];
  } | null;
  logo: {
    uid: string;
    url: string;
  } | null;
}

// Fields that can be enriched
export interface EnrichableFields {
  website: string | null;
  blog: string | null;
  linkedinHandler: string | null;
  twitterHandler: string | null;
  telegramHandler: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  moreDetails: string | null;
  investmentFocus: string[];
  logoUrl: string | null;
  logoDomain: string | null;
}

// Confidence levels for enriched data
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceMap {
  website?: ConfidenceLevel;
  blog?: ConfidenceLevel;
  linkedinHandler?: ConfidenceLevel;
  twitterHandler?: ConfidenceLevel;
  telegramHandler?: ConfidenceLevel;
  shortDescription?: ConfidenceLevel;
  longDescription?: ConfidenceLevel;
  moreDetails?: ConfidenceLevel;
  investmentFocus?: ConfidenceLevel;
  logoUrl?: ConfidenceLevel;
}

// AI response structure
export interface AIEnrichmentResponse {
  website: string | null;
  blog: string | null;
  linkedinHandler: string | null;
  twitterHandler: string | null;
  telegramHandler: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  moreDetails: string | null;
  investmentFocus: string[] | null;
  logoUrl: string | null;
  confidence: ConfidenceMap;
  sources: string[];
}

// Enriched fund data for output
export interface EnrichedFundData {
  uid: string;
  name: string;
  originalData: {
    website: string | null;
    blog: string | null;
    linkedinHandler: string | null;
    twitterHandler: string | null;
    telegramHandler: string | null;
    shortDescription: string | null;
    longDescription: string | null;
    moreDetails: string | null;
    investorProfile: {
      uid: string;
      investmentFocus: string[];
    } | null;
    logoUrl: string | null;
  };
  enrichedData: EnrichableFields;
  confidence: ConfidenceMap;
  sources: string[];
  status: 'enriched' | 'skipped' | 'error';
  fieldsUpdated: string[];
  error?: string;
}

// Skipped fund entry
export interface SkippedFund {
  uid: string;
  name: string;
  reason: string;
}

// Output metadata
export interface EnrichmentMetadata {
  generatedAt: string;
  totalFunds: number;
  enrichedFunds: number;
  skippedFunds: number;
  modelUsed: string;
  version: string;
}

// Complete dry-run output
export interface EnrichmentOutput {
  metadata: EnrichmentMetadata;
  funds: EnrichedFundData[];
  skipped: SkippedFund[];
}

// Apply result
export interface ApplyResult {
  success: boolean;
  teamsUpdated: number;
  investorProfilesUpdated: number;
  logosUploaded: number;
  rollbackFilePath: string;
  errors: Array<{ uid: string; error: string }>;
}

// Command options
export interface DryRunOptions {
  output?: string;
  limit?: number;
  fundUid?: string;
}

export interface ApplyOptions {
  input: string;
  rollbackOutput?: string;
}

export interface RollbackOptions {
  input: string;
}
