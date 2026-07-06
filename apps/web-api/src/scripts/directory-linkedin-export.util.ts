/**
 * Pure types + helpers for the directory LinkedIn export (Step 2).
 * Consumed by export-directory-linkedin.ts and Step 3 handle-resolution scripts.
 */
import {
  expandLinkedinHandleVariants,
  isPersonalLinkedinHandle,
  normalizeHandleValue,
} from '../team-enrichment/shared/handle.util';

export interface DirectoryMemberTeamExport {
  teamUid: string;
  teamName: string;
  role: string | null;
}

export interface DirectoryMemberEmploymentExport {
  company: string;
  title: string;
  startYear: number;
  endYear: number | null;
  isCurrent: boolean;
}

export interface DirectoryMemberExport {
  uid: string;
  name: string;
  email: string | null;
  linkedinHandler: string | null;
  linkedinSlug: string | null;
  teams: DirectoryMemberTeamExport[];
  employment: DirectoryMemberEmploymentExport[];
}

export interface DirectoryInvestorExport {
  investorId: string;
  canonicalId: string | null;
  name: string;
  firm: string | null;
  linkedinUrl: string | null;
  email: string;
  cohorts: ('neuro' | 'gold')[];
  linkedinSlug: string | null;
}

export interface DirectoryTeamExport {
  teamUid: string;
  name: string;
  linkedinHandler: string | null;
  website: string | null;
}

export interface DirectoryLinkedinExportStats {
  memberCount: number;
  membersWithLinkedin: number;
  membersWithEmployment: number;
  investorCount: number;
  investorsWithLinkedin: number;
  teamCount: number;
  teamsWithLinkedin: number;
}

export interface DirectoryLinkedinExport {
  exportedAt: string;
  source: 'portal-directory-export';
  members: DirectoryMemberExport[];
  investors: DirectoryInvestorExport[];
  teams?: DirectoryTeamExport[];
  stats: DirectoryLinkedinExportStats;
}

export interface MemberExperienceInput {
  company: string;
  title: string;
  startDate: Date;
  endDate?: Date | null;
  isCurrent: boolean;
}

export const INVESTOR_LIST_SLUGS = ['neuro-lp', 'gold-coinvestors'] as const;

export type InvestorListSlug = (typeof INVESTOR_LIST_SLUGS)[number];

export type InvestorCohort = 'neuro' | 'gold';

const COHORT_BY_LIST_SLUG: Record<InvestorListSlug, InvestorCohort> = {
  'neuro-lp': 'neuro',
  'gold-coinvestors': 'gold',
};

/** Personal `/in/{slug}` when derivable; null for company/school-only handles. */
export function deriveLinkedinSlug(raw: string | null | undefined): string | null {
  if (!raw || !isPersonalLinkedinHandle(raw)) return null;
  const variants = expandLinkedinHandleVariants(raw);
  for (const variant of variants) {
    const match = variant.match(/^in\/([a-z0-9_.-]+)/);
    if (match?.[1]) return match[1];
  }
  const norm = normalizeHandleValue(raw);
  const match = norm?.match(/^in\/([a-z0-9_.-]+)/);
  return match?.[1] ?? null;
}

export function composeInvestorDisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  firm?: string | null;
  investorId: string;
}): string {
  const fromParts = `${input.firstName ?? ''} ${input.lastName ?? ''}`.trim();
  if (fromParts) return fromParts;
  const firm = input.firm?.trim();
  if (firm) return firm;
  return input.investorId;
}

export function normalizeMemberExperienceSpan(input: MemberExperienceInput): DirectoryMemberEmploymentExport {
  const startYear = input.startDate.getUTCFullYear();
  const endYear = input.isCurrent || !input.endDate ? null : input.endDate.getUTCFullYear();
  return {
    company: input.company,
    title: input.title,
    startYear,
    endYear,
    isCurrent: input.isCurrent,
  };
}

export function cohortForInvestorListSlug(slug: string): InvestorCohort | null {
  return COHORT_BY_LIST_SLUG[slug as InvestorListSlug] ?? null;
}

export function buildDirectoryLinkedinExportStats(
  data: Pick<DirectoryLinkedinExport, 'members' | 'investors' | 'teams'>
): DirectoryLinkedinExportStats {
  const teams = data.teams ?? [];
  return {
    memberCount: data.members.length,
    membersWithLinkedin: data.members.filter((m) => Boolean(m.linkedinSlug || m.linkedinHandler)).length,
    membersWithEmployment: data.members.filter((m) => m.employment.length > 0).length,
    investorCount: data.investors.length,
    investorsWithLinkedin: data.investors.filter((i) => Boolean(i.linkedinSlug || i.linkedinUrl)).length,
    teamCount: teams.length,
    teamsWithLinkedin: teams.filter((t) => Boolean(t.linkedinHandler)).length,
  };
}
