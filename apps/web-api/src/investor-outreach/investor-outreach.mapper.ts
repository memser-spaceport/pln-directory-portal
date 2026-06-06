import type {
  Image,
  InvestorOutreachRecord,
  InvestorPortfolioOverlap,
  Member,
  PlPortfolioTeamMeta,
  Team,
  TeamMemberRole,
} from '@prisma/client';
import { InvestorDto, InvestorEnrichmentDto, LabOsProfileDto } from './dto/investor.dto';
import {
  PlPortfolioTeamCoInvestorDto,
  PlPortfolioTeamDto,
  PlPortfolioTeamFounderDto,
} from './dto/pl-portfolio-team.dto';
import { isAllowedStageFocus } from './investor-outreach.vocab';

type MemberWithImage = Member & { image: Image | null };

/** Member-keyed lookup by lowercase email; the email column on Member is unique and case-insensitive in practice. */
export type MemberByEmail = Map<string, MemberWithImage>;

/** Overlap rows grouped by investor record id → list of teamUids. */
export type OverlapsByInvestorId = Map<number, string[]>;

const dateToYmd = (d: Date | null | undefined): string | null => (d == null ? null : d.toISOString().slice(0, 10));

const dateToIso = (d: Date | null | undefined): string | null => (d == null ? null : d.toISOString());

export const effectiveRaisingStage = (
  raisingNow: string | null | undefined,
  raisingStage: string | null | undefined
): string | null => {
  if (raisingNow === 'yes' && raisingStage) {
    return raisingStage;
  }
  if (raisingNow && isAllowedStageFocus(raisingNow)) {
    return raisingNow;
  }
  return null;
};

export const splitCsv = (raw: string | null | undefined): string[] => {
  if (raw == null || raw.trim() === '') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

/** Extract the "who is this investor" enrichment block from rawPayload.enrichment. */
const buildEnrichment = (raw: unknown): InvestorEnrichmentDto | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const e = (raw as Record<string, unknown>).enrichment;
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  const o = e as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const result: InvestorEnrichmentDto = {
    bio: str(o.bio),
    fundFocus: str(o.fundFocus),
    aum: str(o.aum),
    notableInvestments: arr(o.notableInvestments),
    thesis: str(o.thesis),
    sources: arr(o.sources),
    enrichedVia: str(o.enrichedVia),
    fetchedAt: str(o.fetchedAt),
  };
  // Nothing useful → treat as no enrichment.
  const hasContent =
    result.bio || result.fundFocus || result.aum || result.thesis || result.notableInvestments.length > 0;
  return hasContent ? result : null;
};

const buildLabOsProfile = (member: MemberWithImage | undefined): LabOsProfileDto | null => {
  if (!member) return null;
  return {
    type: 'member',
    uid: member.uid,
    /** Member has no dedicated slug column today; uid is the stable, URL-safe identifier. */
    slug: member.uid,
    name: member.name,
    email: member.email,
    lastActiveAt: dateToIso(member.updatedAt),
  };
};

export function toInvestorDto(
  record: InvestorOutreachRecord,
  membersByEmail: MemberByEmail,
  overlapsByInvestorId: OverlapsByInvestorId
): InvestorDto {
  const member = record.email ? membersByEmail.get(record.email.toLowerCase()) : undefined;
  const teamUids = overlapsByInvestorId.get(record.id) ?? [];

  return {
    investorId: record.investorId,
    canonicalId: record.canonicalId,
    dedupeKey: record.dedupeKey,
    source: record.source,

    firstName: record.firstName,
    lastName: record.lastName,
    email: record.email,
    emailStatus: record.emailStatus,
    linkedinUrl: record.linkedinUrl,

    firm: record.firm,
    firmDomain: record.firmDomain,
    title: record.title,

    investorType: record.investorType,
    fundThesis: record.fundThesis,
    aumRange: record.aumRange,
    checkSizeRange: record.checkSizeRange,

    stageFocus: record.stageFocus,
    sectorTags: splitCsv(record.sectorTags),
    geoFocus: record.geoFocus,
    recentDeals: splitCsv(record.recentDeals),

    outreachTouches: record.outreachTouches,
    outreachCampaigns: splitCsv(record.outreachCampaigns),
    opened: record.opened,
    clicked: record.clicked,
    registered: record.registered,

    firstSentDate: dateToYmd(record.firstSentDate),
    lastSentDate: dateToYmd(record.lastSentDate),
    engagementTier: record.engagementTier,

    enrichmentStatus: record.enrichmentStatus,
    enrichmentDate: dateToYmd(record.enrichmentDate),
    lastEnrichmentAttempt: dateToIso(record.lastEnrichmentAttempt),
    enrichmentNotes: record.enrichmentNotes,

    tags: record.tags ?? [],
    labOsProfile: buildLabOsProfile(member),
    coInvestedTeamIds: teamUids,

    bestProximityCode: record.bestProximityCode ?? null,
    hasPath: record.hasPath ?? false,

    enrichment: buildEnrichment(record.rawPayload),

    createdAt: dateToIso(record.createdAt) ?? '',
    updatedAt: dateToIso(record.updatedAt) ?? '',
  };
}

type TeamWithMetaAndOverlaps = Team & {
  logo: Image | null;
  portfolioMeta: PlPortfolioTeamMeta | null;
  portfolioOverlaps: Array<InvestorPortfolioOverlap & { investorOutreachRecord: { investorId: string } }>;
  teamMemberRoles?: Array<TeamMemberRole & { member: { uid: string; name: string } }>;
};

const toCoInvestor = (
  overlap: InvestorPortfolioOverlap & { investorOutreachRecord: { investorId: string } }
): PlPortfolioTeamCoInvestorDto => ({
  investorId: overlap.investorOutreachRecord.investorId,
  dealAmount: overlap.dealAmount == null ? null : Number(overlap.dealAmount),
  dealDate: dateToYmd(overlap.dealDate),
});

const toFounder = (role: TeamMemberRole & { member: { uid: string; name: string } }): PlPortfolioTeamFounderDto => ({
  name: role.member.name,
  memberUid: role.member.uid,
});

export function toPlPortfolioTeamDto(team: TeamWithMetaAndOverlaps): PlPortfolioTeamDto {
  const meta = team.portfolioMeta;
  return {
    teamUid: team.uid,
    teamName: team.name,
    logoUrl: team.logo?.url ?? null,
    plInvestedAt: dateToYmd(meta?.plInvestedAt ?? null),
    plInvestedStage: meta?.plInvestedStage ?? null,
    raisingNow: meta?.raisingNow ?? null,
    raisingStage: meta?.raisingStage ?? null,
    lastRoundStage: meta?.lastRoundStage ?? null,
    lastRoundDate: dateToYmd(meta?.lastRoundDate ?? null),
    raisingAsOf: dateToYmd(meta?.raisingAsOf ?? null),
    raisingSource: meta?.raisingSource ?? null,
    sectors: splitCsv(meta?.sectors ?? null),
    geo: meta?.geo ?? null,
    coInvestors: team.portfolioOverlaps.map(toCoInvestor),
    founders: (team.teamMemberRoles ?? []).map(toFounder),
  };
}
