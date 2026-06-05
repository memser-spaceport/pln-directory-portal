import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import {
  InvestorOutreachIngestItem,
  InvestorOutreachPortfolioOverlapInput,
  InvestorOutreachPortfolioTeamInput,
  IngestInvestorOutreachDto,
  IngestInvestorOutreachResponse,
} from './dto/ingest-investor-outreach.dto';
import {
  isAllowedAttributionFund,
  isAllowedAumRange,
  isAllowedCheckSizeRange,
  isAllowedEmailStatus,
  isAllowedEngagementTier,
  isAllowedEnrichmentStatus,
  isAllowedInvestorType,
  isAllowedStageFocus,
  normalizeRaisingNow,
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
      overlaps_synced: 0,
      portfolio_teams_upserted: 0,
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

        const upserted = await this.prisma.investorOutreachRecord.upsert({
          where: { dedupeKey: data.dedupeKey },
          create: data,
          update: this.stripKeysForUpdate(data),
        });

        result.ingested++;
        if (wasCreate) result.created++;
        else result.updated++;

        if (item.portfolio_overlaps !== undefined) {
          const recordId = upserted?.id ?? byDedupe?.id ?? byInvestor?.id;
          if (recordId === undefined) {
            result.errors?.push(`Item ${i}: could not resolve record id for overlap sync`);
          } else {
            const sync = await this.syncOverlapsForRecord(recordId, item.portfolio_overlaps, i);
            for (const err of sync.errors) result.errors?.push(err);
            result.overlaps_synced = (result.overlaps_synced ?? 0) + sync.synced;
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.failed++;
        result.errors?.push(`Item ${i} (investor_id=${item?.investor_id ?? '?'}) : ${msg}`);
        this.logger.warn(`investor-outreach ingest item ${i} failed: ${msg}`);
      }
    }

    if (dto.portfolio_teams && dto.portfolio_teams.length) {
      let upserted = 0;
      for (let i = 0; i < dto.portfolio_teams.length; i++) {
        const entry = dto.portfolio_teams[i];
        try {
          const ok = await this.upsertPortfolioTeam(entry);
          if (ok) {
            upserted++;
          } else {
            result.errors?.push(`portfolio_teams[${i}] team_uid=${entry.team_uid}: team not found`);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result.errors?.push(`portfolio_teams[${i}] team_uid=${entry.team_uid}: ${msg}`);
        }
      }
      result.portfolio_teams_upserted = upserted;
    }

    this.logger.log(
      `Investor outreach ingest done (runId=${dto.runId ?? 'none'}, batchSource=${dto.source ?? 'none'}): ` +
        `received=${result.received} ingested=${result.ingested} created=${result.created} updated=${result.updated} ` +
        `failed=${result.failed} overlaps_synced=${result.overlaps_synced ?? 0} ` +
        `portfolio_teams_upserted=${result.portfolio_teams_upserted ?? 0}`
    );

    return result;
  }

  private stripKeysForUpdate(data: Prisma.InvestorOutreachRecordUncheckedCreateInput) {
    const { investorId: _investorId, dedupeKey: _dedupeKey, ...rest } = data;
    return rest;
  }

  /**
   * Sync overlap rows for a single investor. Semantics:
   *  - Each provided entry is upserted on the (investorOutreachRecordId, teamUid) unique key.
   *  - Rows whose teamUid is NOT in the provided set are deleted (so an empty array wipes the investor's overlaps).
   *  - Entries with unknown team_uid or invalid attribution_fund go into errors[] and are skipped (the rest still sync).
   */
  private async syncOverlapsForRecord(
    recordId: number,
    overlaps: InvestorOutreachPortfolioOverlapInput[],
    itemIndex: number
  ): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    const providedTeamUids = Array.from(new Set(overlaps.map((o) => o.team_uid.trim()).filter(Boolean)));

    const knownTeamUids = providedTeamUids.length
      ? new Set(
          (
            await this.prisma.team.findMany({
              where: { uid: { in: providedTeamUids } },
              select: { uid: true },
            })
          ).map((t) => t.uid)
        )
      : new Set<string>();

    for (let j = 0; j < overlaps.length; j++) {
      const o = overlaps[j];
      const teamUid = o.team_uid.trim();
      if (!knownTeamUids.has(teamUid)) {
        errors.push(`Item ${itemIndex}: portfolio_overlaps[${j}] team_uid=${teamUid} not found`);
        continue;
      }

      const attributionFund =
        o.attribution_fund == null || o.attribution_fund.trim() === '' ? null : o.attribution_fund.trim();
      if (attributionFund !== null && !isAllowedAttributionFund(attributionFund)) {
        errors.push(`Item ${itemIndex}: portfolio_overlaps[${j}].attribution_fund invalid: ${attributionFund}`);
        continue;
      }

      let dealDate: Date | undefined;
      try {
        dealDate = parseIsoDateOnly(o.deal_date, `portfolio_overlaps[${j}].deal_date`);
      } catch (e) {
        errors.push(`Item ${itemIndex}: ${(e as Error).message}`);
        continue;
      }

      const dealStage = o.deal_stage == null || o.deal_stage.trim() === '' ? null : o.deal_stage.trim();
      const dealAmount = o.deal_amount;
      if (dealAmount !== undefined && dealAmount !== null) {
        if (typeof dealAmount !== 'number' || !Number.isFinite(dealAmount) || dealAmount < 0) {
          errors.push(`Item ${itemIndex}: portfolio_overlaps[${j}].deal_amount must be a non-negative number`);
          continue;
        }
      }

      await this.prisma.investorPortfolioOverlap.upsert({
        where: { investorOutreachRecordId_teamUid: { investorOutreachRecordId: recordId, teamUid } },
        create: {
          investorOutreachRecordId: recordId,
          teamUid,
          dealAmount: dealAmount ?? null,
          dealDate: dealDate ?? null,
          dealStage,
          isLeadInvestor: o.is_lead_investor ?? false,
          attributionFund,
        },
        update: {
          dealAmount: dealAmount ?? null,
          dealDate: dealDate ?? null,
          dealStage,
          isLeadInvestor: o.is_lead_investor ?? false,
          attributionFund,
        },
      });
      synced++;
    }

    // Empty array → wipe all overlaps for this investor. Otherwise delete only rows outside the provided set.
    if (providedTeamUids.length === 0) {
      const deleted = await this.prisma.investorPortfolioOverlap.deleteMany({
        where: { investorOutreachRecordId: recordId },
      });
      synced += deleted.count;
    } else {
      const deleted = await this.prisma.investorPortfolioOverlap.deleteMany({
        where: {
          investorOutreachRecordId: recordId,
          teamUid: { notIn: providedTeamUids },
        },
      });
      synced += deleted.count;
    }

    return { synced, errors };
  }

  /** Returns true if the team was found and the meta row was upserted; false if team_uid is unknown. */
  private async upsertPortfolioTeam(entry: InvestorOutreachPortfolioTeamInput): Promise<boolean> {
    const teamUid = entry.team_uid.trim();
    const team = await this.prisma.team.findUnique({ where: { uid: teamUid }, select: { uid: true } });
    if (!team) return false;

    const plInvestedAt = parseIsoDateOnly(entry.pl_invested_at, 'pl_invested_at');

    const stage =
      entry.pl_invested_stage == null || entry.pl_invested_stage.trim() === '' ? null : entry.pl_invested_stage.trim();
    if (stage !== null && !isAllowedStageFocus(stage)) {
      throw new Error(`pl_invested_stage invalid: ${stage}`);
    }

    const normalizedRaising = normalizeRaisingNow(entry.raising_now);

    const raisingStage =
      entry.raising_stage == null || entry.raising_stage.trim() === ''
        ? normalizedRaising.raisingStage
        : entry.raising_stage.trim();
    if (raisingStage !== null && !isAllowedStageFocus(raisingStage)) {
      throw new Error(`raising_stage invalid: ${raisingStage}`);
    }

    const lastRoundStage =
      entry.last_round_stage == null || entry.last_round_stage.trim() === '' ? null : entry.last_round_stage.trim();
    if (lastRoundStage !== null && !isAllowedStageFocus(lastRoundStage)) {
      throw new Error(`last_round_stage invalid: ${lastRoundStage}`);
    }

    const lastRoundDate = parseIsoDateOnly(entry.last_round_date, 'last_round_date');
    const raisingAsOf = parseIsoDateOnly(entry.raising_as_of, 'raising_as_of');

    const raisingSource =
      entry.raising_source == null || entry.raising_source.trim() === '' ? null : entry.raising_source.trim();
    if (raisingSource !== null && raisingSource.length > 120) {
      throw new Error('raising_source exceeds 120 characters');
    }

    let sectors: string | null = null;
    if (entry.sectors != null && entry.sectors.trim() !== '') {
      const parsed = parseSectorTagsList(entry.sectors);
      if (!parsed.ok) throw new Error(parsed.reason);
      sectors = parsed.value || null;
    }

    const geo = entry.geo == null || entry.geo.trim() === '' ? null : entry.geo.trim();
    if (geo !== null && geo.length > 120) {
      throw new Error('geo exceeds 120 characters');
    }

    await this.prisma.plPortfolioTeamMeta.upsert({
      where: { teamUid },
      create: {
        teamUid,
        plInvestedAt: plInvestedAt ?? null,
        plInvestedStage: stage,
        raisingNow: normalizedRaising.raisingNow,
        raisingStage,
        lastRoundStage,
        lastRoundDate: lastRoundDate ?? null,
        raisingAsOf: raisingAsOf ?? null,
        raisingSource,
        sectors,
        geo,
      },
      update: {
        plInvestedAt: plInvestedAt ?? null,
        plInvestedStage: stage,
        raisingNow: normalizedRaising.raisingNow,
        raisingStage,
        lastRoundStage,
        lastRoundDate: lastRoundDate ?? null,
        raisingAsOf: raisingAsOf ?? null,
        raisingSource,
        sectors,
        geo,
      },
    });
    return true;
  }

  /**
   * Build prisma input; validates vocab + lengths; throws on invalid row.
   *
   * Tag-skip rule: if `item.tags` is undefined, omit `tags` from the input so the existing column
   * value is preserved on update (and the schema default `[]` is used on create). Supplying an
   * empty array `[]` explicitly overwrites the column to empty.
   */
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
    if (!source) throw new Error('source is empty');
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

    const input: Prisma.InvestorOutreachRecordUncheckedCreateInput = {
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

    if (item.tags !== undefined) {
      if (!Array.isArray(item.tags)) {
        throw new Error('tags must be an array of strings');
      }
      input.tags = item.tags.map((t) => String(t));
    }

    return input;
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
