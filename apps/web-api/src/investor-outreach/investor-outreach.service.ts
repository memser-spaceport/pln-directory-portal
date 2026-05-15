import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import {
  InvestorOutreachIngestItem,
  IngestInvestorOutreachDto,
  IngestInvestorOutreachResponse,
} from './dto/ingest-investor-outreach.dto';
import {
  isAllowedAumRange,
  isAllowedCheckSizeRange,
  isAllowedEmailStatus,
  isAllowedEngagementTier,
  isAllowedEnrichmentStatus,
  isAllowedInvestorSource,
  isAllowedInvestorType,
  isAllowedStageFocus,
  parseSectorTagsList,
} from './investor-outreach.vocab';

function parseIsoDateOnly(value: string | undefined, field: string): Date | undefined | never {
  if (value == null || value.trim() === '') {
    return undefined;
  }
  const s = value.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) {
    throw new Error(`${field} must be YYYY-MM-DD`);
  }
  const d = new Date(`${s}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${field} is not a valid date`);
  }
  return d;
}

function parseIsoDateTime(value: string | undefined, field: string): Date | undefined | never {
  if (value == null || value.trim() === '') {
    return undefined;
  }
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${field} must be ISO 8601 datetime`);
  }
  return d;
}

@Injectable()
export class InvestorOutreachService {
  private readonly logger = new Logger(InvestorOutreachService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingest(dto: IngestInvestorOutreachDto): Promise<IngestInvestorOutreachResponse> {
    const result: IngestInvestorOutreachResponse = {
      received: dto.items.length,
      ingested: 0,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < dto.items.length; i++) {
      const item = dto.items[i];
      try {
        const data = this.buildRecordInput(item);

        const byDedupe = await this.prisma.investorOutreachRecord.findUnique({
          where: { dedupeKey: data.dedupeKey },
          select: { id: true, investorId: true, dedupeKey: true },
        });
        if (byDedupe && byDedupe.investorId !== data.investorId) {
          throw new Error(
            `dedupe_key conflicts: existing investorId=${byDedupe.investorId} vs payload investor_id=${data.investorId}`
          );
        }

        const byInvestor = await this.prisma.investorOutreachRecord.findUnique({
          where: { investorId: data.investorId },
          select: { id: true, dedupeKey: true },
        });
        if (byInvestor && byInvestor.dedupeKey !== data.dedupeKey) {
          throw new Error(
            `investor_id already linked to dedupe_key=${byInvestor.dedupeKey}; cannot overwrite with dedupe_key=${data.dedupeKey}`
          );
        }

        const wasCreate = !byDedupe;

        await this.prisma.investorOutreachRecord.upsert({
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
        result.errors?.push(`Item ${i} (investor_id=${item?.investor_id ?? '?'}) : ${msg}`);
        this.logger.warn(`investor-outreach ingest item ${i} failed: ${msg}`);
      }
    }

    this.logger.log(
      `Investor outreach ingest done (runId=${dto.runId ?? 'none'}, batchSource=${dto.source ?? 'none'}): ` +
        `received=${result.received} ingested=${result.ingested} created=${result.created} updated=${result.updated} failed=${result.failed}`
    );

    return result;
  }

  private stripKeysForUpdate(data: Prisma.InvestorOutreachRecordUncheckedCreateInput) {
    const { investorId: _investorId, dedupeKey: _dedupeKey, ...rest } = data;
    return rest;
  }

  /** Build prisma input; validates vocab + lengths; throws on invalid row. */
  buildRecordInput(item: InvestorOutreachIngestItem): Prisma.InvestorOutreachRecordUncheckedCreateInput {
    const investorId = item.investor_id.trim();
    const dedupeKey = item.dedupe_key.trim().toLowerCase();
    const email = item.email.trim().toLowerCase();
    const source = item.source.trim();
    const emailStatus = item.email_status.trim();
    const investorType = item.investor_type.trim();
    const stageFocus = item.stage_focus.trim();
    const engagementTier = item.engagement_tier.trim();
    const enrichmentStatus = item.enrichment_status.trim();

    if (!investorId) throw new Error('investor_id is empty');
    if (!dedupeKey) throw new Error('dedupe_key is empty');
    if (!email) throw new Error('email is empty');
    if (!isAllowedInvestorSource(source)) throw new Error(`Invalid source: ${source}`);
    if (!isAllowedEmailStatus(emailStatus)) throw new Error(`Invalid email_status: ${emailStatus}`);
    if (!isAllowedInvestorType(investorType)) throw new Error(`Invalid investor_type: ${investorType}`);
    if (!isAllowedStageFocus(stageFocus)) throw new Error(`Invalid stage_focus: ${stageFocus}`);
    if (!isAllowedEngagementTier(engagementTier)) throw new Error(`Invalid engagement_tier: ${engagementTier}`);
    if (!isAllowedEnrichmentStatus(enrichmentStatus)) throw new Error(`Invalid enrichment_status: ${enrichmentStatus}`);

    let aumRange: string | undefined;
    if (item.aum_range != null && item.aum_range.trim() !== '') {
      const v = item.aum_range.trim();
      if (!isAllowedAumRange(v)) throw new Error(`Invalid aum_range: ${v}`);
      aumRange = v;
    }

    let checkSizeRange: string | undefined;
    if (item.check_size_range != null && item.check_size_range.trim() !== '') {
      const v = item.check_size_range.trim();
      if (!isAllowedCheckSizeRange(v)) throw new Error(`Invalid check_size_range: ${v}`);
      checkSizeRange = v;
    }

    const sectorParsed = parseSectorTagsList(item.sector_tags);
    if (!sectorParsed.ok) throw new Error(sectorParsed.reason);

    const title = truncateOptional(item.title, 'title', 120);
    const geoFocus = truncateOptional(item.geo_focus, 'geo_focus', 120);
    const recentDeals = truncateOptional(item.recent_deals, 'recent_deals', 200);
    const enrichmentNotes = truncateOptional(item.enrichment_notes, 'enrichment_notes', 500);

    const outreachTouches = nonNegInt(item.outreach_touches, 'outreach_touches', 0);
    const opened = nonNegInt(item.opened, 'opened', 0);
    const clicked = nonNegInt(item.clicked, 'clicked', 0);
    const registered = registeredInt(item.registered);

    const firstSentDate = parseIsoDateOnly(item.first_sent_date, 'first_sent_date');
    const lastSentDate = parseIsoDateOnly(item.last_sent_date, 'last_sent_date');
    const enrichmentDate = parseIsoDateOnly(item.enrichment_date, 'enrichment_date');
    const lastEnrichmentAttempt = parseIsoDateTime(item.last_enrichment_attempt, 'last_enrichment_attempt');

    const firmDomain =
      item.firm_domain == null || item.firm_domain.trim() === '' ? undefined : item.firm_domain.trim().toLowerCase();

    return {
      investorId,
      canonicalId: emptyToUndefined(item.canonical_id?.trim()),
      dedupeKey,
      source,
      firstName: emptyToUndefined(item.first_name?.trim()),
      lastName: emptyToUndefined(item.last_name?.trim()),
      email,
      emailStatus,
      linkedinUrl: emptyToUndefined(item.linkedin_url?.trim()),
      firm: emptyToUndefined(item.firm?.trim()),
      firmDomain,
      title,
      investorType,
      fundThesis: emptyToUndefined(item.fund_thesis?.trim()),
      aumRange,
      checkSizeRange,
      stageFocus,
      sectorTags: sectorParsed.value === '' ? undefined : sectorParsed.value,
      geoFocus,
      recentDeals,
      outreachTouches,
      outreachCampaigns: emptyToUndefined(item.outreach_campaigns?.trim()),
      opened,
      clicked,
      registered,
      firstSentDate,
      lastSentDate,
      engagementTier,
      enrichmentStatus,
      enrichmentDate,
      lastEnrichmentAttempt,
      enrichmentNotes,
      rawPayload: item as unknown as Prisma.InputJsonValue,
    };
  }
}

function emptyToUndefined(s: string | undefined): string | undefined {
  if (s == null || s === '') return undefined;
  return s;
}

function truncateOptional(raw: string | undefined, label: string, max: number): string | undefined {
  if (raw == null || raw.trim() === '') return undefined;
  const s = raw.trim();
  if (s.length > max) throw new Error(`${label} exceeds ${max} characters`);
  return s;
}

function nonNegInt(v: number | undefined, field: string, defaultValue: number): number {
  if (v === undefined || v === null) return defaultValue;
  if (!Number.isInteger(v) || v < 0) throw new Error(`${field} must be a non-negative integer`);
  return v;
}

function registeredInt(v: number | undefined): number {
  if (v === undefined || v === null) return 0;
  if ((v !== 0 && v !== 1) || !Number.isInteger(v)) {
    throw new Error('registered must be 0 or 1');
  }
  return v;
}
