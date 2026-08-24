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
  Coresignal = 'coresignal',
}

/** The gap-fillable member fields this pipeline can enrich. */
export const MEMBER_ENRICHABLE_FIELDS = [
  'primaryTeamRole',
  'workHistory',
  'bio',
  'email',
  'skills',
  'linkedinHandler',
  'twitterHandler',
  'githubHandler',
  'telegramHandler',
  'blueskyHandler',
] as const;
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

/**
 * Coresignal usage snapshot, mirroring `MemberScrapingDogUsage`'s shape.
 * `fellBackToScrapingDog` is only meaningful when `used` is true — it records
 * whether the Coresignal lookup came back empty/erroring and the pipeline
 * fell through to ScrapingDog for this member in the same run.
 */
export interface MemberCoresignalUsage {
  used: boolean;
  fetchedAt?: string;
  fellBackToScrapingDog?: boolean;
}

export interface MemberEnrichmentUsageEntry {
  runs: number;
  lastRunAt: string;
}

/**
 * Which profile provider a member's fetch step should prefer.
 * - `auto` (default): decided by `isHighValueMemberForCoresignal` — Coresignal for
 *   high-value members (accessLevel L5/L6, team lead, founder, fund team, or a
 *   high-priority team), ScrapingDog for everyone else.
 * - `coresignal`: always attempt Coresignal first regardless of value tier — still
 *   falls back to ScrapingDog if Coresignal has nothing usable.
 * - `scrapingdog`: always use ScrapingDog only — Coresignal is never attempted for
 *   this member, regardless of value tier.
 * Set via `trigger-force-profile-enrichment(-bulk)`'s `source` param; absent (undefined)
 * on members marked by the regular eligibility-marking cron, which is treated as `auto`.
 */
export type MemberEnrichmentSourcePreference = 'auto' | 'coresignal' | 'scrapingdog';

export interface MemberDataEnrichment {
  shouldEnrich: boolean;
  status: EnrichmentStatus;
  isAIGenerated?: boolean;
  enrichedAt?: string;
  enrichedBy?: string; // 'system-cron' or admin email
  errorMessage?: string;
  fieldsMeta: Partial<Record<MemberEnrichableField, MemberFieldEnrichmentMeta>>;
  scrapingDog?: MemberScrapingDogUsage;
  coresignal?: MemberCoresignalUsage;
  preferredSource?: MemberEnrichmentSourcePreference;
  usage?: {
    bio?: MemberEnrichmentUsageEntry;
    skills?: MemberEnrichmentUsageEntry;
  };
}
