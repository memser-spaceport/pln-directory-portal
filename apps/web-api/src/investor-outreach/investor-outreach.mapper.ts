import type {
  Image,
  InvestorOutreachRecord,
  InvestorPortfolioOverlap,
  Member,
  PlPortfolioTeamMeta,
  Team,
} from '@prisma/client';
import { InvestorDto, LabOsProfileDto } from './dto/investor.dto';
import { PlPortfolioTeamCoInvestorDto, PlPortfolioTeamDto } from './dto/pl-portfolio-team.dto';
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

    createdAt: dateToIso(record.createdAt) ?? '',
    updatedAt: dateToIso(record.updatedAt) ?? '',
  };
}

type TeamWithMetaAndOverlaps = Team & {
  logo: Image | null;
  portfolioMeta: PlPortfolioTeamMeta | null;
  portfolioOverlaps: Array<InvestorPortfolioOverlap & { investorOutreachRecord: { investorId: string } }>;
};

const toCoInvestor = (
  overlap: InvestorPortfolioOverlap & { investorOutreachRecord: { investorId: string } }
): PlPortfolioTeamCoInvestorDto => ({
  investorId: overlap.investorOutreachRecord.investorId,
  dealAmount: overlap.dealAmount == null ? null : Number(overlap.dealAmount),
  dealDate: dateToYmd(overlap.dealDate),
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
  };
}
