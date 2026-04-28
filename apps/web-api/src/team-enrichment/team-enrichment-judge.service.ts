import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { buildTeamEnrichmentEligibilityFilter } from './team-enrichment-eligibility-filter';
import { JudgeFieldInput, JudgeTeamContext, TeamEnrichmentJudgeAiService } from './team-enrichment-judge-ai.service';
import { TeamEnrichmentScrapingDogService } from './team-enrichment-scrapingdog.service';
import {
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
  dataEnrichment: unknown;
  industryTags: Array<{ title: string }>;
  investorProfile: { investmentFocus: string[] } | null;
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

@Injectable()
export class TeamEnrichmentJudgeService {
  private readonly logger = new Logger(TeamEnrichmentJudgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scrapingDogService: TeamEnrichmentScrapingDogService,
    private readonly judgeAi: TeamEnrichmentJudgeAiService
  ) {}

  /**
   * Finds eligible teams whose enrichment is complete but have not been judged yet.
   * DB-level filter: shared eligibility filter (isFund / priority, see
   * `buildTeamEnrichmentEligibilityFilter`) AND dataEnrichment.status=Enriched.
   * In-memory filter: judgment.status not Judged/InProgress AND at least one judgable field.
   */
  async findTeamsPendingJudgment(): Promise<TeamRecord[]> {
    const candidates = await this.prisma.team.findMany({
      where: {
        AND: [
          buildTeamEnrichmentEligibilityFilter(),
          { dataEnrichment: { path: ['status'], equals: EnrichmentStatus.Enriched } },
        ],
      },
      select: {
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
        dataEnrichment: true,
        industryTags: { select: { title: true } },
        investorProfile: { select: { investmentFocus: true } },
      },
    });

    return candidates.filter((t) => {
      const meta = this.parseEnrichmentMeta(t.dataEnrichment);
      const judgmentStatus = meta?.judgment?.status;
      if (judgmentStatus === JudgmentStatus.Judged) return false;
      if (judgmentStatus === JudgmentStatus.InProgress) return false;
      return this.collectJudgableFieldKeys(meta?.fieldsMeta ?? {}).length > 0;
    });
  }

  async judgeTeam(teamUid: string, judgedBy = 'system-cron'): Promise<JudgeTeamResult> {
    const team = await this.loadTeamRecord(teamUid);
    if (!team) return { status: 'not_found' };

    const meta = this.parseEnrichmentMeta(team.dataEnrichment);
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
      this.logger.log(
        `Judge: team ${teamUid} enrichment status is "${meta.status}", not Enriched — skipping`
      );
      return { status: 'not_eligible' };
    }

    const judgableKeys = this.collectJudgableFieldKeys(meta.fieldsMeta ?? {});
    if (judgableKeys.length === 0) {
      this.logger.log(`Judge: team ${teamUid} has no judgable fields, skipping`);
      return { status: 'not_eligible' };
    }

    await this.writeJudgmentStatus(teamUid, meta, { status: JudgmentStatus.InProgress });

    // Run the full pipeline in the background so callers (cron, admin) don't block on the AI call.
    this.runJudgmentPipeline(team, meta, judgableKeys, judgedBy).catch((err) => {
      this.logger.error(`Background judgment failed for team ${teamUid}: ${err.message}`, err.stack);
    });

    return { status: 'started' };
  }

  async forceJudgeTeam(teamUid: string, judgedBy = 'manually'): Promise<JudgeTeamResult> {
    const team = await this.loadTeamRecord(teamUid);
    if (!team) return { status: 'not_found' };

    const meta = this.parseEnrichmentMeta(team.dataEnrichment);
    if (!meta) return { status: 'not_eligible' };

    if (meta.judgment?.status === JudgmentStatus.InProgress) {
      this.logger.warn(`Force-judge: already in progress for team ${teamUid}, skipping`);
      return { status: 'in_progress' };
    }

    const judgableKeys = this.collectJudgableFieldKeys(meta.fieldsMeta ?? {});
    if (judgableKeys.length === 0) {
      this.logger.log(`Force-judge: team ${teamUid} has no judgable fields, skipping`);
      return { status: 'not_eligible' };
    }

    // Re-queue by clearing any prior terminal judgment state.
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
   */
  private async runJudgmentPipeline(
    team: TeamRecord,
    existingMeta: TeamDataEnrichment,
    judgableKeys: FieldMetaKey[],
    judgedBy: string
  ): Promise<void> {
    const teamUid = team.uid;

    try {
      // --- Stage 1: ScrapingDog ---
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
          const teamSnapshot = {
            name: team.name,
            website: team.website,
            linkedinHandler: team.linkedinHandler,
            shortDescription: team.shortDescription,
            longDescription: team.longDescription,
            moreDetails: team.moreDetails,
            industryTags: team.industryTags,
          };
          if (nameMatch !== 'none') {
            stage1Verdicts = this.scrapingDogService.compareProfileToTeam(teamSnapshot, profile, nameMatch);
            // Keep verdicts only for fields we were asked to judge.
            for (const k of Object.keys(stage1Verdicts)) {
              if (!judgableKeys.includes(k as FieldMetaKey)) {
                delete stage1Verdicts[k as FieldMetaKey];
              }
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
          };
        }
      }

      // --- Stage 2: AI judge ---
      // Skip any field Stage 1 resolved authoritatively (agrees-high or disagrees-low).
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

      if (stage2FieldKeys.length > 0) {
        const fieldsForAi: JudgeFieldInput[] = stage2FieldKeys
          .map((key) => this.buildFieldInput(team, existingMeta.fieldsMeta ?? {}, key))
          .filter((f): f is JudgeFieldInput => f !== null);

        const judgeContext: JudgeTeamContext = {
          teamName: team.name,
          website: team.website,
          linkedinHandler: team.linkedinHandler,
          twitterHandler: team.twitterHandler,
          telegramHandler: team.telegramHandler,
          scrapingDog: scrapingDogMeta,
        };

        const aiOut = await this.judgeAi.judgeTeamFields(judgeContext, fieldsForAi);
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
        this.logger.warn(
          `Judge: team ${teamUid} (${team.name}) marked FailedToJudge: ${judgeErrorMessage ?? 'unknown reason'}`
        );
        return;
      }

      // Merge Stage 1 verdicts on top of Stage 2 — Stage 1 (LinkedIn) is authoritative where it spoke.
      const allVerdicts: Partial<Record<FieldMetaKey, FieldJudgment>> = { ...stage2Verdicts, ...stage1Verdicts };

      // Refresh team dataEnrichment snapshot since Stage 1 may have mutated linkedinHandler meta.
      const refreshedMeta = await this.readEnrichmentMeta(teamUid);
      const baseFieldsMeta = refreshedMeta?.fieldsMeta ?? existingMeta.fieldsMeta ?? {};
      const mergedFieldsMeta: FieldsMetaMap = { ...baseFieldsMeta };

      // The judge is non-destructive: it annotates with a `judgment` sub-object but never
      // overrides enrichment-time values like `confidence` or `source`. Readers who want the
      // judge's verdict should read `fieldsMeta[field].judgment.confidence`.
      const fieldsForReview: string[] = [];
      for (const [key, verdict] of Object.entries(allVerdicts) as Array<[FieldMetaKey, FieldJudgment | undefined]>) {
        if (!verdict) continue;
        const current = mergedFieldsMeta[key];
        if (!current || current.status !== FieldEnrichmentStatus.Enriched) continue;
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

      const updated: TeamDataEnrichment = {
        ...(refreshedMeta ?? existingMeta),
        fieldsMeta: mergedFieldsMeta,
        judgment,
      };

      await this.prisma.team.update({
        where: { uid: teamUid },
        data: { dataEnrichment: updated as any },
      });

      this.logger.log(
        `Judge: team ${teamUid} (${team.name}) judged — stage1=${Object.keys(stage1Verdicts).length} stage2=${Object.keys(stage2Verdicts).length} fieldsForReview=[${fieldsForReview.join(',')}]`
      );
    } catch (error) {
      this.logger.error(
        `Judge pipeline error for team ${teamUid} (${team.name}): ${error.message}`,
        error.stack
      );
      await this.writeJudgmentStatus(teamUid, existingMeta, {
        status: JudgmentStatus.FailedToJudge,
        errorMessage: error.message,
      });
    }
  }

  /**
   * Returns the list of fieldsMeta keys that are candidates for judgment:
   *  - status === Enriched
   *  - excludes logo, ChangedByUser, CannotEnrich
   */
  private collectJudgableFieldKeys(fieldsMeta: FieldsMetaMap): FieldMetaKey[] {
    const out: FieldMetaKey[] = [];
    for (const key of JUDGABLE_FIELD_KEYS) {
      const meta = fieldsMeta[key];
      if (!meta) continue;
      if (meta.status !== FieldEnrichmentStatus.Enriched) continue;
      out.push(key);
    }
    return out;
  }

  private buildFieldInput(
    team: TeamRecord,
    fieldsMeta: FieldsMetaMap,
    key: FieldMetaKey
  ): JudgeFieldInput | null {
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

  private readFieldValue(team: TeamRecord, key: FieldMetaKey): string | string[] | null {
    switch (key) {
      case 'website':
        return team.website;
      case 'blog':
        return team.blog;
      case 'contactMethod':
        return team.contactMethod;
      case 'twitterHandler':
        return team.twitterHandler;
      case 'linkedinHandler':
        return team.linkedinHandler;
      case 'telegramHandler':
        return team.telegramHandler;
      case 'shortDescription':
        return team.shortDescription;
      case 'longDescription':
        return team.longDescription;
      case 'moreDetails':
        return team.moreDetails;
      case 'industryTags':
        return team.industryTags.map((t) => t.title);
      case 'investmentFocus':
        return team.investorProfile?.investmentFocus ?? [];
      case 'logo':
        return null; // never judged
      default:
        return null;
    }
  }

  private async loadTeamRecord(teamUid: string): Promise<TeamRecord | null> {
    const team = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: {
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
        dataEnrichment: true,
        industryTags: { select: { title: true } },
        investorProfile: { select: { investmentFocus: true } },
      },
    });
    return team as TeamRecord | null;
  }

  private async readEnrichmentMeta(teamUid: string): Promise<TeamDataEnrichment | null> {
    const team = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: { dataEnrichment: true },
    });
    return this.parseEnrichmentMeta(team?.dataEnrichment);
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
    await this.prisma.team.update({
      where: { uid: teamUid },
      data: {
        linkedinHandler: null,
        dataEnrichment: updated as any,
      },
    });
    this.logger.warn(`Judge: nulled invalid AI-supplied LinkedIn handle on team ${teamUid}`);
  }

  private async writeJudgmentStatus(
    teamUid: string,
    currentMeta: TeamDataEnrichment,
    patch: Partial<TeamJudgment> & { status: JudgmentStatus }
  ): Promise<void> {
    // Always merge with the freshest DB state to avoid clobbering concurrent writes (e.g. user edits).
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
    await this.prisma.team.update({
      where: { uid: teamUid },
      data: { dataEnrichment: updated as any },
    });
  }

  /**
   * A judged field needs manual review when the judge disagrees, is uncertain, or agrees
   * only at low confidence. Agrees + high/medium is considered trusted — no manual check.
   */
  private needsManualReview(verdict: FieldJudgment): boolean {
    if (verdict.verdict === JudgmentVerdict.Disagrees) return true;
    if (verdict.verdict === JudgmentVerdict.Uncertain) return true;
    if (verdict.confidence === 'low') return true;
    return false;
  }
}
