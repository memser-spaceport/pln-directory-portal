import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { formatUsageLog, mergeUsageEntries } from './team-enrichment-cost';
import { buildTeamEnrichmentEligibilityFilter } from './team-enrichment-eligibility-filter';
import { TeamEnrichmentAiService } from './team-enrichment-ai.service';
import { JudgeFieldInput, JudgeTeamContext, TeamEnrichmentJudgeAiService } from './team-enrichment-judge-ai.service';
import { buildPromotionPayload, executePromotion } from './team-enrichment-promotion';
import {
  extractSupersedingTwitterHandle,
  TeamEnrichmentScrapingDogService,
  verifyTwitterProfileMatchesTeam,
} from './team-enrichment-scrapingdog.service';
import { CorroborationFieldInput, runCorroboration } from './team-enrichment-corroboration';
import { computeTeamQuality } from './team-enrichment-quality';
import { BROWSER_REQUEST_HEADERS } from './team-enrichment-http.util';
import { isLikelyValueForField } from './team-enrichment-field-shape.util';
import {
  BOT_BLOCK_STATUS_CODES,
  expandLinkedinHandleVariants,
  isAgreesHigh,
  isLikelyPersonalContactEmail,
  isPersonalLinkedinHandle,
  JUDGABLE_FIELD_KEYS,
  needsManualReview,
  normalizeHost,
  normalizeTelegramHandle,
  normalizeTwitterHandle,
  TEAM_ENRICHMENT_STUCK_TTL_MINUTES_DEFAULT,
  USER_JUDGABLE_FIELD_KEYS,
  WEBSITE_PROBE_TIMEOUT_MS,
} from './shared';
import {
  AIUsageEntry,
  EnrichmentSource,
  EnrichmentStatus,
  FieldConfidence,
  FieldEnrichmentMeta,
  FieldEnrichmentStatus,
  FieldJudgment,
  FieldMetaKey,
  JudgmentSource,
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
  /**
   * Team leads + role-tagged founders, used by the founder-contact cross-reference
   * rule (Stage 1.5) to validate `contactMethod` against a known founder's email /
   * social handle. Filtered at query time so we don't pull every team member.
   */
  teamMemberRoles: Array<{
    teamLead: boolean;
    role: string | null;
    member: {
      email: string | null;
      twitterHandler: string | null;
      linkedinHandler: string | null;
      telegramHandler: string | null;
    };
  }>;
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
  // Filter at the DB layer: only team leads or members whose role string
  // mentions "founder". Avoids pulling every member for teams with large rosters.
  teamMemberRoles: {
    // `as Prisma.TeamMemberRoleWhereInput[]` so the surrounding `as const` on
    // TEAM_RECORD_SELECT doesn't make this tuple readonly (Prisma rejects
    // readonly arrays for `OR`).
    where: {
      OR: [
        { teamLead: true },
        { role: { contains: 'founder', mode: 'insensitive' } },
      ] as Prisma.TeamMemberRoleWhereInput[],
    },
    select: {
      teamLead: true,
      role: true,
      member: {
        select: {
          email: true,
          twitterHandler: true,
          linkedinHandler: true,
          telegramHandler: true,
        },
      },
    },
  },
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
    private readonly judgeAi: TeamEnrichmentJudgeAiService,
    /**
     * Used only by the stale-user-recovery sub-pipeline — when a
     * ChangedByUser website returns 4xx, the judge calls back into the
     * enrichment AI to discover a fresh URL and re-judges it in-place.
     */
    private readonly enrichmentAi: TeamEnrichmentAiService
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
        AND "updatedAt" < NOW() - make_interval(mins => ${ttlMinutes}::int)
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
    return Number.isInteger(parsed) && parsed > 0 ? parsed : TEAM_ENRICHMENT_STUCK_TTL_MINUTES_DEFAULT;
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
   * Three-stage pipeline driven by the verification ladder (cheap → expensive):
   *   Stage 1   — ScrapingDog LinkedIn match (deterministic API, no LLM).
   *   Stage 1.5 — Deterministic cross-source corroboration (pure functions).
   *   Stage 2   — AI judge for fields the cheaper stages couldn't resolve.
   * Fields verified at agrees+high are promoted to Team in a single tx.
   * See team-enrichment-judge-pipeline.ts for the typed rule-registry view.
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

      // Probe runs unconditionally so the AI judge doesn't have to guess at
      // reachability when ScrapingDog 403s or the team has no LinkedIn handle.
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

      // Blog reachability — same three-state semantics as website
      // (`probeWebsiteReachable` is URL-agnostic, just reuses the bot-mimic
      // headers). Required by the stale-user-recovery pass below: a dead
      // ChangedByUser blog is the symmetric case to a dead website.
      let blogReachable: boolean | null = null;
      const blogToProbe = this.preferEnrichmentValue(team, 'blog');
      if (blogToProbe && this.hasJudgableValue(team, 'blog')) {
        const probe = await this.probeWebsiteReachable(blogToProbe);
        if (probe) {
          blogReachable = probe.reachable;
        }
      }

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
          // Snapshot the candidate side per field: Team for ChangedByUser,
          // TeamEnrichment for Enriched. Same selection rule as readFieldValue.
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

      const stage15Verdicts = this.runStage15(
        team,
        existingMeta,
        judgableKeys,
        scrapingDogMeta,
        websiteReachable
      );

      // Stage 1.5 and Stage 1 verdicts merge before the resolved set is computed.
      // The merge is **confidence-aware** rather than positional:
      //   - When BOTH stages produce a verdict for the same field, keep the
      //     `agrees+high` one. If both are `agrees+high`, Stage 1 wins (its
      //     comparator carries the LinkedIn-internal identity proof and a
      //     more specific note like `name match and website`).
      //   - When only one stage produced a verdict, that one is used.
      //
      // Why this matters: when Stage 1.5's `source-trust` rule has already
      // accepted a field at `agrees+high` (e.g. ScrapingDog filled
      // `moreDetails` at enrichment-time → high-confidence linkedin source),
      // Stage 1's fuzzy `compareProfileToTeam` then re-derives the same
      // verdict but often at a weaker tier (text-overlap heuristics produce
      // `agrees+medium` or `uncertain+medium`). Letting Stage 1 unconditionally
      // overwrite Stage 1.5 silently demoted those auto-promotable fields and
      // flooded the review queue (bench v2 vs v1 regression: moreDetails
      // auto-rate dropped from 47% → 16%, linkedinHandler 97% → 73%).
      const mergedStage1Verdicts: Partial<Record<FieldMetaKey, FieldJudgment>> = { ...stage15Verdicts };
      for (const [key, stage1Verdict] of Object.entries(stage1Verdicts) as Array<
        [FieldMetaKey, FieldJudgment | undefined]
      >) {
        if (!stage1Verdict) continue;
        const existing = mergedStage1Verdicts[key];
        // Preserve Stage 1.5's agrees+high when Stage 1 is anything weaker.
        if (isAgreesHigh(existing) && !isAgreesHigh(stage1Verdict)) continue;
        mergedStage1Verdicts[key] = stage1Verdict;
      }

      const stage1Resolved = new Set<FieldMetaKey>();
      for (const [k, v] of Object.entries(mergedStage1Verdicts)) {
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
          websiteReachable,
          websiteFinalHost,
          scrapingDog: scrapingDogMeta,
          websiteSignals: existingMeta.websiteSignals ?? null,
          corroboratedFields: Object.keys(mergedStage1Verdicts).filter(
            (k) => mergedStage1Verdicts[k as FieldMetaKey]?.verdict === JudgmentVerdict.Agrees &&
              mergedStage1Verdicts[k as FieldMetaKey]?.confidence === 'high'
          ),
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

      const allVerdicts: Partial<Record<FieldMetaKey, FieldJudgment>> = { ...stage2Verdicts, ...mergedStage1Verdicts };

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
        if (needsManualReview(verdict)) fieldsForReview.push(key);
      }

      // Stage 3 — stale user-value recovery. After the first verdict pass,
      // some ChangedByUser fields carry hard evidence that the user's value
      // is no longer the team's canonical one (website 4xx, X bio
      // explicitly naming a successor handle). The recovery sub-pipeline
      // discovers a replacement and re-judges that field in-place, so we
      // don't ship a known-stale value into the admin review queue or
      // worse, leave it as-is.
      const recovery = await this.attemptStaleUserRecovery({
        team,
        existingMeta,
        fieldsMeta: mergedFieldsMeta,
        websiteReachable,
        blogReachable,
        scrapingDogMeta,
      });
      if (recovery.attempted) {
        for (const [k, v] of Object.entries(recovery.candidateWrites) as Array<[FieldMetaKey, string]>) {
          // Update the in-memory enrichment row so buildPromotionPayload
          // picks up the new candidate value when promoting.
          if (team.teamEnrichment) (team.teamEnrichment as any)[k] = v;
        }
        for (const [k, m] of Object.entries(recovery.newFieldsMeta) as Array<[FieldMetaKey, FieldEnrichmentMeta]>) {
          mergedFieldsMeta[k] = m;
        }
        for (const [k, v] of Object.entries(recovery.newVerdicts) as Array<[FieldMetaKey, FieldJudgment]>) {
          allVerdicts[k] = v;
          // If the recovery upgraded the field to agrees+high, drop it from
          // the review queue — there is nothing left for the admin to look
          // at on this field this run.
          if (v.verdict === JudgmentVerdict.Agrees && v.confidence === FieldConfidence.High) {
            const idx = fieldsForReview.indexOf(k);
            if (idx >= 0) fieldsForReview.splice(idx, 1);
          } else if (needsManualReview(v) && !fieldsForReview.includes(k)) {
            fieldsForReview.push(k);
          }
        }
      }

      // Dead-/personal-user-value cleanup: generalization of the
      // `hasJudgableValue` shape-junk skip. The shape gate silently drops
      // "Coming soon!"-style values from the judge pipeline entirely — they
      // never get a verdict and never enter the review queue, because there
      // is no actionable signal a human reviewer could add beyond what the
      // AI already searched.
      //
      // The same logic applies to ChangedByUser fields whose value passed
      // the shape gate but failed our stronger staleness/personal signals
      // (4xx website, 4xx blog, `in/<slug>` linkedinHandler, personal
      // free-provider contactMethod email, twitter handle whose X bio names
      // a successor we couldn't verify): recovery already tried discovery
      // + verification and came up empty, so an admin looking at the field
      // has no extra information. Strip the field's judgment + remove from
      // `fieldsForReview`. `listEnrichmentsForReview`'s filter then drops
      // the field from the admin review queue (no `judgment` block + a
      // shape-valid Team value = nothing to surface).
      //
      // Applies in two situations:
      //   - recovery ran this turn and reported `no-better-candidate` /
      //     `verify-failed` for the field, OR
      //   - recovery was attempted in a prior run (`staleUserRecoveryAttempted`
      //     is true) and the field is still ChangedByUser + still in the
      //     same trigger state — the prior recovery must also have failed
      //     (or the status would now be `Enriched`).
      const recoveryWasAlreadyAttempted = existingMeta.judgment?.staleUserRecoveryAttempted === true;
      const triggerStillFires = (field: FieldMetaKey): boolean => {
        const meta = mergedFieldsMeta[field];
        if (meta?.status !== FieldEnrichmentStatus.ChangedByUser) return false;
        const v = (team as any)[field] as string | null;
        if (!v) return false;
        switch (field) {
          case 'website':
            return websiteReachable === false;
          case 'blog':
            return blogReachable === false;
          case 'linkedinHandler':
            return isPersonalLinkedinHandle(v);
          case 'contactMethod':
            return isLikelyPersonalContactEmail(v, new Set(this.collectLeadContacts(team).emails));
          case 'twitterHandler':
            // Twitter trigger requires the X bio to name a successor we
            // couldn't verify — we don't re-derive that here, so rely on
            // the prior-run event log alone (handled below).
            return false;
          default:
            return false;
        }
      };

      const recoverableFields: FieldMetaKey[] = [
        'website',
        'blog',
        'linkedinHandler',
        'contactMethod',
        'twitterHandler',
      ];
      const droppedFromReview: FieldMetaKey[] = [];
      for (const field of recoverableFields) {
        if (mergedFieldsMeta[field]?.status !== FieldEnrichmentStatus.ChangedByUser) continue;
        const thisRunEvent = recovery.events.find((e) => e.field === field);
        const thisRunFailed =
          !!thisRunEvent && (thisRunEvent.outcome === 'no-better-candidate' || thisRunEvent.outcome === 'verify-failed');
        const stuckFromPrior = recoveryWasAlreadyAttempted && !thisRunEvent && triggerStillFires(field);
        if (!thisRunFailed && !stuckFromPrior) continue;
        const fm = mergedFieldsMeta[field];
        if (fm) {
          const { judgment: _stripped, ...rest } = fm;
          mergedFieldsMeta[field] = rest as FieldEnrichmentMeta;
        }
        delete allVerdicts[field];
        const idx = fieldsForReview.indexOf(field);
        if (idx >= 0) fieldsForReview.splice(idx, 1);
        droppedFromReview.push(field);
      }
      if (droppedFromReview.length > 0) {
        this.logger.log(
          `Recovery: team ${team.uid} (${team.name}) dropping fields from review (no actionable signal for admin): [${droppedFromReview.join(',')}]`
        );
      }

      // Recovery may have overwritten field values for the quality pass —
      // reflect the new ones so completeness / validity reflect the post-
      // recovery state.
      const fieldValuesForQuality = this.collectFieldValuesForQuality(team);
      for (const [k, v] of Object.entries(recovery.candidateWrites) as Array<[FieldMetaKey, string]>) {
        fieldValuesForQuality[k] = v;
      }

      const quality = computeTeamQuality({
        fieldsMeta: mergedFieldsMeta,
        fieldValues: fieldValuesForQuality,
        enrichedAt: existingMeta.enrichedAt,
        hasWebsiteSignals: !!existingMeta.websiteSignals,
        stage15Verdicts,
      });

      const judgment: TeamJudgment = {
        status: JudgmentStatus.Judged,
        judgedAt: new Date().toISOString(),
        judgedBy,
        aiModel: this.judgeAi.getModelName(),
        overallAssessment,
        fieldsForReview,
        ...(scrapingDogMeta ? { scrapingDog: scrapingDogMeta } : {}),
        quality,
        // Always stamp staleUserRecoveryAttempted once the pipeline reaches
        // this point — both when we actively did recovery and when the
        // prior run already attempted it. Prevents the next cron tick from
        // re-firing the AI re-discovery against the same broken value.
        staleUserRecoveryAttempted:
          recovery.attempted || existingMeta.judgment?.staleUserRecoveryAttempted === true,
        ...(recovery.events.length > 0 ? { staleUserRecovery: recovery.events } : {}),
      };

      const baseUsage = (refreshedMeta ?? existingMeta).usage;
      // Recovery can issue an AI enrichment call (for website rediscovery);
      // fold its token usage into the enrichment bucket (it IS an enrichment
      // call by lineage, even though the judge initiated it).
      const mergedJudgeUsage = mergeUsageEntries(baseUsage?.judge, judgeUsage);
      const mergedEnrichmentUsage = mergeUsageEntries(baseUsage?.enrichment, recovery.recoveryUsage);
      const usageBlock: TeamDataEnrichment['usage'] | undefined =
        mergedJudgeUsage || mergedEnrichmentUsage
          ? {
              ...(mergedEnrichmentUsage ? { enrichment: mergedEnrichmentUsage } : {}),
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
          data: {
            dataEnrichment: updated as any,
            // Persist any recovery-introduced scalar candidates onto the
            // TeamEnrichment row's columns so the next stage / future
            // judge / admin review reads the same values out of the DB.
            ...(recovery.candidateWrites as Prisma.TeamEnrichmentUpdateInput),
          },
        });

        if (promotion.teamUpdate || promotion.investmentFocus !== null) {
          await executePromotion(tx, teamUid, team, promotion);
        }
      });

      this.logger.log(
        `Judge: team ${teamUid} (${team.name}) judged — stage1=${Object.keys(stage1Verdicts).length} stage1.5=${
          Object.keys(stage15Verdicts).length
        } stage2=${Object.keys(stage2Verdicts).length} recovered=[${recovery.events
          .filter((e) => e.outcome === 'recovered')
          .map((e) => e.field)
          .join(',')}] promoted=[${promotion.promotedFields.join(
          ','
        )}] fieldsForReview=[${fieldsForReview.join(',')}] thinEvidence=${quality.thinEvidence}`
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

  /**
   * Stage 1.5 — runs the deterministic corroboration rules against every judgable field.
   * Pulls anchors from the team record, the persisted websiteSignals (second source), and
   * the ScrapingDog meta from Stage 1. Returns a verdict map; missing keys mean no rule
   * fired (falls through to AI judge).
   */
  private runStage15(
    team: TeamRecord,
    existingMeta: TeamDataEnrichment,
    judgableKeys: FieldMetaKey[],
    scrapingDogMeta: TeamJudgment['scrapingDog'] | undefined,
    websiteReachable: boolean | null
  ): Partial<Record<FieldMetaKey, FieldJudgment>> {
    const inputs: CorroborationFieldInput[] = [];
    const fieldsMeta = existingMeta.fieldsMeta ?? {};
    for (const key of judgableKeys) {
      const value = this.readFieldValue(team, key);
      if (value === null || (Array.isArray(value) && value.length === 0)) continue;
      // Pass per-field provenance so the source-trust rule can fire on values
      // that were filled at enrichment-time by ScrapingDog or the website
      // signal extractor at high confidence.
      const meta = fieldsMeta[key];
      inputs.push({
        field: key,
        value,
        source: meta?.source,
        enrichmentConfidence: meta?.confidence,
        isUserOwned: meta?.status === FieldEnrichmentStatus.ChangedByUser,
      });
    }

    // ScrapingDog profile is rebuilt from the meta block for the corroboration rule that
    // checks profile.website host. We don't have the full profile in scope here, but the
    // host-match anchor relies only on profile.website (which the meta doesn't carry) so
    // we leave that anchor inactive in Stage 1.5 — it's already covered by Stage 1's
    // compareProfileToTeam (websiteCorroborates) for linkedinHandler.
    // websiteReachable now comes from the unconditional probe (not scrapingDogMeta),
    // so corroborateWebsite gets a real signal even when ScrapingDog Stage 1 was skipped.
    return runCorroboration(inputs, {
      teamName: team.name,
      website: this.preferEnrichmentValue(team, 'website'),
      websiteReachable,
      websiteSignals: existingMeta.websiteSignals ?? null,
      scrapingDogProfile: null,
      scrapingDogNameMatch: scrapingDogMeta?.nameMatch ?? null,
      teamLeadContacts: this.collectLeadContacts(team),
      // The team's other on-file channels. Used by the contactMethod rule to
      // recognize self-declared duplicates (same URL set as both
      // `contactMethod` and `telegramHandler` / `twitterHandler` / ...).
      // Reads the candidate side per field — for a ChangedByUser field
      // that's `Team`, for Enriched it's `TeamEnrichment`. Matches what the
      // judge is currently considering as truth for the other fields.
      teamOwnedChannels: {
        twitterHandler: this.preferEnrichmentValue(team, 'twitterHandler'),
        telegramHandler: this.preferEnrichmentValue(team, 'telegramHandler'),
        linkedinHandler: this.preferEnrichmentValue(team, 'linkedinHandler'),
        blog: this.preferEnrichmentValue(team, 'blog'),
      },
    });
  }

  /**
   * Stage 3 — stale user-value recovery.
   *
   * Runs once per team (idempotent via `judgment.staleUserRecoveryAttempted`).
   * Looks for ChangedByUser fields whose hard-signal evidence says the user
   * value is no longer the team's canonical one:
   *
   *   - **website 4xx** — the unconditional reachability probe returned a
   *     definitive 4xx / 5xx (`websiteReachable === false`). Triggers a
   *     focused AI re-discovery + re-probe + a single-field Stage 1.5
   *     corroboration pass on the new URL. If the new URL is reachable AND
   *     a deterministic anchor fires (`name in website host`, `og name
   *     match`, etc.), the field is promotable to Team in this same run.
   *
   *   - **twitter superseded handle** — the X bio explicitly names a
   *     successor account (`"old handle of @humntech"`, `"moved to @X"`,
   *     etc. — see `SUPERSEDING_HANDLE_PATTERNS`). We re-fetch ScrapingDog
   *     X for the named handle and run the existing
   *     `verifyTwitterProfileMatchesTeam` against the team identity. On
   *     verified, the new handle replaces the user's with
   *     `source=scrapingdog + confidence=high` — Stage 1.5's source-trust
   *     rule auto-promotes it.
   *
   * Both paths write candidate values to TeamEnrichment.<field> AND flip
   * the field's status from ChangedByUser to Enriched. The caller's
   * `buildPromotionPayload` then sees an Enriched field with agrees+high
   * and promotes to Team.<field> in the same transaction as the verdict
   * write. Behavior matches the regular enrichment → judge → promote
   * lifecycle; the only difference is who initiated the AI/ScrapingDog
   * call (judge instead of enrichment cron).
   *
   * Returns a delta — the caller is responsible for merging it into the
   * pipeline's `mergedFieldsMeta`, `allVerdicts`, and the prisma update.
   */
  private async attemptStaleUserRecovery(args: {
    team: TeamRecord;
    existingMeta: TeamDataEnrichment;
    fieldsMeta: FieldsMetaMap;
    websiteReachable: boolean | null;
    blogReachable: boolean | null;
    scrapingDogMeta: TeamJudgment['scrapingDog'] | undefined;
  }): Promise<{
    attempted: boolean;
    events: NonNullable<TeamJudgment['staleUserRecovery']>;
    candidateWrites: Partial<Record<FieldMetaKey, string>>;
    newFieldsMeta: Partial<Record<FieldMetaKey, FieldEnrichmentMeta>>;
    newVerdicts: Partial<Record<FieldMetaKey, FieldJudgment>>;
    recoveryUsage: AIUsageEntry | null;
  }> {
    const { team, existingMeta, fieldsMeta, websiteReachable, blogReachable, scrapingDogMeta } = args;
    const events: NonNullable<TeamJudgment['staleUserRecovery']> = [];
    const candidateWrites: Partial<Record<FieldMetaKey, string>> = {};
    const newFieldsMeta: Partial<Record<FieldMetaKey, FieldEnrichmentMeta>> = {};
    const newVerdicts: Partial<Record<FieldMetaKey, FieldJudgment>> = {};
    let recoveryUsage: AIUsageEntry | null = null;

    // Idempotency — a prior judge run already exhausted recovery for this team.
    // The flag is only reset by the next enrichment write (which clears any
    // stale meta on its way to writing fresh values).
    if (existingMeta.judgment?.staleUserRecoveryAttempted) {
      return {
        attempted: false,
        events,
        candidateWrites,
        newFieldsMeta,
        newVerdicts,
        recoveryUsage,
      };
    }

    const now = new Date().toISOString();
    const leadContacts = this.collectLeadContacts(team);
    const teamLeadEmailSet = new Set(leadContacts.emails);

    // ----- Trigger #1: Twitter superseded-handle (deterministic, no AI) -----
    const twMeta = fieldsMeta.twitterHandler;
    if (
      twMeta?.status === FieldEnrichmentStatus.ChangedByUser &&
      team.twitterHandler &&
      this.scrapingDogService.isConfigured()
    ) {
      const userHandle = team.twitterHandler;
      const profileResult = await this.scrapingDogService.fetchTwitterProfile(userHandle);
      if (profileResult.kind === 'ok' && profileResult.profile.description) {
        const sup = extractSupersedingTwitterHandle(profileResult.profile.description, userHandle);
        if (sup) {
          const newProfileResult = await this.scrapingDogService.fetchTwitterProfile(sup.newHandle);
          if (newProfileResult.kind === 'ok') {
            const teamForVerify = {
              name: team.name,
              website: this.preferEnrichmentValue(team, 'website'),
            };
            const verification = verifyTwitterProfileMatchesTeam(teamForVerify, newProfileResult.profile);
            if (verification.verified) {
              const canonical = newProfileResult.profile.username ?? sup.newHandle;
              const verdict: FieldJudgment = {
                verdict: JudgmentVerdict.Agrees,
                confidence: FieldConfidence.High,
                score: 95,
                note: `superseded ${sup.pattern}`.slice(0, 60),
                judgedVia: JudgmentSource.Corroboration,
              };
              candidateWrites.twitterHandler = canonical;
              newFieldsMeta.twitterHandler = {
                status: FieldEnrichmentStatus.Enriched,
                source: EnrichmentSource.ScrapingDog,
                confidence: FieldConfidence.High,
                lastModifiedAt: now,
                judgment: verdict,
              };
              newVerdicts.twitterHandler = verdict;
              events.push({
                field: 'twitterHandler',
                trigger: 'twitter-superseded',
                outcome: 'recovered',
                priorValue: userHandle,
                newValue: canonical,
                note: `${sup.pattern} -> @${canonical}`.slice(0, 80),
              });
              this.logger.log(
                `Recovery: team ${team.uid} (${team.name}) twitterHandler "${userHandle}" superseded by "@${canonical}" via "${sup.pattern}" + [${verification.anchors.join(', ')}]`
              );
            } else {
              events.push({
                field: 'twitterHandler',
                trigger: 'twitter-superseded',
                outcome: 'verify-failed',
                priorValue: userHandle,
                note: `@${sup.newHandle} did not verify`.slice(0, 80),
              });
              this.logger.log(
                `Recovery: team ${team.uid} (${team.name}) twitterHandler "${userHandle}" claims successor "@${sup.newHandle}" but identity did not verify`
              );
            }
          } else {
            events.push({
              field: 'twitterHandler',
              trigger: 'twitter-superseded',
              outcome: 'verify-failed',
              priorValue: userHandle,
              note: `@${sup.newHandle} not fetchable`.slice(0, 80),
            });
          }
        }
      }
    }

    // ----- Triggers #2-5: AI re-discovery for website / blog / linkedinHandler / contactMethod ----- //
    //
    // Each trigger detects a deterministic "user value is not team-canonical"
    // signal. All AI-driven triggers share a single `enrichTeamViaAI` call:
    // fields needing recovery are passed as null (so the AI re-discovers
    // them), fields the user trusts are passed verbatim (so the AI has
    // context). The response is then verified per field — different
    // verification per field type (probe + corroboration for URL fields,
    // ScrapingDog company-profile existence check for linkedinHandler, etc.).
    //
    // Bench note: doing one AI call for N triggered fields is cheaper than
    // N calls; the prompt is the same, and the AI happens to return all
    // fields anyway (we just ignore the ones we didn't ask to recover).
    const websiteNeedsRecovery =
      fieldsMeta.website?.status === FieldEnrichmentStatus.ChangedByUser &&
      !!team.website &&
      websiteReachable === false;
    const blogNeedsRecovery =
      fieldsMeta.blog?.status === FieldEnrichmentStatus.ChangedByUser &&
      !!team.blog &&
      blogReachable === false;
    const linkedinNeedsRecovery =
      fieldsMeta.linkedinHandler?.status === FieldEnrichmentStatus.ChangedByUser &&
      !!team.linkedinHandler &&
      isPersonalLinkedinHandle(team.linkedinHandler);
    const contactMethodNeedsRecovery =
      fieldsMeta.contactMethod?.status === FieldEnrichmentStatus.ChangedByUser &&
      !!team.contactMethod &&
      isLikelyPersonalContactEmail(team.contactMethod, teamLeadEmailSet);

    if (
      websiteNeedsRecovery ||
      blogNeedsRecovery ||
      linkedinNeedsRecovery ||
      contactMethodNeedsRecovery
    ) {
      // Build the AI payload — null for fields needing recovery (so the
      // prompt says "Unknown" and the model rediscovers); team values
      // otherwise. Twitter uses whatever recovery wrote this turn (if any).
      const aiOut = await this.enrichmentAi.enrichTeamViaAI(team.name, {
        website: websiteNeedsRecovery ? null : team.website ?? undefined,
        contactMethod: contactMethodNeedsRecovery ? null : team.contactMethod ?? undefined,
        linkedinHandler: linkedinNeedsRecovery ? null : team.linkedinHandler ?? undefined,
        twitterHandler: candidateWrites.twitterHandler ?? team.twitterHandler ?? undefined,
        telegramHandler: team.telegramHandler ?? undefined,
        shortDescription: team.shortDescription ?? undefined,
        longDescription: team.longDescription ?? undefined,
        userConfirmedIdentityHints: {
          shortDescription:
            fieldsMeta.shortDescription?.status === FieldEnrichmentStatus.ChangedByUser
              ? team.shortDescription
              : null,
          longDescription:
            fieldsMeta.longDescription?.status === FieldEnrichmentStatus.ChangedByUser
              ? team.longDescription
              : null,
          moreDetails:
            fieldsMeta.moreDetails?.status === FieldEnrichmentStatus.ChangedByUser
              ? team.moreDetails
              : null,
        },
      });
      recoveryUsage = aiOut.usage;

      // Map AI confidence string → FieldConfidence enum. Shared by all
      // AI-recovered fields below.
      const confOf = (field: string): FieldConfidence => {
        const c = aiOut.response.confidence?.[field]?.toLowerCase();
        if (c === 'high') return FieldConfidence.High;
        if (c === 'medium') return FieldConfidence.Medium;
        if (c === 'low') return FieldConfidence.Low;
        return FieldConfidence.Medium;
      };
      const corroborationCtx = {
        teamName: team.name,
        websiteSignals: existingMeta.websiteSignals ?? null,
        scrapingDogProfile: null,
        scrapingDogNameMatch: scrapingDogMeta?.nameMatch ?? null,
        teamLeadContacts: leadContacts,
      };

      // ----- website -----
      if (websiteNeedsRecovery) {
        const priorValue = team.website!;
        const candidate = aiOut.response.website?.trim() ?? '';
        const isFresh =
          candidate &&
          candidate.toLowerCase() !== priorValue.trim().toLowerCase() &&
          isLikelyValueForField('website', candidate);
        if (isFresh) {
          const probe = await this.probeWebsiteReachable(candidate);
          const newReachable = probe?.reachable ?? null;
          if (newReachable !== false) {
            const aiConfidence = confOf('website');
            const corroboration = runCorroboration(
              [
                {
                  field: 'website',
                  value: candidate,
                  source: EnrichmentSource.AI,
                  enrichmentConfidence: aiConfidence,
                  isUserOwned: false,
                },
              ],
              {
                ...corroborationCtx,
                website: candidate,
                websiteReachable: newReachable,
                teamOwnedChannels: {
                  twitterHandler:
                    candidateWrites.twitterHandler ?? this.preferEnrichmentValue(team, 'twitterHandler'),
                  telegramHandler: this.preferEnrichmentValue(team, 'telegramHandler'),
                  linkedinHandler: this.preferEnrichmentValue(team, 'linkedinHandler'),
                  blog: this.preferEnrichmentValue(team, 'blog'),
                },
              }
            );
            const finalVerdict = this.recoveryFinalVerdict(corroboration.website, 'recovered candidate, needs review');
            this.applyRecoveredField(
              'website',
              candidate,
              priorValue,
              'website-4xx',
              EnrichmentSource.AI,
              aiConfidence,
              finalVerdict,
              now,
              { candidateWrites, newFieldsMeta, newVerdicts, events }
            );
            this.logger.log(
              `Recovery: team ${team.uid} (${team.name}) website "${priorValue}" 4xx → AI candidate "${candidate}" verdict ${finalVerdict.verdict}/${finalVerdict.confidence}`
            );
          } else {
            this.logRecoveryFailure(events, 'website', 'website-4xx', priorValue, `AI candidate ${candidate} also 4xx`);
            this.logger.log(
              `Recovery: team ${team.uid} (${team.name}) AI suggested website "${candidate}" but it also 4xx`
            );
          }
        } else {
          this.logRecoveryFailure(
            events,
            'website',
            'website-4xx',
            priorValue,
            candidate ? 'AI returned same/invalid URL' : 'AI returned no candidate'
          );
        }
      }

      // ----- blog -----
      if (blogNeedsRecovery) {
        const priorValue = team.blog!;
        const candidate = aiOut.response.blog?.trim() ?? '';
        const isFresh =
          candidate &&
          candidate.toLowerCase() !== priorValue.trim().toLowerCase() &&
          isLikelyValueForField('blog', candidate);
        if (isFresh) {
          const probe = await this.probeWebsiteReachable(candidate);
          const newReachable = probe?.reachable ?? null;
          if (newReachable !== false) {
            const aiConfidence = confOf('blog');
            const corroboration = runCorroboration(
              [
                {
                  field: 'blog',
                  value: candidate,
                  source: EnrichmentSource.AI,
                  enrichmentConfidence: aiConfidence,
                  isUserOwned: false,
                },
              ],
              {
                ...corroborationCtx,
                website: this.preferEnrichmentValue(team, 'website'),
                websiteReachable,
                teamOwnedChannels: {
                  twitterHandler:
                    candidateWrites.twitterHandler ?? this.preferEnrichmentValue(team, 'twitterHandler'),
                  telegramHandler: this.preferEnrichmentValue(team, 'telegramHandler'),
                  linkedinHandler: this.preferEnrichmentValue(team, 'linkedinHandler'),
                  blog: candidate,
                },
              }
            );
            const finalVerdict = this.recoveryFinalVerdict(corroboration.blog, 'recovered blog, needs review');
            this.applyRecoveredField(
              'blog',
              candidate,
              priorValue,
              'blog-4xx',
              EnrichmentSource.AI,
              aiConfidence,
              finalVerdict,
              now,
              { candidateWrites, newFieldsMeta, newVerdicts, events }
            );
            this.logger.log(
              `Recovery: team ${team.uid} (${team.name}) blog "${priorValue}" 4xx → AI candidate "${candidate}" verdict ${finalVerdict.verdict}/${finalVerdict.confidence}`
            );
          } else {
            this.logRecoveryFailure(events, 'blog', 'blog-4xx', priorValue, `AI candidate ${candidate} also 4xx`);
          }
        } else {
          this.logRecoveryFailure(
            events,
            'blog',
            'blog-4xx',
            priorValue,
            candidate ? 'AI returned same/invalid URL' : 'AI returned no candidate'
          );
        }
      }

      // ----- linkedinHandler -----
      // Verification is stricter than the other AI paths: ScrapingDog must
      // confirm the new handle resolves to a real company profile whose name
      // matches the team. Otherwise the AI's guess is exactly the kind of
      // speculative `company/<plausible-slug>` we'd never auto-promote.
      if (linkedinNeedsRecovery) {
        const priorValue = team.linkedinHandler!;
        const candidate = aiOut.response.linkedinHandler?.trim() ?? '';
        const isFresh =
          candidate &&
          candidate.toLowerCase() !== priorValue.trim().toLowerCase() &&
          isLikelyValueForField('linkedinHandler', candidate) &&
          !isPersonalLinkedinHandle(candidate);
        if (isFresh && this.scrapingDogService.isConfigured()) {
          const profileResult = await this.scrapingDogService.fetchCompanyProfile(candidate);
          if (profileResult.kind === 'ok') {
            const nameMatch = this.scrapingDogService.classifyNameMatch(team.name, profileResult.profile);
            if (nameMatch === 'exact' || nameMatch === 'partial') {
              const aiConfidence = confOf('linkedinHandler');
              const verdict: FieldJudgment = {
                verdict: JudgmentVerdict.Agrees,
                confidence: FieldConfidence.High,
                score: nameMatch === 'exact' ? 95 : 90,
                note: `linkedin company verified (${nameMatch} name)`.slice(0, 60),
                judgedVia: JudgmentSource.ScrapingDog,
              };
              this.applyRecoveredField(
                'linkedinHandler',
                candidate,
                priorValue,
                'linkedin-personal',
                EnrichmentSource.ScrapingDog,
                aiConfidence,
                verdict,
                now,
                { candidateWrites, newFieldsMeta, newVerdicts, events }
              );
              this.logger.log(
                `Recovery: team ${team.uid} (${team.name}) linkedinHandler "${priorValue}" was personal → AI candidate "${candidate}" (sd ${nameMatch})`
              );
            } else {
              this.logRecoveryFailure(
                events,
                'linkedinHandler',
                'linkedin-personal',
                priorValue,
                `${candidate} sd name-match none`
              );
            }
          } else {
            this.logRecoveryFailure(
              events,
              'linkedinHandler',
              'linkedin-personal',
              priorValue,
              `${candidate} not on linkedin`
            );
          }
        } else {
          this.logRecoveryFailure(
            events,
            'linkedinHandler',
            'linkedin-personal',
            priorValue,
            candidate
              ? !isPersonalLinkedinHandle(candidate)
                ? 'AI returned same/invalid handle'
                : 'AI also returned in/<slug>'
              : 'AI returned no candidate'
          );
        }
      }

      // ----- contactMethod -----
      if (contactMethodNeedsRecovery) {
        const priorValue = team.contactMethod!;
        const candidate = aiOut.response.contactMethod?.trim() ?? '';
        const isFresh =
          candidate &&
          candidate.toLowerCase() !== priorValue.trim().toLowerCase() &&
          isLikelyValueForField('contactMethod', candidate) &&
          !isLikelyPersonalContactEmail(candidate, teamLeadEmailSet);
        if (isFresh) {
          const aiConfidence = confOf('contactMethod');
          const corroboration = runCorroboration(
            [
              {
                field: 'contactMethod',
                value: candidate,
                source: EnrichmentSource.AI,
                enrichmentConfidence: aiConfidence,
                isUserOwned: false,
              },
            ],
            {
              ...corroborationCtx,
              website: this.preferEnrichmentValue(team, 'website'),
              websiteReachable,
              teamOwnedChannels: {
                twitterHandler:
                  candidateWrites.twitterHandler ?? this.preferEnrichmentValue(team, 'twitterHandler'),
                telegramHandler: this.preferEnrichmentValue(team, 'telegramHandler'),
                linkedinHandler:
                  candidateWrites.linkedinHandler ?? this.preferEnrichmentValue(team, 'linkedinHandler'),
                blog: candidateWrites.blog ?? this.preferEnrichmentValue(team, 'blog'),
              },
            }
          );
          const finalVerdict = this.recoveryFinalVerdict(
            corroboration.contactMethod,
            'recovered contact, needs review'
          );
          this.applyRecoveredField(
            'contactMethod',
            candidate,
            priorValue,
            'contact-personal-email',
            EnrichmentSource.AI,
            aiConfidence,
            finalVerdict,
            now,
            { candidateWrites, newFieldsMeta, newVerdicts, events }
          );
          this.logger.log(
            `Recovery: team ${team.uid} (${team.name}) contactMethod "${priorValue}" was personal → AI candidate "${candidate}" verdict ${finalVerdict.verdict}/${finalVerdict.confidence}`
          );
        } else {
          this.logRecoveryFailure(
            events,
            'contactMethod',
            'contact-personal-email',
            priorValue,
            candidate ? 'AI returned same/personal contact' : 'AI returned no candidate'
          );
        }
      }
    }

    return {
      attempted: events.length > 0,
      events,
      candidateWrites,
      newFieldsMeta,
      newVerdicts,
      recoveryUsage,
    };
  }

  /**
   * Final-verdict resolver shared by all AI-recovered URL/contact fields: if
   * Stage 1.5 corroborated the new candidate at `agrees`, use that verdict
   * verbatim (it carries the actual anchor notes — "name in website host",
   * "email domain matches website"). Otherwise fall back to
   * `uncertain + medium` with a recovery-specific note — the value is
   * better than the dead/personal one we had, but no deterministic anchor
   * fired, so it isn't promotable in this run.
   */
  private recoveryFinalVerdict(
    corroborated: FieldJudgment | undefined,
    fallbackNote: string
  ): FieldJudgment {
    if (corroborated && corroborated.verdict === JudgmentVerdict.Agrees) return corroborated;
    return {
      verdict: JudgmentVerdict.Uncertain,
      confidence: FieldConfidence.Medium,
      score: 55,
      note: fallbackNote,
      judgedVia: JudgmentSource.Corroboration,
    };
  }

  /** Bookkeeping helper — push a successful-recovery delta into the aggregate. */
  private applyRecoveredField(
    field: FieldMetaKey,
    newValue: string,
    priorValue: string,
    trigger: NonNullable<TeamJudgment['staleUserRecovery']>[number]['trigger'],
    source: EnrichmentSource,
    enrichmentConfidence: FieldConfidence,
    verdict: FieldJudgment,
    nowIso: string,
    out: {
      candidateWrites: Partial<Record<FieldMetaKey, string>>;
      newFieldsMeta: Partial<Record<FieldMetaKey, FieldEnrichmentMeta>>;
      newVerdicts: Partial<Record<FieldMetaKey, FieldJudgment>>;
      events: NonNullable<TeamJudgment['staleUserRecovery']>;
    }
  ): void {
    out.candidateWrites[field] = newValue;
    out.newFieldsMeta[field] = {
      status: FieldEnrichmentStatus.Enriched,
      source,
      confidence: enrichmentConfidence,
      lastModifiedAt: nowIso,
      judgment: verdict,
    };
    out.newVerdicts[field] = verdict;
    out.events.push({
      field,
      trigger,
      outcome: 'recovered',
      priorValue,
      newValue,
      note: verdict.note ?? '',
    });
  }

  /** Bookkeeping helper — push a no-candidate / verify-failed event into the aggregate. */
  private logRecoveryFailure(
    events: NonNullable<TeamJudgment['staleUserRecovery']>,
    field: FieldMetaKey,
    trigger: NonNullable<TeamJudgment['staleUserRecovery']>[number]['trigger'],
    priorValue: string,
    note: string
  ): void {
    events.push({
      field,
      trigger,
      outcome: 'no-better-candidate',
      priorValue,
      note: note.slice(0, 80),
    });
  }

  /**
   * Extracts and normalizes contact info for the team's leads / founders.
   * Result is consumed by the founder-contact cross-reference rule on
   * `contactMethod`. All values lowercased, no `@`, no URL prefix.
   */
  private collectLeadContacts(team: TeamRecord): {
    emails: string[];
    twitter: string[];
    telegram: string[];
    linkedin: string[];
  } {
    const emails = new Set<string>();
    const twitter = new Set<string>();
    const telegram = new Set<string>();
    const linkedin = new Set<string>();

    for (const role of team.teamMemberRoles ?? []) {
      const m = role.member;
      if (m.email) emails.add(m.email.trim().toLowerCase());
      if (m.twitterHandler) twitter.add(normalizeTwitterHandle(m.twitterHandler));
      if (m.telegramHandler) telegram.add(normalizeTelegramHandle(m.telegramHandler));
      if (m.linkedinHandler) {
        for (const variant of expandLinkedinHandleVariants(m.linkedinHandler)) {
          linkedin.add(variant);
        }
      }
    }

    return {
      emails: [...emails].filter(Boolean),
      twitter: [...twitter].filter(Boolean),
      telegram: [...telegram].filter(Boolean),
      linkedin: [...linkedin].filter(Boolean),
    };
  }

  /** Snapshot of every judgable field value for the quality scorer. */
  private collectFieldValuesForQuality(team: TeamRecord): Partial<Record<FieldMetaKey, string | string[] | null>> {
    const out: Partial<Record<FieldMetaKey, string | string[] | null>> = {};
    for (const key of JUDGABLE_FIELD_KEYS) {
      out[key] = this.readFieldValue(team, key);
    }
    return out;
  }

  private hasJudgableValue(team: TeamRecord, key: FieldMetaKey): boolean {
    const value = this.readFieldValue(team, key);
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    const trimmed = value.trim();
    if (!trimmed) return false;
    // Per-field shape gate: rejects placeholders like "Coming soon!" on URL
    // fields and "email" / "Twitter" / "Telegram" on contactMethod, plus
    // structurally-impossible values on social handles.
    return isLikelyValueForField(key, trimmed);
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

  /**
   * Reachability probe for the team's website. Uses the same browser-mimic
   * headers as the website-signal extractor — Cloudflare / Akamai bot rules
   * routinely 403 on bare User-Agent fetches.
   *
   * Three-state return:
   *   - `reachable: true`  — 2xx. Definitively up; `finalHost` is post-redirect.
   *   - `reachable: false` — definitive negative (404 / 410 / 500 / 502 / 504).
   *   - `reachable: null`  — inconclusive. Either a network error / timeout
   *     OR a bot-block status (401, 403, 429, 451, 503). Stage 1.5's
   *     `corroborateWebsite` rule allows null-reachability when a strong
   *     deterministic name anchor matches; the AI judge is told not to infer.
   */
  private async probeWebsiteReachable(url: string): Promise<{ reachable: boolean | null; finalHost: string | null } | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEBSITE_PROBE_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow' as RequestRedirect,
        headers: { ...BROWSER_REQUEST_HEADERS },
      });
      if (response.ok) {
        return { reachable: true, finalHost: normalizeHost(response.url || url) };
      }
      if (BOT_BLOCK_STATUS_CODES.has(response.status)) {
        return { reachable: null, finalHost: null };
      }
      return { reachable: false, finalHost: null };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
