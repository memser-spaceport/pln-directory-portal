// LinkedIn profile JSON structure (from linkedin-profiles/profile-{identifier}.json)
export interface LinkedInExperience {
  position: string;
  company_name: string;
  company_url?: string;
  company_image?: string;
  location?: string;
  summary?: string;
  starts_at: string; // "MMM YYYY" format (e.g., "Mar 2025")
  ends_at: string; // "MMM YYYY" or "Present"
  duration?: string;
}

export interface LinkedInProfile {
  fullName: string;
  public_identifier: string; // Key to match with linkedinHandler
  linkedin_internal_id: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  location?: string;
  about?: string;
  experience: LinkedInExperience[];
  education?: unknown[];
  // ... other fields not needed for this enrichment
}

// Member to enrich
export interface MemberToEnrich {
  uid: string;
  name: string;
  linkedinHandler: string;
}

// Mapped experience ready for insertion
export interface MappedExperience {
  title: string;
  company: string;
  location: string | null;
  description: string | null;
  startDate: Date;
  endDate: Date | null;
  isCurrent: boolean;
  memberUid: string;
}

// Enrichment result for a single member
export interface MemberEnrichmentResult {
  memberUid: string;
  memberName: string;
  linkedinHandler: string;
  profileIdentifier: string;
  status: 'enriched' | 'skipped' | 'error';
  experiencesAdded: MappedExperience[];
  error?: string;
}

// Skipped member
export interface SkippedMember {
  uid: string;
  name: string;
  linkedinHandler: string | null;
  reason: string;
}

// Metadata for output
export interface EnrichmentMetadata {
  generatedAt: string;
  totalMembers: number;
  enrichedMembers: number;
  skippedMembers: number;
  totalExperiencesAdded: number;
  profilesDir: string;
  version: string;
}

// Complete dry-run output
export interface MemberExperienceEnrichmentOutput {
  metadata: EnrichmentMetadata;
  members: MemberEnrichmentResult[];
  skipped: SkippedMember[];
}

// Apply result
export interface ApplyResult {
  success: boolean;
  membersUpdated: number;
  experiencesCreated: number;
  rollbackFilePath: string;
  errors: Array<{ memberUid: string; error: string }>;
}

// Command options
export interface DryRunOptions {
  output?: string;
  limit?: number;
  memberUid?: string;
  profilesDir?: string; // Default: ./linkedin-profiles
}

export interface ApplyOptions {
  input: string;
  rollbackOutput?: string;
}

export interface RollbackOptions {
  input: string;
}
