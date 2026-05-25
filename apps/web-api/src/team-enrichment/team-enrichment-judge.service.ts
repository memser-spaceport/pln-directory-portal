import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../shared/prisma.service';
import { formatUsageLog, mergeUsageEntries } from './team-enrichment-cost';
import { buildTeamEnrichmentEligibilityFilter } from './team-enrichment-eligibility-filter';
import { JudgeFieldInput, JudgeTeamContext, TeamEnrichmentJudgeAiService } from './team-enrichment-judge-ai.service';
import { buildPromotionPayload, executePromotion } from './team-enrichment-promotion';
import { TeamEnrichmentScrapingDogService } from './team-enrichment-scrapingdog.service';
import {
  AIUsageEntry,
  EnrichmentStatus,
  FieldEnrichmentMeta,
  FieldEnrichmentStatus,
  FieldJudgment,
  FieldMetaKey,
  JudgmentStatus,
  JudgmentVerdict,
  TeamDataEnrichment,
  TeamJudgment,
} from './team-enrichment.types';

/**
 * The judge needs two parallel views of every team:
 *   - Team scalars (current authoritative values — what the user/admin sees).
 *   - TeamEnrichment scalars (AI candidates not yet promoted).
 *
 * For ChangedByUser fields, the judge reads from Team (the user's value). For Enriched fields
 * (still candidate), the judge reads from TeamEnrichment.
 */
type TeamRecord = {
  uid: string;
  name: string;
  website: string | null;
  blog: string | null;
  contactMethod: string | null;
  twitterHandler: string | null;
  linkedinHandler: string | null;
  telegramHandler: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  moreDetails: string | null;
  industryTags: Array<{ title: string }>;
  investorProfile: { uid: string; investmentFocus: string[] } | null;
  teamEnrichment: TeamEnrichmentSnapshot | null;
};

type TeamEnrichmentSnapshot = {
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
  /** Plain titles (matches investmentFocus's shape). The judge re-resolves to IndustryTag rows at promotion. */
  industryTags: string[];
  dataEnrichment: unknown;
};

type FieldsMetaMap = Partial<Record<FieldMetaKey, FieldEnrichmentMeta>>;

export type JudgeTeamResult =
  | { status: 'started' | 'already_judged' | 'in_progress' | 'not_found' | 'not_eligible' };

const JUDGABLE_FIELD_KEYS: FieldMetaKey[] = [
  'website',
  'blog',
  'contactMethod',
  'twitterHandler',
  'linkedinHandler',
  'telegramHandler',
  'shortDescription',
  'longDescription',
  'moreDetails',
  'industryTags',
  'investmentFocus',
];

const USER_JUDGABLE_FIELD_KEYS: ReadonlySet<FieldMetaKey> = new Set<FieldMetaKey>([
  'website',
  'blog',
  'contactMethod',
  'twitterHandler',
  'linkedinHandler',
  'telegramHandler',
]);

const URL_REQUIRED_FIELD_KEYS: ReadonlySet<FieldMetaKey> = new Set<FieldMetaKey>(['website', 'blog']);

const urlSchema = z.string().url();

function isValidUrl(value: string): boolean {
  return urlSchema.safeParse(value.trim()).success;
}

const TEAM_RECORD_SELECT = {
  uid: true,
  name: true,
  website: true,
  blog: true,
  contactMethod: true,
  twitterHandler: true,
  linkedinHandler: true,
  telegramHandler: true,
  shortDescription: true,
  longDescription: true,
  moreDetails: true,
  industryTags: { select: { title: true } },
  investorProfile: { select: { uid: true, investmentFocus: true } },
  teamEnrichment: {
    select: {
      website: true,
      blog: true,
      contactMethod: true,
      twitterHandler: true,
      linkedinHandler: true,
      telegramHandler: true,
      shortDescription: true,
      longDescription: true,
      moreDetails: true,
      logoUid: true,
      investmentFocus: true,
      industryTags: true,
      dataEnrichment: true,
    },
  },
} as const;

@Injectable()
export class TeamEnrichmentJudgeService {
  private readonly logger = new Logger(TeamEnrichmentJudgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scrapingDogService: TeamEnrichmentScrapingDogService,
    private readonly judgeAi: TeamEnrichmentJudgeAiService
  ) {}

  /**
   * Finds eligible teams whose TeamEnrichment is Enriched but unjudged. Filters via the
   * TeamEnrichment.dataEnrichment JSON path. An additional in-memory pass drops teams whose
   * judgment is already Judged/InProgress and teams with no judgable fields.
   */
  async findTeamsPendingJudgment(): Promise<TeamRecord[]> {
    await this.resetStaleInProgressJudgment();

    const candidates = (await this.prisma.team.findMany({
      where: {
        AND: [
          buildTeamEnrichmentEligibilityFilter(),
          {
            teamEnrichment: {
              dataEnrichment: { path: ['status'], equals: EnrichmentStatus.Enriched },
            },
          },
        ],
      },
      select: TEAM_RECORD_SELECT,
    })) as unknown as TeamRecord[];

    return candidates.filter((t) => {
      const meta = this.parseEnrichmentMeta(t.teamEnrichment?.dataEnrichment);
      const judgmentStatus = meta?.judgment?.status;
      if (judgmentStatus === JudgmentStatus.Judged) return false;
      if (judgmentStatus === JudgmentStatus.InProgress) return false;
      return this.collectJudgableFieldKeys(t, meta?.fieldsMeta ?? {}).length > 0;
    });
  }

  /**
   * Self-heals rows whose `dataEnrichment.judgment.status = 'InProgress'` and `updatedAt`
   * is older than the stuck-TTL — the pod was killed mid-judge. Drops the `judgment` block
   * so the team is judgable again on this same call.
   *
   * TTL is `TEAM_ENRICHMENT_STUCK_TTL_MINUTES` (default 180), shared with the enrichment
   * recovery in TeamEnrichmentService.
   */
  private async resetStaleInProgressJudgment(): Promise<void> {
    const ttlMinutes = this.getStuckTtlMinutes();
    const updated = await this.prisma.$executeRaw`
      UPDATE "TeamEnrichment"
      SET "dataEnrichment" = "dataEnrichment" - 'judgment',
          "updatedAt"      = NOW()
      WHERE "dataEnrichment"->'judgment'->>'status' = 'InProgress'
        AND "updatedAt" < NOW() - make_interval(mins => ${ttlMinutes})
    `;
    if (updated > 0) {
      this.logger.warn(
        `Stale judge recovery: cleared judgment block on ${updated} row(s) stuck InProgress (ttl=${ttlMinutes}m)`
      );
    }
  }

  private getStuckTtlMinutes(): number {
    const raw = process.env.TEAM_ENRICHMENT_STUCK_TTL_MINUTES?.trim();
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 180;
  }

  async judgeTeam(teamUid: string, judgedBy = 'system-cron'): Promise<JudgeTeamResult> {
    const team = await this.loadTeamRecord(teamUid);
    if (!team) return { status: 'not_found' };

    const meta = this.parseEnrichmentMeta(team.teamEnrichment?.dataEnrichment);
    if (!meta) return { status: 'not_eligible' };

    if (meta.judgment?.status === JudgmentStatus.InProgress) {
      this.logger.warn(`Judge: already in progress for team ${teamUid}, skipping`);
      return { status: 'in_progress' };
    }
    if (meta.judgment?.status === JudgmentStatus.Judged) {
      this.logger.log(`Judge: team ${teamUid} already judged, skipping`);
      return { status: 'already_judged' };
    }
    if (meta.status !== EnrichmentStatus.Enriched) {
      this.logger.log(`Judge: team ${teamUid} enrichment status is "${meta.status}", not Enriched — skipping`);
      return { status: 'not_eligible' };
    }

    const judgableKeys = this.collectJudgableFieldKeys(team, meta.fieldsMeta ?? {});
    if (judgableKeys.length === 0) {
      this.logger.log(`Judge: team ${teamUid} has no judgable fields, skipping`);
      return { status: 'not_eligible' };
    }

    await this.writeJudgmentStatus(teamUid, meta, { status: JudgmentStatus.InProgress });

    this.runJudgmentPipeline(team, meta, judgableKeys, judgedBy).catch((err) => {
      this.logger.error(`Background judgment failed for team ${teamUid}: ${err.message}`, err.stack);
    });

    return { status: 'started' };
  }

  async forceJudgeTeam(teamUid: string, judgedBy = 'manually'): Promise<JudgeTeamResult> {
    const team = await this.loadTeamRecord(teamUid);
    if (!team) return { status: 'not_found' };

    const meta = this.parseEnrichmentMeta(team.teamEnrichment?.dataEnrichment);
    if (!meta) return { status: 'not_eligible' };

    if (meta.judgment?.status === JudgmentStatus.InProgress) {
      this.logger.warn(`Force-judge: already in progress for team ${teamUid}, skipping`);
      return { status: 'in_progress' };
    }

    const judgableKeys = this.collectJudgableFieldKeys(team, meta.fieldsMeta ?? {});
    if (judgableKeys.length === 0) {
      this.logger.log(`Force-judge: team ${teamUid} has no judgable fields, skipping`);
      return { status: 'not_eligible' };
    }

    await this.writeJudgmentStatus(teamUid, meta, { status: JudgmentStatus.InProgress });

    this.runJudgmentPipeline(team, meta, judgableKeys, judgedBy).catch((err) => {
      this.logger.error(`Background force-judgment failed for team ${teamUid}: ${err.message}`, err.stack);
    });

    return { status: 'started' };
  }

  async triggerJudgmentForAllPending(
    judgedBy = 'manually'
  ): Promise<{ total: number; started: number; skipped: number }> {
    const teams = await this.findTeamsPendingJudgment();
    this.logger.log(`Trigger judge all: found ${teams.length} teams pending judgment`);
    let started = 0;
    let skipped = 0;
    for (const team of teams) {
      const { status } = await this.judgeTeam(team.uid, judgedBy);
      if (status === 'started') started++;
      else skipped++;
    }
    return { total: teams.length, started, skipped };
  }

  /**
   * Two-stage pipeline:
   * Stage 1 — ScrapingDog LinkedIn verification (deterministic, no LLM).
   * Stage 2 — AI judge for fields Stage 1 couldn't resolve.
   * After judgment, fields with high-confidence verdict are promoted to Team.
   */
  private async runJudgmentPipeline(
    team: TeamRecord,
    existingMeta: TeamDataEnrichment,
    judgableKeys: FieldMetaKey[],
    judgedBy: string
  ): Promise<void> {
    const teamUid = team.uid;

    try {
      let stage1Verdicts: Partial<Record<FieldMetaKey, FieldJudgment>> = {};
      let scrapingDogMeta: TeamJudgment['scrapingDog'] | undefined;

      if (this.scrapingDogService.isConfigured() && team.linkedinHandler) {
        const result = await this.scrapingDogService.fetchCompanyProfile(team.linkedinHandler);

        if (result.kind === 'not-found') {
          this.logger.warn(
            `Judge: ScrapingDog reports "${team.linkedinHandler}" not found for team ${teamUid} (${team.name})`
          );
          const handleIsUserOwned = this.isLinkedinHandleUserOwned(existingMeta, !!team.linkedinHandler);
          if (!handleIsUserOwned) {
            await this.nullBadLinkedinHandle(teamUid, existingMeta);
          }
        } else if (result.kind === 'error') {
          this.logger.warn(
            `Judge: ScrapingDog error for team ${teamUid} (${team.name}): ${result.reason}. Skipping Stage 1.`
          );
        } else {
          const profile = result.profile;
          const nameMatch = this.scrapingDogService.classifyNameMatch(team.name, profile);
          // Snapshot what the judge is about to verify: Team for user-supplied values, TeamEnrichment
          // for AI candidates. compareProfileToTeam is fed the right value per field via the
          // readFieldValue / judgeable-value path.
          const teamSnapshot = {
            name: team.name,
            website: this.preferEnrichmentValue(team, 'website'),
            linkedinHandler: team.linkedinHandler,
            shortDescription: this.preferEnrichmentValue(team, 'shortDescription'),
            longDescription: this.preferEnrichmentValue(team, 'longDescription'),
            moreDetails: this.preferEnrichmentValue(team, 'moreDetails'),
            industryTags: this.preferEnrichmentIndustryTags(team).map((title) => ({ title })),
          };
          if (nameMatch !== 'none') {
            stage1Verdicts = this.scrapingDogService.compareProfileToTeam(teamSnapshot, profile, nameMatch);
            for (const k of Object.keys(stage1Verdicts)) {
              if (!judgableKeys.includes(k as FieldMetaKey)) {
                delete stage1Verdicts[k as FieldMetaKey];
              }
            }
          }

          let websiteReachable: boolean | null = null;
          let websiteFinalHost: string | null = null;
          const websiteToProbe = this.preferEnrichmentValue(team, 'website');
          if (websiteToProbe && this.hasJudgableValue(team, 'website')) {
            const probe = await this.probeWebsiteReachable(websiteToProbe);
            if (probe) {
              websiteReachable = probe.reachable;
              websiteFinalHost = probe.finalHost;
            }
          }

          const verifiedFields = Object.entries(stage1Verdicts)
            .filter(([, v]) => v?.verdict === JudgmentVerdict.Agrees && v.confidence === 'high')
            .map(([k]) => k);

          scrapingDogMeta = {
            used: true,
            fetchedAt: new Date().toISOString(),
            nameMatch,
            companyNameFromLinkedIn: profile.companyName,
            verifiedFields,
            linkedinInternalId: profile.linkedinInternalId,
            websiteReachable,
            websiteFinalHost,
          };
        }
      }

      const stage1Resolved = new Set<FieldMetaKey>();
      for (const [k, v] of Object.entries(stage1Verdicts)) {
        if (!v) continue;
        const resolvedAgrees = v.verdict === JudgmentVerdict.Agrees && v.confidence === 'high';
        const resolvedDisagrees = v.verdict === JudgmentVerdict.Disagrees && v.confidence === 'low';
        if (resolvedAgrees || resolvedDisagrees) stage1Resolved.add(k as FieldMetaKey);
      }
      const stage2FieldKeys = judgableKeys.filter((k) => !stage1Resolved.has(k));

      let stage2Verdicts: Partial<Record<FieldMetaKey, FieldJudgment>> = {};
      let overallAssessment = 'All judgable fields verified by ScrapingDog; no AI judge needed.';
      let judgeFailed = false;
      let judgeErrorMessage: string | undefined;
      let judgeUsage: AIUsageEntry | null = null;

      if (stage2FieldKeys.length > 0) {
        const fieldsForAi: JudgeFieldInput[] = stage2FieldKeys
          .map((key) => this.buildFieldInput(team, existingMeta.fieldsMeta ?? {}, key))
          .filter((f): f is JudgeFieldInput => f !== null);

        const judgeContext: JudgeTeamContext = {
          teamName: team.name,
          website: this.preferEnrichmentValue(team, 'website'),
          linkedinHandler: team.linkedinHandler,
          twitterHandler: team.twitterHandler,
          telegramHandler: team.telegramHandler,
          websiteReachable: scrapingDogMeta?.websiteReachable ?? null,
          websiteFinalHost: scrapingDogMeta?.websiteFinalHost ?? null,
          scrapingDog: scrapingDogMeta,
        };

        const aiOut = await this.judgeAi.judgeTeamFields(judgeContext, fieldsForAi);
        judgeUsage = aiOut.usage;
        if (!aiOut.ok) {
          judgeFailed = true;
          judgeErrorMessage = aiOut.errorMessage;
        } else {
          stage2Verdicts = aiOut.verdicts;
          overallAssessment = aiOut.overallAssessment || overallAssessment;
        }
      }

      if (judgeFailed) {
        await this.writeJudgmentStatus(teamUid, existingMeta, {
          status: JudgmentStatus.FailedToJudge,
          errorMessage: judgeErrorMessage,
          scrapingDog: scrapingDogMeta,
        });
        if (judgeUsage) {
          await this.appendJudgeUsage(teamUid, judgeUsage);
          this.logger.log(
            `Judge usage rollup team=${teamUid} name="${team.name}" stage=judge ${formatUsageLog(judgeUsage)} (failed)`
          );
        }
        this.logger.warn(
          `Judge: team ${teamUid} (${team.name}) marked FailedToJudge: ${judgeErrorMessage ?? 'unknown reason'}`
        );
        return;
      }

      const allVerdicts: Partial<Record<FieldMetaKey, FieldJudgment>> = { ...stage2Verdicts, ...stage1Verdicts };

      const refreshedMeta = await this.readEnrichmentMeta(teamUid);
      const baseFieldsMeta = refreshedMeta?.fieldsMeta ?? existingMeta.fieldsMeta ?? {};
      const mergedFieldsMeta: FieldsMetaMap = { ...baseFieldsMeta };

      // Non-destructive: only writes a judgment sub-object; never touches status/value/source on
      // Team or TeamEnrichment. ChangedByUser fields are evaluated for review but the user's
      // value is preserved verbatim.
      const fieldsForReview: string[] = [];
      for (const [key, verdict] of Object.entries(allVerdicts) as Array<[FieldMetaKey, FieldJudgment | undefined]>) {
        if (!verdict) continue;
        const current = mergedFieldsMeta[key];
        if (!current) continue;
        const isEnriched = current.status === FieldEnrichmentStatus.Enriched;
        const isUserJudgable =
          current.status === FieldEnrichmentStatus.ChangedByUser && USER_JUDGABLE_FIELD_KEYS.has(key);
        if (!isEnriched && !isUserJudgable) continue;
        mergedFieldsMeta[key] = {
          ...current,
          judgment: verdict,
        };
        if (this.needsManualReview(verdict)) fieldsForReview.push(key);
      }

      const judgment: TeamJudgment = {
        status: JudgmentStatus.Judged,
        judgedAt: new Date().toISOString(),
        judgedBy,
        aiModel: this.judgeAi.getModelName(),
        overallAssessment,
        fieldsForReview,
        ...(scrapingDogMeta ? { scrapingDog: scrapingDogMeta } : {}),
      };

      const baseUsage = (refreshedMeta ?? existingMeta).usage;
      const mergedJudgeUsage = mergeUsageEntries(baseUsage?.judge, judgeUsage);
      const usageBlock: TeamDataEnrichment['usage'] | undefined =
        mergedJudgeUsage || baseUsage?.enrichment
          ? {
              ...(baseUsage?.enrichment ? { enrichment: baseUsage.enrichment } : {}),
              ...(mergedJudgeUsage ? { judge: mergedJudgeUsage } : {}),
            }
          : undefined;

      const updated: TeamDataEnrichment = {
        ...(refreshedMeta ?? existingMeta),
        fieldsMeta: mergedFieldsMeta,
        judgment,
        ...(usageBlock ? { usage: usageBlock } : {}),
      };

      // Promote high-confidence values from TeamEnrichment → Team in a single transaction with
      // the dataEnrichment write so the promotion is atomic with the verdict.
      const promotableKeys = (Object.entries(allVerdicts) as Array<[FieldMetaKey, FieldJudgment | undefined]>)
        .filter(([, v]) => v?.verdict === JudgmentVerdict.Agrees && v?.confidence === 'high')
        .map(([k]) => k);
      const promotion = await buildPromotionPayload(this.prisma, team.teamEnrichment, promotableKeys, mergedFieldsMeta);

      await this.prisma.$transaction(async (tx) => {
        await tx.teamEnrichment.update({
          where: { teamUid },
          data: { dataEnrichment: updated as any },
        });

        if (promotion.teamUpdate || promotion.investmentFocus !== null) {
          await executePromotion(tx, teamUid, team, promotion);
        }
      });

      this.logger.log(
        `Judge: team ${teamUid} (${team.name}) judged — stage1=${Object.keys(stage1Verdicts).length} stage2=${
          Object.keys(stage2Verdicts).length
        } promoted=[${promotion.promotedFields.join(',')}] fieldsForReview=[${fieldsForReview.join(',')}]`
      );
      if (mergedJudgeUsage) {
        this.logger.log(
          `Judge usage rollup team=${teamUid} name="${team.name}" stage=judge ${formatUsageLog(mergedJudgeUsage)}`
        );
      }
    } catch (error) {
      this.logger.error(`Judge pipeline error for team ${teamUid} (${team.name}): ${error.message}`, error.stack);
      await this.writeJudgmentStatus(teamUid, existingMeta, {
        status: JudgmentStatus.FailedToJudge,
        errorMessage: error.message,
      });
    }
  }

  /**
   * Returns the list of fieldsMeta keys that are candidates for judgment:
   *  - status === Enriched (any judgable key), OR
   *  - status === ChangedByUser AND key is in USER_JUDGABLE_FIELD_KEYS (website + contact links)
   *
   * URL-required fields (`website`, `blog`) whose stored value doesn't parse as a URL are
   * skipped to prevent the judge from fabricating verdicts against junk input.
   */
  private collectJudgableFieldKeys(team: TeamRecord, fieldsMeta: FieldsMetaMap): FieldMetaKey[] {
    const out: FieldMetaKey[] = [];
    for (const key of JUDGABLE_FIELD_KEYS) {
      const meta = fieldsMeta[key];
      if (!meta) continue;
      const statusOk =
        meta.status === FieldEnrichmentStatus.Enriched ||
        (meta.status === FieldEnrichmentStatus.ChangedByUser && USER_JUDGABLE_FIELD_KEYS.has(key));
      if (!statusOk) continue;
      if (!this.hasJudgableValue(team, key)) continue;
      out.push(key);
    }
    return out;
  }

  private hasJudgableValue(team: TeamRecord, key: FieldMetaKey): boolean {
    const value = this.readFieldValue(team, key);
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (URL_REQUIRED_FIELD_KEYS.has(key) && !isValidUrl(trimmed)) return false;
    return true;
  }

  private buildFieldInput(team: TeamRecord, fieldsMeta: FieldsMetaMap, key: FieldMetaKey): JudgeFieldInput | null {
    const meta = fieldsMeta[key];
    if (!meta) return null;
    const value = this.readFieldValue(team, key);
    if (value === null || (Array.isArray(value) && value.length === 0)) return null;
    return {
      field: key,
      currentValue: value,
      source: meta.source,
    };
  }

  /**
   * The judge reads the candidate that needs verification:
   *   - For Enriched fields, that's the value AI wrote to TeamEnrichment.
   *   - For ChangedByUser fields (only the user-judgable subset), that's the user-supplied
   *     value on Team.
   */
  private readFieldValue(team: TeamRecord, key: FieldMetaKey): string | string[] | null {
    const meta = this.parseEnrichmentMeta(team.teamEnrichment?.dataEnrichment);
    const fieldStatus = meta?.fieldsMeta?.[key]?.status;
    const preferEnrichmentSide = fieldStatus !== FieldEnrichmentStatus.ChangedByUser;

    switch (key) {
      case 'website':
        return preferEnrichmentSide ? team.teamEnrichment?.website ?? team.website : team.website;
      case 'blog':
        return preferEnrichmentSide ? team.teamEnrichment?.blog ?? team.blog : team.blog;
      case 'contactMethod':
        return preferEnrichmentSide ? team.teamEnrichment?.contactMethod ?? team.contactMethod : team.contactMethod;
      case 'twitterHandler':
        return preferEnrichmentSide ? team.teamEnrichment?.twitterHandler ?? team.twitterHandler : team.twitterHandler;
      case 'linkedinHandler':
        return preferEnrichmentSide
          ? team.teamEnrichment?.linkedinHandler ?? team.linkedinHandler
          : team.linkedinHandler;
      case 'telegramHandler':
        return preferEnrichmentSide
          ? team.teamEnrichment?.telegramHandler ?? team.telegramHandler
          : team.telegramHandler;
      case 'shortDescription':
        return preferEnrichmentSide
          ? team.teamEnrichment?.shortDescription ?? team.shortDescription
          : team.shortDescription;
      case 'longDescription':
        return preferEnrichmentSide
          ? team.teamEnrichment?.longDescription ?? team.longDescription
          : team.longDescription;
      case 'moreDetails':
        return preferEnrichmentSide ? team.teamEnrichment?.moreDetails ?? team.moreDetails : team.moreDetails;
      case 'industryTags':
        return this.preferEnrichmentIndustryTags(team);
      case 'investmentFocus':
        return team.teamEnrichment?.investmentFocus?.length
          ? team.teamEnrichment.investmentFocus
          : team.investorProfile?.investmentFocus ?? [];
      case 'logo':
        return null;
      default:
        return null;
    }
  }

  private preferEnrichmentValue<K extends keyof TeamEnrichmentSnapshot & keyof TeamRecord>(
    team: TeamRecord,
    key: K
  ): string | null {
    const enrichmentVal = team.teamEnrichment?.[key];
    if (typeof enrichmentVal === 'string' && enrichmentVal.trim() !== '') return enrichmentVal;
    const teamVal = team[key];
    return typeof teamVal === 'string' ? teamVal : null;
  }

  private preferEnrichmentIndustryTags(team: TeamRecord): string[] {
    if (team.teamEnrichment?.industryTags?.length) {
      return team.teamEnrichment.industryTags;
    }
    return team.industryTags.map((t) => t.title);
  }

  private async loadTeamRecord(teamUid: string): Promise<TeamRecord | null> {
    const team = (await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: TEAM_RECORD_SELECT,
    })) as unknown as TeamRecord | null;
    return team;
  }

  private async readEnrichmentMeta(teamUid: string): Promise<TeamDataEnrichment | null> {
    const row = await this.prisma.teamEnrichment.findUnique({
      where: { teamUid },
      select: { dataEnrichment: true },
    });
    return this.parseEnrichmentMeta(row?.dataEnrichment);
  }

  private parseEnrichmentMeta(raw: unknown): TeamDataEnrichment | null {
    if (!raw) return null;
    try {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return data as TeamDataEnrichment;
    } catch {
      return null;
    }
  }

  private isLinkedinHandleUserOwned(meta: TeamDataEnrichment, slotHasValue: boolean): boolean {
    const fieldsMeta = meta.fieldsMeta ?? {};
    const status = fieldsMeta.linkedinHandler?.status;
    if (status === FieldEnrichmentStatus.ChangedByUser) return true;
    if (slotHasValue && !fieldsMeta.linkedinHandler) return true;
    return false;
  }

  private async nullBadLinkedinHandle(teamUid: string, meta: TeamDataEnrichment): Promise<void> {
    const updatedFieldsMeta: FieldsMetaMap = {
      ...(meta.fieldsMeta ?? {}),
      linkedinHandler: {
        ...(meta.fieldsMeta?.linkedinHandler ?? {}),
        status: FieldEnrichmentStatus.CannotEnrich,
      } as FieldEnrichmentMeta,
    };
    const updated: TeamDataEnrichment = { ...meta, fieldsMeta: updatedFieldsMeta };
    await this.prisma.$transaction([
      this.prisma.team.update({
        where: { uid: teamUid },
        data: { linkedinHandler: null },
      }),
      this.prisma.teamEnrichment.update({
        where: { teamUid },
        data: { linkedinHandler: null, dataEnrichment: updated as any },
      }),
    ]);
    this.logger.warn(`Judge: nulled invalid AI-supplied LinkedIn handle on team ${teamUid}`);
  }

  private async appendJudgeUsage(teamUid: string, fresh: AIUsageEntry): Promise<void> {
    const latest = await this.readEnrichmentMeta(teamUid);
    if (!latest) return;
    const merged = mergeUsageEntries(latest.usage?.judge, fresh);
    if (!merged) return;
    const updated: TeamDataEnrichment = {
      ...latest,
      usage: {
        ...(latest.usage?.enrichment ? { enrichment: latest.usage.enrichment } : {}),
        judge: merged,
      },
    };
    await this.prisma.teamEnrichment.update({
      where: { teamUid },
      data: { dataEnrichment: updated as any },
    });
  }

  private async writeJudgmentStatus(
    teamUid: string,
    currentMeta: TeamDataEnrichment,
    patch: Partial<TeamJudgment> & { status: JudgmentStatus }
  ): Promise<void> {
    const latest = (await this.readEnrichmentMeta(teamUid)) ?? currentMeta;
    const existingJudgment = latest.judgment;
    const nextJudgment: TeamJudgment = {
      ...(existingJudgment ?? {}),
      ...patch,
    };
    const updated: TeamDataEnrichment = {
      ...latest,
      judgment: nextJudgment,
    };
    await this.prisma.teamEnrichment.update({
      where: { teamUid },
      data: { dataEnrichment: updated as any },
    });
  }

  private needsManualReview(verdict: FieldJudgment): boolean {
    if (verdict.verdict === JudgmentVerdict.Disagrees) return true;
    if (verdict.verdict === JudgmentVerdict.Uncertain) return true;
    if (verdict.confidence === 'low') return true;
    return false;
  }

  private async probeWebsiteReachable(url: string): Promise<{ reachable: boolean; finalHost: string | null } | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow' as RequestRedirect,
      });
      const finalHost = (() => {
        try {
          return new URL(response.url || url).host.replace(/^www\./, '').toLowerCase();
        } catch {
          return null;
        }
      })();
      return response.ok ? { reachable: true, finalHost } : { reachable: false, finalHost: null };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
