import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { FieldEnrichmentMeta, FieldEnrichmentStatus, FieldMetaKey } from './team-enrichment.types';

type FieldsMetaMap = Partial<Record<FieldMetaKey, FieldEnrichmentMeta>>;

export type EnrichmentCandidateRow = {
  website: string | null;
  blog: string | null;
  contactMethod: string | null;
  twitterHandler: string | null;
  linkedinHandler: string | null;
  telegramHandler: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  moreDetails: string | null;
  logoUid: string | null;
  investmentFocus: string[];
  industryTags: string[];
};

export type TeamForPromotion = {
  uid: string;
  investorProfile: { uid: string; investmentFocus: string[] } | null;
};

export type PromotionPayload = {
  teamUpdate: Prisma.TeamUpdateInput | null;
  investmentFocus: string[] | null;
  promotedFields: FieldMetaKey[];
};

export const PROMOTABLE_SCALAR_FIELDS: ReadonlySet<FieldMetaKey> = new Set<FieldMetaKey>([
  'website',
  'blog',
  'contactMethod',
  'twitterHandler',
  'linkedinHandler',
  'telegramHandler',
  'shortDescription',
  'longDescription',
  'moreDetails',
]);

/**
 * Builds a payload that promotes candidate values from a TeamEnrichment row to the Team
 * (and InvestorProfile for investmentFocus). The caller supplies the list of fields to
 * promote — for the judge this is verdict.agrees+high; for admin approve, it's the body
 * `fields`. Both callers go through the same scalar / industryTags / investmentFocus /
 * logo paths so we never diverge.
 *
 * Guards applied inside the helper:
 *  - fieldsMeta[k].status must be Enriched (never overwrite Team values the user owns).
 *  - candidate value must be non-empty.
 *  - industryTags titles resolved case-insensitively against IndustryTag; unmatched silently dropped.
 *
 * Returns: payload with only the fields that successfully passed the guards in `promotedFields`.
 */
export async function buildPromotionPayload(
  prisma: PrismaService,
  enrichmentRow: EnrichmentCandidateRow | null,
  selectedFields: FieldMetaKey[],
  fieldsMeta: FieldsMetaMap
): Promise<PromotionPayload> {
  if (!enrichmentRow) {
    return { teamUpdate: null, investmentFocus: null, promotedFields: [] };
  }

  const teamUpdate: Prisma.TeamUpdateInput = {};
  let investmentFocus: string[] | null = null;
  const promotedFields: FieldMetaKey[] = [];

  for (const key of selectedFields) {
    const fieldMeta = fieldsMeta[key];
    if (fieldMeta?.status !== FieldEnrichmentStatus.Enriched) continue;

    if (PROMOTABLE_SCALAR_FIELDS.has(key)) {
      const candidate = (enrichmentRow as any)[key] as string | null;
      if (!candidate || candidate.trim() === '') continue;
      (teamUpdate as any)[key] = candidate;
      promotedFields.push(key);
      continue;
    }

    if (key === 'industryTags') {
      const candidateTitles = enrichmentRow.industryTags ?? [];
      if (candidateTitles.length === 0) continue;
      const resolved = await prisma.industryTag.findMany({
        where: { title: { in: candidateTitles, mode: 'insensitive' } },
        select: { uid: true },
      });
      if (resolved.length === 0) continue;
      teamUpdate.industryTags = { set: resolved.map((t) => ({ uid: t.uid })) };
      promotedFields.push('industryTags');
      continue;
    }

    if (key === 'investmentFocus') {
      const candidate = enrichmentRow.investmentFocus ?? [];
      if (candidate.length === 0) continue;
      investmentFocus = candidate;
      promotedFields.push('investmentFocus');
      continue;
    }

    if (key === 'logo') {
      if (!enrichmentRow.logoUid) continue;
      teamUpdate.logo = { connect: { uid: enrichmentRow.logoUid } };
      promotedFields.push('logo');
      continue;
    }
  }

  return {
    teamUpdate: Object.keys(teamUpdate).length > 0 ? teamUpdate : null,
    investmentFocus,
    promotedFields,
  };
}

/**
 * Applies a promotion payload inside a transaction. Writes Team scalars + industryTags M2M
 * (+ logo connect when present) in one update; for investmentFocus, updates an existing
 * InvestorProfile or creates one.
 */
export async function executePromotion(
  tx: Prisma.TransactionClient,
  teamUid: string,
  team: TeamForPromotion,
  payload: PromotionPayload
): Promise<void> {
  if (payload.teamUpdate) {
    await tx.team.update({
      where: { uid: teamUid },
      data: payload.teamUpdate,
    });
  }
  if (payload.investmentFocus !== null) {
    if (team.investorProfile) {
      await tx.investorProfile.update({
        where: { uid: team.investorProfile.uid },
        data: { investmentFocus: payload.investmentFocus },
      });
    } else {
      await tx.investorProfile.create({
        data: {
          investmentFocus: payload.investmentFocus,
          team: { connect: { uid: teamUid } },
        },
      });
    }
  }
}
