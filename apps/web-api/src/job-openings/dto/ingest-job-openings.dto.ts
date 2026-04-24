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
  location?: string;
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
  signalId?: string;
  canonicalKey: string;
  teamUid?: string;
  needsReview?: string;
  notes?: string;
  portfolio?: string;
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
  failed: number;
  errors?: string[];
}
