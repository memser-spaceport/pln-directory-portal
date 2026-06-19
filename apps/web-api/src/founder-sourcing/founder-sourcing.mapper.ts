import { FounderSourcingRecord } from '@prisma/client';
import { FounderDto } from './dto/founder.dto';
import { reviewChannelToApi, reviewFeedbackToApi, reviewStatusToApi } from './founder-sourcing.vocab';

const dateToIso = (d: Date | null | undefined): string | null => (d == null ? null : d.toISOString());
const decimalToNumber = (v: { toNumber(): number } | null | undefined): number | null =>
  v == null ? null : v.toNumber();

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export function toFounderDto(record: FounderSourcingRecord): FounderDto {
  return {
    founderId: record.founderId,
    dedupeKey: record.dedupeKey,
    source: record.source,
    sources: record.sources ?? [],
    name: record.name,
    firstName: record.firstName,
    lastName: record.lastName,
    primaryEmail: record.primaryEmail,
    github: record.github,
    twitter: record.twitter,
    linkedin: record.linkedin,
    telegram: record.telegram,
    farcaster: record.farcaster,
    website: record.website,
    org: record.org,
    team: record.team,
    teamPriority: record.teamPriority,
    bio: record.bio,
    topics: record.topics ?? [],
    directoryMemberId: record.directoryMemberId,
    directoryTeamId: record.directoryTeamId,
    alignmentMax: decimalToNumber(record.alignmentMax),
    plvsScore: record.plvsScore,
    plvsRecommendation: record.plvsRecommendation,
    plnProximity: decimalToNumber(record.plnProximity),
    plAlignment: decimalToNumber(record.plAlignment),
    lastSignalAt: dateToIso(record.lastSignalAt),
    lastActivitySeenAt: dateToIso(record.lastActivitySeenAt),
    whyNow: record.whyNow,
    criteriaHeadline: record.criteriaHeadline,
    pedigree: record.pedigree,
    focusArea: record.focusArea,
    isRaising: record.isRaising ?? null,
    isCofounderSearch: record.isCofounderSearch ?? null,
    isComingOutOfStealth: record.isComingOutOfStealth ?? null,
    nearNetwork: record.nearNetwork ?? null,
    plAligned: record.plAligned ?? null,
    thinEvidence: record.thinEvidence ?? null,
    reviewState: {
      profile_id: record.founderId,
      status: reviewStatusToApi(record.reviewStatus),
      feedback: reviewFeedbackToApi(record.reviewFeedback),
      channel: reviewChannelToApi(record.reviewChannel),
      field: record.reviewField ?? undefined,
      area: record.reviewArea ?? undefined,
      decided_at: dateToIso(record.reviewDecidedAt) ?? undefined,
      note: record.reviewNote ?? undefined,
    },
    rawPayload: asRecord(record.rawPayload),
    createdAt: dateToIso(record.createdAt) ?? '',
    updatedAt: dateToIso(record.updatedAt) ?? '',
  };
}
