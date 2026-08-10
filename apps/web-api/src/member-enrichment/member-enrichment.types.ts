export enum EnrichmentStatus {
  PendingEnrichment = 'PendingEnrichment',
  InProgress = 'InProgress',
  Enriched = 'Enriched',
  FailedToEnrich = 'FailedToEnrich',
}

/**
 * Per-field status. Unlike TeamEnrichment there is no candidate-column + judge
 * stage — `Enriched` here means the value was already written to its canonical
 * home (Member / TeamMemberRole / Skill), not "awaiting promotion".
 */
export enum FieldEnrichmentStatus {
  Enriched = 'Enriched',
  ChangedByUser = 'ChangedByUser',
  CannotEnrich = 'CannotEnrich',
}

export enum EnrichmentSource {
  LinkedinExperience = 'linkedin-experience',
  LinkedinProfile = 'linkedin-profile',
  XProfile = 'x-profile',
  AffinityCrm = 'affinity-crm',
  AI = 'ai',
}

/** The gap-fillable member fields this pipeline can enrich. */
export const MEMBER_ENRICHABLE_FIELDS = ['primaryTeamRole', 'workHistory', 'bio', 'email', 'skills'] as const;
export type MemberEnrichableField = typeof MEMBER_ENRICHABLE_FIELDS[number];

export interface MemberFieldEnrichmentMeta {
  status: FieldEnrichmentStatus;
  source?: EnrichmentSource;
  /** ISO timestamp of the most recent write to this field's value. */
  lastModifiedAt?: string;
  /** Short, human-readable reason — populated on CannotEnrich (e.g. "no matching team"). */
  note?: string;
}

export interface MemberScrapingDogUsage {
  used: boolean;
  fetchedAt?: string;
  source?: 'linkedin' | 'x';
}

export interface MemberEnrichmentUsageEntry {
  runs: number;
  lastRunAt: string;
}

export interface MemberDataEnrichment {
  shouldEnrich: boolean;
  status: EnrichmentStatus;
  isAIGenerated?: boolean;
  enrichedAt?: string;
  enrichedBy?: string; // 'system-cron' or admin email
  errorMessage?: string;
  fieldsMeta: Partial<Record<MemberEnrichableField, MemberFieldEnrichmentMeta>>;
  scrapingDog?: MemberScrapingDogUsage;
  usage?: {
    bio?: MemberEnrichmentUsageEntry;
    skills?: MemberEnrichmentUsageEntry;
  };
}
