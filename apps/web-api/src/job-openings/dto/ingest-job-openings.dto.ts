export interface JobOpeningIngestItem {
  status: string;
  companyName: string;
  signalType: string;
  roleTitle: string;
  roleCategory?: string;
  department?: string;
  seniority?: string;
  urgency?: string;
  summary?: string;
  descriptionHtml?: string;
  locations?: string[];
  location?: string | string[];
  workMode?: string;
  ws4AskId?: string;
  detectionDate: string;
  sourceType?: string;
  sourceLink?: string;
  detectionMethod?: string;
  companyPriority?: string;
  focusAreas?: string;
  subFocusAreas?: string;
  teamNotified?: string;
  sourceDate?: string;
  postedDate?: string;
  lastSeenLive?: string;
  closedAt?: string;
  signalId?: string;
  canonicalKey: string;
  dedupKey: string;
  teamUid?: string;
  needsReview?: string;
  notes?: string;
  portfolio?: string;
  /** Ownership the caller claims for the row. This endpoint is the crawler's, so only 'ENRICHMENT' is accepted. */
  managedBy?: string;
}

export interface IngestJobOpeningsDto {
  jobs: JobOpeningIngestItem[];
  runId?: string;
  source?: string;
}

export interface IngestJobOpeningsResponse {
  received: number;
  created: number;
  updated: number;
  /** Items whose existing row is owned by another system (INTEGRATION or MANUAL). Never written. */
  skipped: number;
  failed: number;
  errors?: string[];
  /** One `<reason>: <dedupKey>` entry per skipped item. */
  skippedReasons: string[];
}
