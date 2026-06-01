import { Injectable, Logger } from '@nestjs/common';
import { FounderReviewStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import {
  FounderFundTagInput,
  FounderIngestItem,
  IngestFounderSourcingDto,
  IngestFounderSourcingResponse,
} from './dto/ingest-founder-sourcing.dto';
import { ReviewStateDto } from './dto/review-state.dto';
import { isAllowedFundCode, reviewFeedbackToApi, reviewStatusToApi } from './founder-sourcing.vocab';

@Injectable()
export class FounderSourcingService {
  private readonly logger = new Logger(FounderSourcingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingest(dto: IngestFounderSourcingDto): Promise<IngestFounderSourcingResponse> {
    const result: IngestFounderSourcingResponse = {
      received: dto.items.length,
      ingested: 0,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
    };

    if (dto.runId && dto.runId.trim() !== '') {
      await this.prisma.founderSourcingIngestRun.upsert({
        where: { runId: dto.runId.trim() },
        create: { runId: dto.runId.trim(), source: trimToNull(dto.source), itemCount: dto.items.length },
        update: { source: trimToNull(dto.source), itemCount: dto.items.length },
      });
    }

    for (let i = 0; i < dto.items.length; i++) {
      const item = dto.items[i];
      try {
        const data = this.buildRecordInput(item, dto.runId, dto.source);
        const byDedupe = await this.prisma.founderSourcingRecord.findUnique({
          where: { dedupeKey: data.dedupeKey },
          select: { founderId: true, dedupeKey: true },
        });

        if (byDedupe && byDedupe.founderId !== data.founderId) {
          throw new Error(
            `dedupe_key conflicts: existing founderId=${byDedupe.founderId} vs payload founder_id=${data.founderId}`
          );
        }

        const byFounder = await this.prisma.founderSourcingRecord.findUnique({
          where: { founderId: data.founderId },
          select: { dedupeKey: true },
        });

        if (byFounder && byFounder.dedupeKey !== data.dedupeKey) {
          throw new Error(
            `founder_id already linked to dedupe_key=${byFounder.dedupeKey}; cannot overwrite with dedupe_key=${data.dedupeKey}`
          );
        }

        const wasCreate = !byDedupe;
        await this.prisma.founderSourcingRecord.upsert({
          where: { dedupeKey: data.dedupeKey },
          create: data,
          update: this.stripKeysForUpdate(data),
        });

        result.ingested++;
        if (wasCreate) result.created++;
        else result.updated++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.failed++;
        result.errors?.push(`Item ${i} (founder_id=${item?.founder_id ?? '?'}) : ${msg}`);
        this.logger.warn(`founder-sourcing ingest item ${i} failed: ${msg}`);
      }
    }

    this.logger.log(
      `Founder sourcing ingest done (runId=${dto.runId ?? 'none'}, batchSource=${dto.source ?? 'none'}): ` +
        `received=${result.received} ingested=${result.ingested} created=${result.created} updated=${result.updated} failed=${result.failed}`
    );

    return result;
  }

  async exportReviewState(since?: string): Promise<ReviewStateDto[]> {
    let decidedAfter: Date | undefined;
    if (since && since.trim() !== '') {
      const parsed = new Date(since.trim());
      if (Number.isNaN(parsed.getTime())) {
        throw new Error('since must be a valid ISO datetime when provided');
      }
      decidedAfter = parsed;
    }

    const rows = await this.prisma.founderSourcingRecord.findMany({
      where: {
        reviewStatus: { not: FounderReviewStatus.NEW },
        reviewDecidedAt: decidedAfter ? { gte: decidedAfter } : { not: null },
      },
      select: {
        founderId: true,
        reviewStatus: true,
        reviewFeedback: true,
        reviewDecidedAt: true,
        reviewNote: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((row) => ({
      profile_id: row.founderId,
      status: reviewStatusToApi(row.reviewStatus),
      feedback: reviewFeedbackToApi(row.reviewFeedback),
      decided_at: row.reviewDecidedAt?.toISOString(),
      note: row.reviewNote ?? undefined,
    }));
  }

  buildRecordInput(
    item: FounderIngestItem,
    batchRunId?: string,
    batchSource?: string
  ): Prisma.FounderSourcingRecordUncheckedCreateInput {
    const founderId = item.founder_id.trim();
    const dedupeKey = item.dedupe_key.trim().toLowerCase();
    const source = item.source.trim();
    const sources = asStringArray(item.sources, 'sources', true);
    const emails = asStringArray(item.emails, 'emails', false);
    const topics = asStringArray(item.topics, 'topics', false);
    const fundTags = item.fund_tags;
    const fundCodes = this.parseFundCodes(fundTags);

    if (!founderId) throw new Error('founder_id is empty');
    if (!dedupeKey) throw new Error('dedupe_key is empty');
    if (!source) throw new Error('source is empty');

    const alignmentMax = parseUnitRange(item.alignment_max, 'alignment_max');
    const plnProximity = parseUnitRange(item.pln_proximity, 'pln_proximity');
    const plAlignment = parseUnitRange(item.pl_alignment, 'pl_alignment');
    const identityCompleteness = parseUnitRange(item.identity_completeness, 'identity_completeness');
    const plvsScore = parseBoundedInteger(item.plvs_score, 'plvs_score', 0, 100);

    const createdData: Prisma.FounderSourcingRecordUncheckedCreateInput = {
      founderId,
      dedupeKey,
      source,
      sources,
      name: trimToUndefined(item.name),
      firstName: trimToUndefined(item.first_name),
      lastName: trimToUndefined(item.last_name),
      emails: emails ?? undefined,
      primaryEmail: trimToLowerOrUndefined(item.primary_email),
      github: trimToUndefined(item.github),
      twitter: trimToUndefined(item.twitter),
      linkedin: trimToUndefined(item.linkedin),
      telegram: trimToUndefined(item.telegram),
      farcaster: trimToUndefined(item.farcaster),
      website: trimToUndefined(item.website),
      org: trimToUndefined(item.org),
      team: trimToUndefined(item.team),
      teamPriority: parseOptionalInt(item.team_priority, 'team_priority'),
      bio: trimToUndefined(item.bio),
      topics: topics ?? undefined,
      externalIds: item.external_ids as unknown as Prisma.InputJsonValue,
      directoryMemberId: trimToUndefined(item.directory_member_id),
      directoryTeamId: trimToUndefined(item.directory_team_id),
      identityCompleteness: identityCompleteness ?? undefined,
      fundTags: fundTags as unknown as Prisma.InputJsonValue,
      fundCodes: fundCodes ?? undefined,
      plvsScore: plvsScore ?? undefined,
      plvsRecommendation: trimToUndefined(item.plvs_recommendation),
      plvsFeatures: item.plvs_features as unknown as Prisma.InputJsonValue,
      plvsWeightsVersion: trimToUndefined(item.plvs_weights_version),
      alignmentMax: alignmentMax ?? undefined,
      quality: item.quality as unknown as Prisma.InputJsonValue,
      plnProximity: plnProximity ?? undefined,
      plAlignment: plAlignment ?? undefined,
      reputationFlags: item.reputation_flags as unknown as Prisma.InputJsonValue,
      warmIntroPaths: item.warm_intro_paths as unknown as Prisma.InputJsonValue,
      intentSignals: item.intent_signals as unknown as Prisma.InputJsonValue,
      provenance: item.provenance as unknown as Prisma.InputJsonValue,
      lastSignalAt: parseIsoDateTime(item.last_signal_at, 'last_signal_at'),
      whyNow: truncateOptional(
        trimToUndefined(item.why_now) ?? trimToUndefined((item as unknown as Record<string, unknown>).whyNow as string),
        'why_now',
        500
      ),
      thinEvidence: item.thin_evidence,
      runId: trimToUndefined(item.run_id),
      signalSourcingVersion: trimToUndefined(item.signal_sourcing_version),
      isKnown: item.is_known,
      lastIngestRunId: trimToUndefined(batchRunId),
      lastIngestSource: trimToUndefined(batchSource),
      rawPayload: item as unknown as Prisma.InputJsonValue,
    };

    return createdData;
  }

  private stripKeysForUpdate(
    data: Prisma.FounderSourcingRecordUncheckedCreateInput
  ): Prisma.FounderSourcingRecordUncheckedUpdateInput {
    const {
      founderId: _founderId,
      dedupeKey: _dedupeKey,
      reviewStatus: _reviewStatus,
      reviewFeedback: _reviewFeedback,
      reviewDecidedAt: _reviewDecidedAt,
      reviewNote: _reviewNote,
      reviewedByMemberUid: _reviewedByMemberUid,
      ...rest
    } = data;
    void _founderId;
    void _dedupeKey;
    void _reviewStatus;
    void _reviewFeedback;
    void _reviewDecidedAt;
    void _reviewNote;
    void _reviewedByMemberUid;
    return rest;
  }

  private parseFundCodes(fundTags: FounderFundTagInput[] | undefined): string[] | undefined {
    if (fundTags === undefined) return undefined;
    if (!Array.isArray(fundTags)) throw new Error('fund_tags must be an array when provided');

    const values = new Set<string>();
    for (let i = 0; i < fundTags.length; i++) {
      const entry = fundTags[i];
      if (!entry || typeof entry !== 'object') throw new Error(`fund_tags[${i}] must be an object`);
      if (!entry.fund || !isAllowedFundCode(entry.fund)) {
        throw new Error(`fund_tags[${i}].fund is invalid`);
      }
      parseUnitRange(entry.confidence, `fund_tags[${i}].confidence`, true);
      values.add(entry.fund);
    }
    return Array.from(values).sort();
  }
}

function trimToUndefined(value: string | undefined | null): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function trimToNull(value: string | undefined | null): string | null {
  const trimmed = trimToUndefined(value);
  return trimmed ?? null;
}

function trimToLowerOrUndefined(value: string | undefined | null): string | undefined {
  const trimmed = trimToUndefined(value);
  return trimmed?.toLowerCase();
}

function parseBoundedInteger(value: number | undefined, field: string, min: number, max: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field} must be an integer in [${min}, ${max}]`);
  }
  return value;
}

function parseOptionalInt(value: number | undefined, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Number.isInteger(value)) throw new Error(`${field} must be an integer`);
  return value;
}

function parseIsoDateTime(value: string | undefined, field: string): Date | undefined {
  const trimmed = trimToUndefined(value);
  if (!trimmed) return undefined;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} must be a valid ISO datetime`);
  return parsed;
}

function parseUnitRange(value: number | undefined, field: string, required = false): number | undefined {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${field} is required`);
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be a number in [0, 1]`);
  }
  return value;
}

function asStringArray(value: string[] | undefined, field: string, required: boolean): string[] | undefined {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${field} is required`);
    return undefined;
  }
  if (!Array.isArray(value)) throw new Error(`${field} must be an array of strings`);
  const cleaned = value.map((v) => String(v).trim()).filter(Boolean);
  if (required && cleaned.length === 0) throw new Error(`${field} must contain at least one string`);
  return cleaned;
}

function truncateOptional(raw: string | undefined, label: string, max: number): string | undefined {
  if (raw == null || raw.trim() === '') return undefined;
  const s = raw.trim();
  if (s.length > max) throw new Error(`${label} exceeds ${max} characters`);
  return s;
}
