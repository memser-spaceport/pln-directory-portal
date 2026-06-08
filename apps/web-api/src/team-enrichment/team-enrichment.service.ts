import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { TeamEnrichmentAiService } from './team-enrichment-ai.service';
import { buildTeamEnrichmentEligibilityFilter } from './team-enrichment-eligibility-filter';
import { formatUsageLog, mergeUsageEntries } from './team-enrichment-cost';
import {
  ScrapingDogCompanyProfile,
  TeamEnrichmentScrapingDogService,
  verifyTwitterProfileMatchesTeam,
} from './team-enrichment-scrapingdog.service';
import { deriveTeamFieldsFromLeads } from './team-enrichment-lead-backfill';
import { isLikelyValueForField, looksLikeAiNonAnswer } from './team-enrichment-field-shape.util';
import {
  ENRICHABLE_TEAM_FIELDS,
  EnrichableTeamField,
  EnrichmentSource,
  EnrichmentStatus,
  FieldConfidence,
  FieldEnrichmentMeta,
  FieldEnrichmentStatus,
  FieldJudgment,
  FieldMetaKey,
  ForceEnrichmentMode,
  JudgmentSource,
  JudgmentStatus,
  JudgmentVerdict,
  TeamDataEnrichment,
} from './team-enrichment.types';

export type EnrichmentReviewFieldEntry = {
  /**
   * Primary value. ChangedByUser → reads from `Team.<field>` (user's value
   * is the source of truth). Enriched / CannotEnrich → reads from
   * `TeamEnrichment.<field>` (AI candidate, possibly junk-overridden into
   * Enriched on this team). Empty side falls back to the other.
   */
  content: string | string[];
  metadata: { status?: FieldEnrichmentStatus; source?: EnrichmentSource; lastModifiedAt?: string };
  judgment: { note?: string; score?: number; verdict?: JudgmentVerdict; confidence?: FieldConfidence };
  /**
   * The opposite-side candidate when it exists, differs from `content`, and
   * is shape-valid. Lets the back-office show "user typed X, AI suggests Y"
   * side-by-side so admins can pick the AI candidate when the user typed a
   * placeholder (`"Coming soon!"`, `"n/a"`) or got it wrong. `fromSide`
   * tells the UI which side this came from:
   *
   *   - `'enrichment'`: primary is the user's value (status=ChangedByUser),
   *     this is the AI candidate. Show as "AI suggestion".
   *   - `'team'`: primary is the AI candidate (status=Enriched after the
   *     junk-override path), this is the literal value on the Team row.
   *     Show as "Current user value (likely junk)" so admins can confirm
   *     the AI candidate replaces it.
   *
   * Omitted when the two sides are equal, when the opposite side is empty,
   * or when the opposite side fails the per-field shape gate (no point
   * surfacing a second junk value).
   */
  alternative?: {
    content: string | string[];
    fromSide: 'team' | 'enrichment';
  };
};

export type EnrichmentReviewLogo = {
  content: { uid: string; url: string } | null;
  metadata: { status?: FieldEnrichmentStatus; source?: EnrichmentSource; lastModifiedAt?: string };
  // Admin-approval judgment lives on fieldsMeta.logo.judgment (PATCH /enrichment-review writes
  // {verdict: agrees, confidence: high, score: 100} here). The VLM cron never writes here —
  // it writes to verification below.
  judgment?: { note?: string; score?: number; verdict?: JudgmentVerdict; confidence?: FieldConfidence };
  verification: {
    verdict: string;
    confidence: string;
    reason: string | null;
    verifiedAt: string;
  } | null;
};

export type EnrichmentReviewItem = {
  uid: string;
  name: string;
  priority: number;
  enrichmentStatus: EnrichmentStatus;
  enrichmentAt: string | null;
  judgedAt: string | null;
  fields: Partial<Record<FieldMetaKey, EnrichmentReviewFieldEntry>>;
  logo?: EnrichmentReviewLogo;
};

export type ApproveEnrichmentTeamSkip = {
  key: FieldMetaKey;
  reason: 'empty_value' | 'no_candidate';
};

export type ApproveEnrichmentTeamResult = {
  success: boolean;
  approved: FieldMetaKey[];
  skipped: ApproveEnrichmentTeamSkip[];
  message?: string;
};

export type ApproveEnrichmentFieldInput = {
  key: FieldMetaKey;
  content?: string | string[];
};

export type TeamEnrichmentStatusEntry = {
  status: EnrichmentStatus;
  shouldEnrich: boolean;
  enrichedAt: string | null;
  enrichedBy: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  errorMessage: string | null;
  aiModel: string | null;
};

export type TeamJudgmentStatusEntry = {
  status: JudgmentStatus;
  judgedAt: string | null;
  judgedBy: string | null;
  aiModel: string | null;
  errorMessage: string | null;
  overallAssessment: string | null;
  fieldsForReview: string[];
};

export type TeamEnrichmentStatusResult = {
  uid: string;
  name: string;
  enrichment: TeamEnrichmentStatusEntry | null;
  judgment: TeamJudgmentStatusEntry | null;
};

export type EnrichmentCronCounts = {
  enrichment: { pending: number; inProgress: number };
  judge: { pending: number; inProgress: number };
};

export type EnrichmentCronStatusResult = {
  enrichment: { isRunning: boolean; pending: number; inProgress: number };
  marking: { isRunning: boolean };
  judge: { isRunning: boolean; pending: number; inProgress: number };
};

const CONFIDENCE_RANK: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

function rankConfidence(value: FieldConfidence | undefined): number {
  return value ? CONFIDENCE_RANK[value] ?? 0 : 0;
}

type FieldsMetaMap = Partial<Record<FieldMetaKey, FieldEnrichmentMeta>>;

/**
 * User-owned = user explicitly asserted this value on the Team record.
 * True when fieldsMeta says ChangedByUser, OR Team[field] is non-empty with no prior Enriched
 * meta entry (pre-enrichment data or post-CannotEnrich user fill-in). User-owned values are
 * highest-trust and should bypass downstream verification / fuzzy-matching checks.
 *
 * Note: "non-empty" is evaluated against the Team row (what the user/judge sees), NOT the
 * TeamEnrichment row (which holds AI candidates not yet promoted).
 */
function isFieldUserOwned(
  fieldsMeta: Partial<Record<FieldMetaKey, FieldEnrichmentMeta>>,
  field: FieldMetaKey,
  teamValue: string | null | undefined
): boolean {
  // A value is "user-owned" only if the user provided meaningful data.
  // Junk-shaped placeholders ("Coming soon!", "n/a", field-name typos like
  // "email" / "Twitter") are treated as effectively-empty, so they don't
  // block enrichment and don't get promoted as if they were real user data.
  // The shape validator is the same one the judge uses (`isLikelyValueForField`),
  // so enrichment and judging agree on what counts as a real value.
  if (!teamValue || teamValue.trim() === '' || !isLikelyValueForField(field, teamValue)) {
    return false;
  }
  const status = fieldsMeta[field]?.status;
  if (status === FieldEnrichmentStatus.ChangedByUser) return true;
  if (!fieldsMeta[field]) return true; // pre-enrichment user data
  return false;
}

/**
 * Stamp a fresh `lastModifiedAt` on a fieldsMeta entry. Call this at every site that
 * writes a value (enrichment, ScrapingDog fill, AI giving up on a field, user edit, logo
 * refetch, bad-LinkedIn-handle nulling).
 */
function stampModified<T extends FieldEnrichmentMeta>(meta: T, at: string): T {
  return { ...meta, lastModifiedAt: at };
}

function toConfidence(raw: unknown): FieldConfidence | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.toLowerCase();
  if (v === 'high') return FieldConfidence.High;
  if (v === 'medium') return FieldConfidence.Medium;
  if (v === 'low') return FieldConfidence.Low;
  return undefined;
}

type TeamWithEnrichment = {
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
  logoUid: string | null;
  industryTags: Array<{ uid: string; title: string }>;
  investorProfile: { uid: string; investmentFocus: string[] } | null;
  /**
   * Team leads + role-tagged founders — pre-filtered at the DB layer so we
   * don't pull every member. Used by the lead-backfill step (an additional
   * non-AI source of team-shaped contact/social fields).
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
  teamEnrichment: TeamEnrichmentRow | null;
};

type TeamEnrichmentRow = {
  uid: string;
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
  dataEnrichment: any;
};

const TEAM_WITH_ENRICHMENT_SELECT = {
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
  logoUid: true,
  industryTags: { select: { uid: true, title: true } },
  investorProfile: { select: { uid: true, investmentFocus: true } },
  // Lead-backfill input. Filtered at the DB layer to teamLead OR role-mentions-founder
  // so we don't pull every member for teams with large rosters. Member fields
  // selected are the ones that could plausibly identity-match the team.
  teamMemberRoles: {
    // `as Prisma.TeamMemberRoleWhereInput[]` so the surrounding `as const` on
    // TEAM_WITH_ENRICHMENT_SELECT doesn't make this tuple readonly (Prisma
    // rejects readonly arrays for `OR`).
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
      uid: true,
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
export class TeamEnrichmentService {
  private readonly logger = new Logger(TeamEnrichmentService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileUploadService: FileUploadService,
    private readonly aiService: TeamEnrichmentAiService,
    private readonly scrapingDogService: TeamEnrichmentScrapingDogService
  ) {}

  async markTeamForEnrichment(teamUid: string): Promise<void> {
    const existing = await this.readEnrichmentMeta(teamUid);

    const enrichment: TeamDataEnrichment = {
      ...(existing ?? { isAIGenerated: false }),
      shouldEnrich: true,
      status: EnrichmentStatus.PendingEnrichment,
      isAIGenerated: existing?.isAIGenerated ?? false,
      fieldsMeta: existing?.fieldsMeta ?? {},
    };

    await this.upsertEnrichmentRow(teamUid, enrichment);
    this.logger.log(`Marked team ${teamUid} for enrichment`);
  }

  /**
   * Eligibility: team has no TeamEnrichment row yet, AND at least one enrichable scalar slot is empty.
   * The marking job reads only the Team table — the per-team upsert into TeamEnrichment happens
   * inside `markTeamForEnrichment`, so the find query stays a single read against Team.
   */
  async findTeamsEligibleForEnrichment(): Promise<Array<{ uid: string }>> {
    return this.prisma.team.findMany({
      where: {
        AND: [
          buildTeamEnrichmentEligibilityFilter(),
          { teamEnrichment: { is: null } },
          {
            OR: [
              { website: null },
              { website: '' },
              { blog: null },
              { blog: '' },
              { contactMethod: null },
              { contactMethod: '' },
              { twitterHandler: null },
              { twitterHandler: '' },
              { linkedinHandler: null },
              { linkedinHandler: '' },
              { telegramHandler: null },
              { telegramHandler: '' },
              { shortDescription: null },
              { shortDescription: '' },
              { longDescription: null },
              { longDescription: '' },
              { moreDetails: null },
              { moreDetails: '' },
            ],
          },
        ],
      },
      select: { uid: true },
    });
  }

  async markEligibleTeamsForEnrichment(): Promise<number> {
    const teams = await this.findTeamsEligibleForEnrichment();
    this.logger.log(`Found ${teams.length} teams eligible for enrichment marking`);
    for (const team of teams) {
      await this.markTeamForEnrichment(team.uid);
    }
    return teams.length;
  }

  /**
   * Teams whose TeamEnrichment.dataEnrichment is PendingEnrichment + shouldEnrich=true.
   * Filtered via JSONB path expressions on the TeamEnrichment row.
   *
   * Also self-heals rows stuck in InProgress beyond the stuck-TTL (pod was killed mid-flight)
   * by flipping them back to PendingEnrichment + shouldEnrich=true so the same call picks
   * them up.
   */
  async findTeamsPendingEnrichment(): Promise<Array<{ uid: string }>> {
    await this.resetStaleInProgressEnrichment();
    return this.prisma.team.findMany({
      where: {
        teamEnrichment: {
          AND: [
            { dataEnrichment: { path: ['shouldEnrich'], equals: true } },
            { dataEnrichment: { path: ['status'], equals: EnrichmentStatus.PendingEnrichment } },
          ],
        },
      },
      select: { uid: true },
    });
  }

  /**
   * Flips rows whose `dataEnrichment.status = 'InProgress'` and `updatedAt` is older than
   * the stuck-TTL back to `PendingEnrichment + shouldEnrich=true`. The only way a row stays
   * `InProgress` past the TTL is a pod that died mid-run — every healthy enrichment writes
   * a terminal status in well under the TTL window.
   *
   * TTL is `TEAM_ENRICHMENT_STUCK_TTL_MINUTES` (default 180). A generous default avoids
   * racing a slow-but-live run.
   */
  private async resetStaleInProgressEnrichment(): Promise<void> {
    const ttlMinutes = this.getStuckTtlMinutes();
    const updated = await this.prisma.$executeRaw`
      UPDATE "TeamEnrichment"
      SET "dataEnrichment" =
            jsonb_set(
              jsonb_set("dataEnrichment", '{status}',       '"PendingEnrichment"'),
                                          '{shouldEnrich}', 'true'
            ),
          "updatedAt" = NOW()
      WHERE "dataEnrichment"->>'status' = 'InProgress'
        AND "updatedAt" < NOW() - make_interval(mins => ${ttlMinutes}::int)
    `;
    if (updated > 0) {
      this.logger.warn(
        `Stale enrichment recovery: reset ${updated} row(s) from InProgress → PendingEnrichment (ttl=${ttlMinutes}m)`
      );
    }
  }

  private getStuckTtlMinutes(): number {
    const raw = process.env.TEAM_ENRICHMENT_STUCK_TTL_MINUTES?.trim();
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 180;
  }

  async enrichTeam(teamUid: string, enrichedBy = 'system-cron'): Promise<{ status: 'started' | 'in_progress' }> {
    const meta = await this.readEnrichmentMeta(teamUid);
    if (meta?.status === EnrichmentStatus.InProgress) {
      this.logger.warn(`Enrichment already in progress for team ${teamUid}, skipping`);
      return { status: 'in_progress' };
    }

    await this.markTeamForEnrichment(teamUid);

    this.doEnrichTeam(teamUid, enrichedBy).catch((err) => {
      this.logger.error(`Background enrichment failed for team ${teamUid}: ${err.message}`, err.stack);
    });

    return { status: 'started' };
  }

  async forceEnrichTeam(
    teamUid: string,
    mode: ForceEnrichmentMode,
    enrichedBy = 'manually'
  ): Promise<{ status: 'started' | 'in_progress' | 'not_found' }> {
    const team = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: { uid: true },
    });
    if (!team) return { status: 'not_found' };

    const existing = await this.readEnrichmentMeta(teamUid);
    if (existing?.status === EnrichmentStatus.InProgress) {
      this.logger.warn(`Force-enrichment: already in progress for team ${teamUid}, skipping`);
      return { status: 'in_progress' };
    }

    // Preserve all existing fieldsMeta entries (Enriched, CannotEnrich, ChangedByUser) so
    // provenance is retained across the re-run.
    const enrichment: TeamDataEnrichment = {
      ...(existing ?? { isAIGenerated: false }),
      shouldEnrich: true,
      status: EnrichmentStatus.PendingEnrichment,
      isAIGenerated: existing?.isAIGenerated ?? false,
      fieldsMeta: existing?.fieldsMeta ?? {},
    };

    await this.upsertEnrichmentRow(teamUid, enrichment);
    this.logger.log(`Force-enrichment queued for team ${teamUid} (mode=${mode})`);

    this.doEnrichTeam(teamUid, enrichedBy, { forceOverwrite: mode === 'all' }).catch((err) => {
      this.logger.error(`Background force-enrichment failed for team ${teamUid}: ${err.message}`, err.stack);
    });

    return { status: 'started' };
  }

  /**
   * Teams whose enrichment is in a terminal state (Enriched / Reviewed / Approved / FailedToEnrich).
   * Used by the force-enrich-all endpoint.
   */
  async findCompletedTeams(): Promise<Array<{ uid: string }>> {
    const completedStatuses = [
      EnrichmentStatus.Enriched,
      EnrichmentStatus.Reviewed,
      EnrichmentStatus.Approved,
      EnrichmentStatus.FailedToEnrich,
    ];
    return this.prisma.team.findMany({
      where: {
        AND: [
          buildTeamEnrichmentEligibilityFilter(),
          {
            teamEnrichment: {
              OR: completedStatuses.map((status) => ({
                dataEnrichment: { path: ['status'], equals: status },
              })),
            },
          },
        ],
      },
      select: { uid: true },
    });
  }

  async forceEnrichAllCompletedTeams(
    mode: ForceEnrichmentMode,
    enrichedBy = 'manually'
  ): Promise<{ total: number; started: number; skipped: number }> {
    const teams = await this.findCompletedTeams();
    this.logger.log(`Force-enrich all (mode=${mode}): found ${teams.length} completed teams`);

    let started = 0;
    let skipped = 0;

    for (const team of teams) {
      const { status } = await this.forceEnrichTeam(team.uid, mode, enrichedBy);
      if (status === 'started') started++;
      else skipped++;
    }

    return { total: teams.length, started, skipped };
  }

  async forceRefetchLogo(
    teamUid: string,
    enrichedBy = 'manually'
  ): Promise<{
    status: 'started' | 'in_progress' | 'not_found' | 'skipped_user_owned' | 'no_source';
  }> {
    const team = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: {
        website: true,
        linkedinHandler: true,
        teamEnrichment: { select: { dataEnrichment: true } },
      },
    });
    if (!team) return { status: 'not_found' };

    const existing = this.parseEnrichmentMeta(team.teamEnrichment?.dataEnrichment);
    if (existing?.status === EnrichmentStatus.InProgress) {
      this.logger.warn(`Logo refetch: enrichment already in progress for team ${teamUid}, skipping`);
      return { status: 'in_progress' };
    }

    const existingFieldsMeta = (existing?.fieldsMeta ?? {}) as FieldsMetaMap;
    if (existingFieldsMeta.logo?.status === FieldEnrichmentStatus.ChangedByUser) {
      this.logger.log(`Logo refetch: team ${teamUid} logo is user-owned (ChangedByUser), skipping`);
      return { status: 'skipped_user_owned' };
    }

    const hasWebsite = !!team.website && team.website.trim() !== '';
    const hasLinkedin = !!team.linkedinHandler && team.linkedinHandler.trim() !== '';
    if (!hasWebsite && !hasLinkedin) {
      this.logger.log(`Logo refetch: team ${teamUid} has no website or linkedinHandler, skipping`);
      return { status: 'no_source' };
    }

    const priorStatus = existing?.status ?? null;
    await this.updateEnrichmentStatus(teamUid, existing, EnrichmentStatus.InProgress);

    this.logger.log(`Logo refetch queued for team ${teamUid}`);

    this.doRefetchLogo(teamUid, enrichedBy, priorStatus).catch((err) => {
      this.logger.error(`Background logo refetch failed for team ${teamUid}: ${err.message}`, err.stack);
    });

    return { status: 'started' };
  }

  async forceRefetchLogoForAllTeams(enrichedBy = 'manually'): Promise<{
    total: number;
    started: number;
    skippedInProgress: number;
    skippedUserOwned: number;
    noSource: number;
    notFound: number;
  }> {
    const teams = await this.prisma.team.findMany({
      where: {
        AND: [
          buildTeamEnrichmentEligibilityFilter(),
          {
            OR: [
              { AND: [{ website: { not: null } }, { website: { not: '' } }] },
              { AND: [{ linkedinHandler: { not: null } }, { linkedinHandler: { not: '' } }] },
            ],
          },
        ],
      },
      select: { uid: true },
    });

    this.logger.log(`Force logo refetch all: found ${teams.length} eligible teams with website or linkedinHandler`);

    const counters = { started: 0, skippedInProgress: 0, skippedUserOwned: 0, noSource: 0, notFound: 0 };

    for (const team of teams) {
      const { status } = await this.forceRefetchLogo(team.uid, enrichedBy);
      switch (status) {
        case 'started':
          counters.started++;
          break;
        case 'in_progress':
          counters.skippedInProgress++;
          break;
        case 'skipped_user_owned':
          counters.skippedUserOwned++;
          break;
        case 'no_source':
          counters.noSource++;
          break;
        case 'not_found':
          counters.notFound++;
          break;
      }
    }

    return { total: teams.length, ...counters };
  }

  /**
   * Refetch the logo for a single team using ScrapingDog (high confidence)
   * with OG/website as a fallback. Writes the enriched logo to TeamEnrichment.logoUid;
   * Team.logoUid is only updated by the judge when confidence is high.
   */
  private async doRefetchLogo(
    teamUid: string,
    enrichedBy: string,
    priorStatus: EnrichmentStatus | null
  ): Promise<void> {
    const team = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: {
        uid: true,
        name: true,
        website: true,
        linkedinHandler: true,
        logoUid: true,
        teamEnrichment: { select: { dataEnrichment: true, logoUid: true } },
      },
    });

    if (!team) {
      this.logger.warn(`Logo refetch: team ${teamUid} not found`);
      return;
    }

    try {
      const existingMeta = this.parseEnrichmentMeta(team.teamEnrichment?.dataEnrichment);
      const existingFieldsMeta = (existingMeta?.fieldsMeta ?? {}) as FieldsMetaMap;

      const enrichmentUpdate: Prisma.TeamEnrichmentUpdateInput = {};
      let newLogoMeta: FieldEnrichmentMeta | null = null;
      let sourceUsed: EnrichmentSource | null = null;
      let scrapingDogInternalId: string | null | undefined;

      if (this.scrapingDogService.isConfigured() && team.linkedinHandler) {
        const linkedinIsUserOwned = isFieldUserOwned(existingFieldsMeta, 'linkedinHandler', team.linkedinHandler);
        this.logger.log(
          `Logo refetch: trying ScrapingDog for team ${teamUid} (${team.name}) handle "${team.linkedinHandler}"${
            linkedinIsUserOwned ? ' (user-owned handle, entity check bypassed)' : ''
          }`
        );
        const result = await this.scrapingDogService.fetchCompanyProfile(team.linkedinHandler);
        const profile = result.kind === 'ok' ? result.profile : null;
        if (profile) {
          const entityOk = linkedinIsUserOwned || this.verifyScrapingDogEntity(team.name, profile);
          if (entityOk && profile.profilePhoto) {
            try {
              const persisted = await this.persistLogoImage(teamUid, profile.profilePhoto, 'scrapingdog');
              if (persisted) {
                enrichmentUpdate.logo = { connect: { uid: persisted.imageUid } };
                newLogoMeta = {
                  status: FieldEnrichmentStatus.Enriched,
                  confidence: FieldConfidence.High,
                  source: EnrichmentSource.ScrapingDog,
                };
                sourceUsed = EnrichmentSource.ScrapingDog;
                scrapingDogInternalId = profile.linkedinInternalId;
                this.logger.log(
                  `Logo refetch: ScrapingDog logo set for team ${teamUid} (${team.name}), image uid: ${persisted.imageUid}`
                );
              }
            } catch (error) {
              this.logger.warn(
                `Logo refetch: ScrapingDog logo download/upload failed for team ${teamUid} (${team.name}): ${error.message}`
              );
            }
          } else if (!entityOk) {
            this.logger.warn(
              `Logo refetch: ScrapingDog entity mismatch for team ${teamUid} (${team.name}), falling back to OG`
            );
          }
        }
      }

      if (!newLogoMeta && team.website && team.website.trim() !== '') {
        this.logger.log(`Logo refetch: trying website/OG for team ${teamUid} (${team.name}) at ${team.website}`);
        const logoResult = await this.aiService.fetchLogoFromWebsite(team.name, team.website);
        if (logoResult) {
          try {
            const persisted = await this.persistLogoImage(teamUid, logoResult.logoUrl);
            if (persisted) {
              enrichmentUpdate.logo = { connect: { uid: persisted.imageUid } };
              newLogoMeta = {
                status: FieldEnrichmentStatus.Enriched,
                confidence: FieldConfidence.Medium,
                source: EnrichmentSource.OpenGraph,
              };
              sourceUsed = EnrichmentSource.OpenGraph;
              this.logger.log(
                `Logo refetch: OG logo set for team ${teamUid} (${team.name}), image uid: ${persisted.imageUid}`
              );
            }
          } catch (error) {
            this.logger.warn(
              `Logo refetch: OG logo download/upload failed for team ${teamUid} (${team.name}): ${error.message}`
            );
          }
        } else {
          this.logger.log(`Logo refetch: no OG logo found for team ${teamUid} (${team.name})`);
        }
      }

      if (!newLogoMeta) {
        newLogoMeta = { status: FieldEnrichmentStatus.CannotEnrich };
        this.logger.log(`Logo refetch: no new logo found for team ${teamUid} (${team.name}); preserving existing logo`);
      }

      const restoredStatus =
        priorStatus && priorStatus !== EnrichmentStatus.InProgress ? priorStatus : EnrichmentStatus.Enriched;

      const now = new Date().toISOString();
      const mergedFieldsMeta: FieldsMetaMap = {
        ...existingFieldsMeta,
        logo: stampModified(
          {
            ...(existingFieldsMeta.logo ?? {}),
            ...newLogoMeta,
          } as FieldEnrichmentMeta,
          now
        ),
      };

      const enrichment: TeamDataEnrichment = {
        ...(existingMeta ?? { isAIGenerated: false, fieldsMeta: {} }),
        shouldEnrich: false,
        status: restoredStatus,
        isAIGenerated: existingMeta?.isAIGenerated ?? sourceUsed !== null,
        fieldsMeta: mergedFieldsMeta,
      };

      if (sourceUsed === EnrichmentSource.ScrapingDog) {
        enrichment.scrapingDog = {
          used: true,
          fetchedAt: new Date().toISOString(),
          fields: ['logo'],
          linkedinInternalId: scrapingDogInternalId ?? existingMeta?.scrapingDog?.linkedinInternalId ?? null,
        };
      }

      enrichment.enrichedBy = existingMeta?.enrichedBy ?? enrichedBy;
      enrichment.enrichedAt = existingMeta?.enrichedAt;

      enrichmentUpdate.dataEnrichment = enrichment as any;

      await this.prisma.teamEnrichment.upsert({
        where: { teamUid },
        create: {
          team: { connect: { uid: teamUid } },
          ...this.updateInputToCreate(enrichmentUpdate),
        },
        update: enrichmentUpdate,
      });

      this.logger.log(`Logo refetch completed for team ${teamUid} (${team.name}): source=${sourceUsed ?? 'none'}`);
    } catch (error) {
      this.logger.error(`Logo refetch failed for team ${teamUid} (${team.name}): ${error.message}`, error.stack);
      const meta = this.parseEnrichmentMeta(team.teamEnrichment?.dataEnrichment);
      await this.updateEnrichmentStatus(teamUid, meta, EnrichmentStatus.FailedToEnrich, error.message);
    }
  }

  /**
   * Downloads a logo image URL, uploads it to S3, and creates an Image row.
   * Returns null if S3 upload did not return a URL; throws on download or DB errors
   * so callers can decide how to record the failure.
   */
  private async persistLogoImage(
    teamUid: string,
    imageUrl: string,
    filenameSuffix?: string
  ): Promise<{ imageUid: string; s3Url: string } | null> {
    const suffix = filenameSuffix ? `-${filenameSuffix}` : '';
    const filename = `team-enrichment-${teamUid}${suffix}-${Date.now()}.png`;
    const multerFile = await this.aiService.downloadImageAsMulterFile(imageUrl, filename);
    const s3Url = await this.fileUploadService.storeImageFiles([multerFile]);
    if (!s3Url) return null;
    const image = await this.prisma.image.create({
      data: {
        cid: s3Url,
        url: s3Url,
        filename,
        size: multerFile.size,
        type: multerFile.mimetype.split('/')[1] || 'png',
        width: 0,
        height: 0,
        version: 'ORIGINAL',
      },
    });
    return { imageUid: image.uid, s3Url };
  }

  private async doEnrichTeam(
    teamUid: string,
    enrichedBy: string,
    opts: { forceOverwrite?: boolean } = {}
  ): Promise<void> {
    const forceOverwrite = opts.forceOverwrite === true;
    const team = (await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: TEAM_WITH_ENRICHMENT_SELECT,
    })) as TeamWithEnrichment | null;

    if (!team) {
      this.logger.warn(`Team ${teamUid} not found`);
      return;
    }

    const existingMeta = this.parseEnrichmentMeta(team.teamEnrichment?.dataEnrichment);
    await this.updateEnrichmentStatus(teamUid, existingMeta, EnrichmentStatus.InProgress);

    try {
      const existingFieldsMeta = (existingMeta?.fieldsMeta ?? {}) as FieldsMetaMap;

      // Pass user-confirmed shortDescription/longDescription/moreDetails to the AI as
      // high-trust identity hints — disambiguates ambiguous team names so the AI searches for
      // the entity described by the hint, not the bare name.
      const userConfirmedIdentityHints = {
        shortDescription: isFieldUserOwned(existingFieldsMeta, 'shortDescription', team.shortDescription)
          ? team.shortDescription
          : null,
        longDescription: isFieldUserOwned(existingFieldsMeta, 'longDescription', team.longDescription)
          ? team.longDescription
          : null,
        moreDetails: isFieldUserOwned(existingFieldsMeta, 'moreDetails', team.moreDetails) ? team.moreDetails : null,
      };

      const aiResult = await this.aiService.enrichTeamViaAI(team.name, {
        website: team.website,
        contactMethod: team.contactMethod,
        linkedinHandler: team.linkedinHandler,
        twitterHandler: team.twitterHandler,
        telegramHandler: team.telegramHandler,
        shortDescription: team.shortDescription,
        longDescription: team.longDescription,
        userConfirmedIdentityHints,
      });
      const aiResponse = aiResult.response;
      const enrichmentUsage = aiResult.usage;

      // Verify entity identity to decide which fields are safe to enrich. Same gating as before:
      // descriptions / socials / tags are enriched regardless; website + logo require verified
      // entity when the team had no website to anchor on.
      const hadNoWebsite = !team.website || team.website.trim() === '';
      const isEntityVerified = hadNoWebsite ? this.verifyEntityIdentity(team.name, aiResponse) : true;
      if (!isEntityVerified) {
        this.logger.warn(
          `Team ${teamUid} (${team.name}): entity identity not verified — will skip website and logo, but still enrich other fields`
        );
        aiResponse.website = null;
        aiResponse.websiteCandidates = [];
      }

      // Website-signal extraction: parse the team's website for self-declared socials.
      const websiteToScan = team.website?.trim() || aiResponse.website?.trim() || null;
      const websiteIsUserOwned = !!team.website && isFieldUserOwned(existingFieldsMeta, 'website', team.website);
      const websiteBackfilledFields = new Set<EnrichableTeamField>();
      const websiteHtml = websiteToScan ? await this.aiService.fetchWebsiteHtml(websiteToScan) : null;

      // Captured for persistence to dataEnrichment.websiteSignals — Stage 1.5 corroboration
      // (in the judge pipeline) reads this as a second independent source.
      let extractedWebsiteSignals: TeamDataEnrichment['websiteSignals'] | undefined;

      if (websiteToScan) {
        const signals = await this.aiService.fetchSocialSignalsFromWebsite(websiteToScan, websiteHtml ?? undefined);
        if (signals) {
          aiResponse.confidence ||= {};
          const backfillMap: Array<[EnrichableTeamField, string | undefined]> = [
            ['twitterHandler', signals.twitterHandler],
            ['linkedinHandler', signals.linkedinHandler],
            ['telegramHandler', signals.telegramHandler],
            ['contactMethod', signals.contactEmail],
          ];
          for (const [field, value] of backfillMap) {
            if (!value) continue;
            if (aiResponse[field]) continue;
            aiResponse[field] = value;
            aiResponse.confidence[field] = websiteIsUserOwned ? 'high' : 'medium';
            websiteBackfilledFields.add(field);
          }
          if (websiteBackfilledFields.size > 0) {
            this.logger.log(
              `Team ${teamUid} (${team.name}): website signal backfill from ${websiteToScan} → [${[
                ...websiteBackfilledFields,
              ].join(', ')}]${websiteIsUserOwned ? ' (website user-owned)' : ''}${
                signals.jsonLdOrgName ? ` jsonLdOrg="${signals.jsonLdOrgName}"` : ''
              }`
            );
          }

          let host: string | null = null;
          try {
            host = new URL(websiteToScan).host.replace(/^www\./, '').toLowerCase();
          } catch {
            host = null;
          }
          extractedWebsiteSignals = {
            extractedAt: new Date().toISOString(),
            host,
            ...(signals.twitterHandler ? { twitterHandler: signals.twitterHandler } : {}),
            ...(signals.linkedinHandler ? { linkedinHandler: signals.linkedinHandler } : {}),
            ...(signals.telegramHandler ? { telegramHandler: signals.telegramHandler } : {}),
            ...(signals.contactEmail ? { contactEmail: signals.contactEmail } : {}),
            ...(signals.jsonLdOrgName ? { jsonLdOrgName: signals.jsonLdOrgName } : {}),
            ...(signals.ogSiteName ? { ogSiteName: signals.ogSiteName } : {}),
            ...(signals.metaDescription ? { metaDescription: signals.metaDescription } : {}),
          };
        }
      }

      // Lead-backfill: before deciding per-field outcomes, fill any aiResponse
      // nulls from team-lead Member rows whose value structurally matches the
      // team's identity (`info@<website-host>`, `@<team-name-prefixed>` etc.).
      // Same backfill pattern as the website-signal pass above. Lead-derived
      // values get their source re-stamped to `team-lead` after the field
      // loop (mirroring how website backfill re-stamps to `open-graph`).
      const leadBackfilledFields = new Set<EnrichableTeamField>();
      const leadBackfill = deriveTeamFieldsFromLeads(
        team.name,
        team.website ?? aiResponse.website ?? null,
        (team.teamMemberRoles ?? []).map((r) => r.member)
      );
      const leadBackfillMap: Array<[EnrichableTeamField, string | undefined]> = [
        ['contactMethod', leadBackfill.contactMethod],
        ['twitterHandler', leadBackfill.twitterHandler],
        ['telegramHandler', leadBackfill.telegramHandler],
      ];
      for (const [field, value] of leadBackfillMap) {
        if (!value) continue;
        if (aiResponse[field]) continue; // AI already filled it — don't override
        aiResponse[field] = value;
        aiResponse.confidence ||= {};
        aiResponse.confidence[field] = 'high';
        leadBackfilledFields.add(field);
      }
      if (leadBackfilledFields.size > 0) {
        this.logger.log(
          `Team ${teamUid} (${team.name}): team-lead backfill → [${[...leadBackfilledFields].join(', ')}]`
        );
      }

      // Determine which fields need enrichment. Writes go to TeamEnrichment, not Team —
      // the judge later promotes high-confidence values to Team.
      const enrichmentUpdate: Prisma.TeamEnrichmentUpdateInput = {};
      const newFieldsMeta: FieldsMetaMap = {};
      let fieldsUpdatedCount = 0;
      const skipReasons: Record<string, string[]> = {
        userEdited: [],
        userOwned: [],
        alreadyEnriched: [],
        alreadyPromoted: [],
        aiReturnedNull: [],
        aiCannotEnrich: [],
        userJunkOverridden: [],
        aiNarrationRejected: [],
      };

      for (const field of ENRICHABLE_TEAM_FIELDS) {
        const fieldStatus = existingFieldsMeta[field]?.status;

        // Junk-aware empty check. A `Team` value of "Coming soon!", "n/a",
        // "email" (as contactMethod), "TBD" — anything that fails the per-field
        // shape validator — is treated as effectively empty. The ChangedByUser
        // short-circuit AND the user-owned guard below both honor this, so the
        // field falls through to AI enrichment and the AI's new value is
        // written with status `Enriched` (overriding the prior junk
        // ChangedByUser status). Lets the judge then promote it normally,
        // which overwrites the junk Team.<field> value.
        const teamValue = team[field];
        const teamValueHasContent = !!teamValue && teamValue.trim() !== '';
        const teamValueIsJunk = teamValueHasContent && !isLikelyValueForField(field, teamValue as string);
        const teamSlotIsEmpty = !teamValueHasContent || teamValueIsJunk;

        if (teamValueIsJunk) {
          skipReasons.userJunkOverridden.push(field);
        }

        // ChangedByUser short-circuit: skip ONLY when the user value is real.
        // Junk ChangedByUser values fall through to enrichment and get
        // overwritten by the AI candidate when the judge agrees at high.
        if (fieldStatus === FieldEnrichmentStatus.ChangedByUser && !teamValueIsJunk) {
          skipReasons.userEdited.push(field);
          continue;
        }

        if (!teamSlotIsEmpty && fieldStatus !== FieldEnrichmentStatus.Enriched) {
          newFieldsMeta[field] = {
            ...existingFieldsMeta[field],
            status: FieldEnrichmentStatus.ChangedByUser,
          };
          skipReasons.userOwned.push(field);
          continue;
        }

        // Previously-promoted guard: when `Team.<field>` is non-empty AND
        // shape-valid AND `fieldsMeta.status === Enriched`, the value got
        // onto Team via the only path that lets AI values cross that
        // boundary — the judge's promotion at `agrees + high`. So the
        // field is already judge-verified at high confidence. Re-querying
        // it (even in force mode) only risks producing a worse candidate
        // on `TeamEnrichment.<field>` that drags the team back into the
        // review queue for a question we already answered. ChangedByUser
        // is handled above; this guard is the symmetric "judge-promoted
        // is also settled" case. Bench symptom: Akave's
        // `Team.blog = "https://akave.ai/blog"` (promoted at agrees+high
        // in an earlier run) got replaced on TE by an unreachable
        // `blog.akave.cloud` from a later `mode=all` re-query, and the
        // judge marked the new candidate `uncertain + medium` → team back
        // in review. Admins who actually want to refresh a stale promoted
        // value should edit `Team.<field>` directly (which flips status
        // to ChangedByUser and lets enrichment re-evaluate naturally).
        if (
          fieldStatus === FieldEnrichmentStatus.Enriched &&
          !teamSlotIsEmpty
        ) {
          skipReasons.alreadyPromoted.push(field);
          continue;
        }

        if (!forceOverwrite && fieldStatus === FieldEnrichmentStatus.Enriched) {
          skipReasons.alreadyEnriched.push(field);
          continue;
        }

        let newValue = aiResponse[field];
        // Reject search-failure narration the model sometimes emits for free-text
        // fields instead of returning null (e.g. `No specific fund named "X" was
        // found …`). Treat it as "AI returned nothing" so the field falls through
        // to CannotEnrich / stays empty rather than storing the meta-text as a
        // description. Same gate the judge/review path uses via isLikelyValueForField.
        if (typeof newValue === 'string' && looksLikeAiNonAnswer(newValue)) {
          skipReasons.aiNarrationRejected.push(field);
          newValue = null;
        }
        if (newValue) {
          (enrichmentUpdate as any)[field] = newValue;
          newFieldsMeta[field] = {
            status: FieldEnrichmentStatus.Enriched,
            confidence: toConfidence(aiResponse.confidence?.[field]),
            source: EnrichmentSource.AI,
          };
          fieldsUpdatedCount++;
        } else if (teamSlotIsEmpty) {
          newFieldsMeta[field] = { status: FieldEnrichmentStatus.CannotEnrich };
          skipReasons.aiCannotEnrich.push(field);
        } else {
          skipReasons.aiReturnedNull.push(field);
        }
      }

      const skipSummary = Object.entries(skipReasons)
        .filter(([, fields]) => fields.length > 0)
        .map(([reason, fields]) => `${reason}=[${fields.join(',')}]`)
        .join(' ');
      this.logger.log(
        `Team ${teamUid} (${team.name}) scalar field outcome: written=${fieldsUpdatedCount}${
          skipSummary ? ' ' + skipSummary : ''
        }`
      );

      for (const field of websiteBackfilledFields) {
        const meta = newFieldsMeta[field];
        if (meta?.status === FieldEnrichmentStatus.Enriched && meta.source === EnrichmentSource.AI) {
          newFieldsMeta[field] = { ...meta, source: EnrichmentSource.OpenGraph };
        }
      }

      // Lead-backfill re-stamp: any field the lead-backfill filled (and the
      // AI didn't override) should be sourced as `team-lead` so the judge's
      // source-trust rule (Stage 1.5) auto-promotes it.
      for (const field of leadBackfilledFields) {
        const meta = newFieldsMeta[field];
        if (meta?.status === FieldEnrichmentStatus.Enriched && meta.source === EnrichmentSource.AI) {
          newFieldsMeta[field] = { ...meta, source: EnrichmentSource.TeamLead };
        }
      }

      // industryTags — same four-layer check as scalars. User-ownership reads Team (what's
      // approved); the enriched titles go onto TeamEnrichment.industryTags (String[]).
      // We still resolve the titles against IndustryTag here to keep the persisted list to
      // recognized tags only — the judge re-resolves at promotion-time to set the M2M on Team.
      const tagsStatus = existingFieldsMeta.industryTags?.status;
      const teamHasIndustryTags = team.industryTags.length > 0;

      if (tagsStatus === FieldEnrichmentStatus.ChangedByUser) {
        // user-controlled — skip
      } else if (teamHasIndustryTags && tagsStatus !== FieldEnrichmentStatus.Enriched) {
        newFieldsMeta.industryTags = {
          ...existingFieldsMeta.industryTags,
          status: FieldEnrichmentStatus.ChangedByUser,
        };
      } else if (!forceOverwrite && tagsStatus === FieldEnrichmentStatus.Enriched) {
        // standard mode, already enriched — skip
      } else {
        this.logger.debug(`Team ${teamUid}: AI returned industryTags = [${aiResponse.industryTags.join(', ')}]`);
        if (aiResponse.industryTags.length > 0) {
          const matchedTags = await this.prisma.industryTag.findMany({
            where: { title: { in: aiResponse.industryTags, mode: 'insensitive' } },
            select: { uid: true, title: true },
          });
          this.logger.debug(
            `Team ${teamUid}: matched ${matchedTags.length}/${
              aiResponse.industryTags.length
            } industryTags: [${matchedTags.map((t) => t.title).join(', ')}]`
          );
          if (matchedTags.length > 0) {
            enrichmentUpdate.industryTags = matchedTags.map((t) => t.title);
            newFieldsMeta.industryTags = {
              status: FieldEnrichmentStatus.Enriched,
              confidence: toConfidence(aiResponse.confidence?.industryTags),
              source: EnrichmentSource.AI,
            };
            fieldsUpdatedCount++;
          } else if (!teamHasIndustryTags) {
            newFieldsMeta.industryTags = { status: FieldEnrichmentStatus.CannotEnrich };
          }
        } else if (!teamHasIndustryTags) {
          newFieldsMeta.industryTags = { status: FieldEnrichmentStatus.CannotEnrich };
        }
      }

      // investmentFocus — stored as String[] on TeamEnrichment. The judge promotes high-confidence
      // values onto InvestorProfile.investmentFocus.
      const currentFocus = team.investorProfile?.investmentFocus || [];
      const focusStatus = existingFieldsMeta.investmentFocus?.status;
      const teamHasFocus = currentFocus.length > 0;

      if (focusStatus === FieldEnrichmentStatus.ChangedByUser) {
        // user-controlled — skip
      } else if (teamHasFocus && focusStatus !== FieldEnrichmentStatus.Enriched) {
        newFieldsMeta.investmentFocus = {
          ...existingFieldsMeta.investmentFocus,
          status: FieldEnrichmentStatus.ChangedByUser,
        };
      } else if (!forceOverwrite && focusStatus === FieldEnrichmentStatus.Enriched) {
        // standard mode, already enriched — skip
      } else {
        this.logger.debug(`Team ${teamUid}: AI returned investmentFocus = [${aiResponse.investmentFocus.join(', ')}]`);
        if (aiResponse.investmentFocus.length > 0) {
          enrichmentUpdate.investmentFocus = aiResponse.investmentFocus;
          newFieldsMeta.investmentFocus = {
            status: FieldEnrichmentStatus.Enriched,
            confidence: toConfidence(aiResponse.confidence?.investmentFocus),
            source: EnrichmentSource.AI,
          };
          fieldsUpdatedCount++;
        } else if (!teamHasFocus) {
          newFieldsMeta.investmentFocus = { status: FieldEnrichmentStatus.CannotEnrich };
        }
      }

      // Logo via OG tag scraping — written to TeamEnrichment.logoUid, never directly to Team.
      const effectiveWebsite = team.website || aiResponse.website || null;
      const logoIsUserOwned =
        existingFieldsMeta.logo?.status === FieldEnrichmentStatus.ChangedByUser ||
        (!!team.logoUid && !existingFieldsMeta.logo);
      const shouldRefetchLogo = !logoIsUserOwned && (!team.logoUid || forceOverwrite);

      if (shouldRefetchLogo && effectiveWebsite) {
        this.logger.log(
          `Attempting logo fetch for team ${teamUid} (${team.name}) from website: ${effectiveWebsite}${
            team.logoUid ? ' (force overwrite)' : ''
          }`
        );
        const logoHtml = websiteToScan === effectiveWebsite ? websiteHtml ?? undefined : undefined;
        const logoResult = await this.aiService.fetchLogoFromWebsite(team.name, effectiveWebsite, logoHtml);

        if (logoResult) {
          this.logger.log(`Logo metadata found for team ${teamUid} (${team.name}): ${logoResult.logoUrl}`);
          try {
            const persisted = await this.persistLogoImage(teamUid, logoResult.logoUrl);
            if (persisted) {
              enrichmentUpdate.logo = { connect: { uid: persisted.imageUid } };
              newFieldsMeta.logo = {
                status: FieldEnrichmentStatus.Enriched,
                confidence: FieldConfidence.Medium,
                source: EnrichmentSource.OpenGraph,
              };
              this.logger.log(
                `Logo uploaded successfully for team ${teamUid} (${team.name}), image uid: ${persisted.imageUid}`
              );
            } else {
              this.logger.warn(`Logo upload returned no URL for team ${teamUid} (${team.name})`);
              newFieldsMeta.logo = { status: FieldEnrichmentStatus.CannotEnrich };
            }
          } catch (logoError) {
            this.logger.warn(`Failed to download/upload logo for team ${teamUid} (${team.name}): ${logoError.message}`);
            newFieldsMeta.logo = { status: FieldEnrichmentStatus.CannotEnrich };
          }
        } else {
          this.logger.log(`No logo found in website metadata for team ${teamUid} (${team.name})`);
          newFieldsMeta.logo = { status: FieldEnrichmentStatus.CannotEnrich };
        }
      } else if (logoIsUserOwned) {
        this.logger.log(`Team ${teamUid} (${team.name}) logo is user-owned, skipping logo fetch`);
        if (!existingFieldsMeta.logo) {
          // Pre-existing user logo discovered — set status=ChangedByUser only. The merge step
          // skips stamping for ChangedByUser writes (the user's upload happened earlier, we
          // honestly don't know when).
          newFieldsMeta.logo = { status: FieldEnrichmentStatus.ChangedByUser };
        }
      } else if (team.logoUid) {
        this.logger.log(`Team ${teamUid} (${team.name}) already has a logo, skipping logo fetch`);
      } else {
        this.logger.log(`Team ${teamUid} (${team.name}): no verified website available, skipping logo fetch`);
        newFieldsMeta.logo = { status: FieldEnrichmentStatus.CannotEnrich };
      }

      // ScrapingDog fallback — writes its enriched fields to TeamEnrichment via the same
      // enrichmentUpdate object.
      const scrapingDogMeta = await this.maybeEnrichViaScrapingDog({
        teamUid,
        team,
        existingFieldsMeta,
        aiLinkedinHandler: aiResponse.linkedinHandler,
        enrichmentUpdate,
        newFieldsMeta,
        forceOverwrite,
      });

      // ScrapingDog X verification — runs independently of the LinkedIn fallback.
      // Verifies a candidate twitterHandler (from AI, website-signal backfill,
      // lead-backfill, or an orphan value carried over from a prior enrichment
      // run) against the X profile's website / display name. When verified,
      // promotes the handle's `source` to `scrapingdog + high` so the judge's
      // Stage 1.5 source-trust rule auto-promotes it without an AI call.
      await this.maybeVerifyTwitterHandleViaScrapingDog({
        teamUid,
        team,
        existingFieldsMeta,
        enrichmentUpdate,
        newFieldsMeta,
      });

      const now = new Date().toISOString();
      const mergedFieldsMeta: FieldsMetaMap = { ...existingFieldsMeta };
      for (const [field, fresh] of Object.entries(newFieldsMeta) as Array<
        [FieldMetaKey, FieldEnrichmentMeta | undefined]
      >) {
        if (!fresh) continue;
        const prior = mergedFieldsMeta[field];
        const freshDefined = Object.fromEntries(
          Object.entries(fresh).filter(([, v]) => v !== undefined)
        ) as Partial<FieldEnrichmentMeta>;
        let merged: FieldEnrichmentMeta = {
          ...(prior ?? {}),
          ...freshDefined,
        } as FieldEnrichmentMeta;
        // Drop any stale `judgment` block on every fresh enrichment write.
        // The judgment is owned by the judge stage — it is rendered against
        // a specific (status, value) tuple, so any time enrichment rewrites
        // the field's meta the prior verdict no longer applies. Without
        // this, a value that flipped from `Enriched` → `CannotEnrich`
        // (AI lost its previous answer) or was re-enriched with a different
        // candidate keeps surfacing the team in admin review because the
        // legacy verdict (likely `uncertain` / `medium`) is still attached.
        // The next judge run will write a fresh verdict if warranted.
        if (fresh.status) {
          delete (merged as any).judgment;
        }
        // Stamp `lastModifiedAt` only when the value actually changed this run.
        if (merged.status !== FieldEnrichmentStatus.ChangedByUser) {
          merged = stampModified(merged, now);
        }
        mergedFieldsMeta[field] = merged;
      }

      const mergedEnrichmentUsage = mergeUsageEntries(existingMeta?.usage?.enrichment, enrichmentUsage);
      const usageBlock: TeamDataEnrichment['usage'] | undefined =
        mergedEnrichmentUsage || existingMeta?.usage?.judge
          ? {
              ...(mergedEnrichmentUsage ? { enrichment: mergedEnrichmentUsage } : {}),
              ...(existingMeta?.usage?.judge ? { judge: existingMeta.usage.judge } : {}),
            }
          : undefined;

      // Carry forward prior websiteSignals when the current run didn't extract any
      // (e.g. website fetch failed transiently). This keeps a recent second-source
      // available for the judge even if a single enrichment retry whiffs on the fetch.
      const websiteSignalsToPersist = extractedWebsiteSignals ?? existingMeta?.websiteSignals;

      const enrichment: TeamDataEnrichment = {
        shouldEnrich: false,
        status: EnrichmentStatus.Enriched,
        isAIGenerated: Object.values(mergedFieldsMeta).some((m) => m.status === FieldEnrichmentStatus.Enriched),
        enrichedAt: new Date().toISOString(),
        enrichedBy,
        aiModel: this.aiService.getModelName(),
        fieldsMeta: mergedFieldsMeta,
        ...(scrapingDogMeta ? { scrapingDog: scrapingDogMeta } : {}),
        ...(websiteSignalsToPersist ? { websiteSignals: websiteSignalsToPersist } : {}),
        ...(usageBlock ? { usage: usageBlock } : {}),
      };

      enrichmentUpdate.dataEnrichment = enrichment as any;

      await this.prisma.teamEnrichment.upsert({
        where: { teamUid },
        create: {
          team: { connect: { uid: teamUid } },
          ...this.updateInputToCreate(enrichmentUpdate),
        },
        update: enrichmentUpdate,
      });

      this.logger.log(`Enriched team ${teamUid} (${team.name}): ${fieldsUpdatedCount} new fields updated`);
      if (mergedEnrichmentUsage) {
        this.logger.log(
          `Enrichment usage rollup team=${teamUid} name="${team.name}" stage=enrichment ${formatUsageLog(
            mergedEnrichmentUsage
          )}`
        );
      }
    } catch (error) {
      this.logger.error(`Failed to enrich team ${teamUid} (${team.name}): ${error.message}`, error.stack);
      await this.updateEnrichmentStatus(teamUid, existingMeta, EnrichmentStatus.FailedToEnrich, error.message);
    }
  }

  async triggerEnrichmentForAllPending(
    enrichedBy = 'system-cron'
  ): Promise<{ total: number; started: number; skipped: number }> {
    const teams = await this.findTeamsPendingEnrichment();
    this.logger.log(`Trigger all: found ${teams.length} teams pending enrichment`);

    let started = 0;
    let skipped = 0;

    for (const team of teams) {
      const { status } = await this.enrichTeam(team.uid, enrichedBy);
      if (status === 'started') started++;
      else skipped++;
    }

    return { total: teams.length, started, skipped };
  }

  /**
   * Called from any team-update flow (participants-request, profile-update, demo-day
   * fundraising profile) when a user edits enrichable team fields. The fieldsMeta lives
   * on TeamEnrichment.dataEnrichment, so we read/write the TeamEnrichment row here —
   * never Team.
   *
   * Supported fields: every key in `FieldMetaKey` — scalars (website, blog, contactMethod,
   * social handles, descriptions, moreDetails), relational arrays (`industryTags`,
   * `investmentFocus`), and `logo`. Each is flipped to `ChangedByUser` when:
   *   - the prior status was `Enriched` (regardless of the new value), OR
   *   - the prior status was `CannotEnrich` AND the user supplied a non-empty value.
   *
   * "Non-empty" depends on the field's value shape: trimmed string for scalars / logo,
   * `length > 0` for arrays. Anything else (numbers, null, undefined) is treated as empty.
   */
  async handleUserFieldChange(
    teamUid: string,
    changedFieldValues: Record<string, unknown>,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const db = tx || this.prisma;

    const row = await db.teamEnrichment.findUnique({
      where: { teamUid },
      select: { dataEnrichment: true },
    });

    const meta = this.parseEnrichmentMeta(row?.dataEnrichment);
    if (!meta || !meta.isAIGenerated) return;
    if (!meta.fieldsMeta) meta.fieldsMeta = {};

    const trackedFields = new Set<FieldMetaKey>([...ENRICHABLE_TEAM_FIELDS, 'industryTags', 'investmentFocus', 'logo']);

    const isNonEmpty = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'string') return value.trim() !== '';
      return false;
    };

    const now = new Date().toISOString();
    const flipped: string[] = [];
    for (const [field, newValue] of Object.entries(changedFieldValues)) {
      if (!trackedFields.has(field as FieldMetaKey)) continue;
      const key = field as FieldMetaKey;
      const currentStatus = meta.fieldsMeta[key]?.status;

      if (currentStatus === FieldEnrichmentStatus.Enriched) {
        meta.fieldsMeta[key] = stampModified(
          {
            ...meta.fieldsMeta[key],
            status: FieldEnrichmentStatus.ChangedByUser,
          },
          now
        );
        flipped.push(field);
        continue;
      }

      if (currentStatus === FieldEnrichmentStatus.CannotEnrich && isNonEmpty(newValue)) {
        meta.fieldsMeta[key] = stampModified(
          {
            ...meta.fieldsMeta[key],
            status: FieldEnrichmentStatus.ChangedByUser,
          },
          now
        );
        flipped.push(field);
      }
    }

    if (flipped.length > 0) {
      await db.teamEnrichment.update({
        where: { teamUid },
        data: { dataEnrichment: meta as any },
      });
      this.logger.log(`Marked fields as ChangedByUser for team ${teamUid}: ${flipped.join(', ')}`);
    }
  }

  async reviewEnrichment(teamUid: string, action: 'Reviewed' | 'Approved', reviewerEmail: string): Promise<void> {
    const meta = await this.readEnrichmentMeta(teamUid);
    if (!meta) {
      this.logger.warn(`No enrichment data found for team ${teamUid}`);
      return;
    }

    meta.status = action === 'Approved' ? EnrichmentStatus.Approved : EnrichmentStatus.Reviewed;
    meta.reviewedAt = new Date().toISOString();
    meta.reviewedBy = reviewerEmail;

    await this.prisma.teamEnrichment.update({
      where: { teamUid },
      data: { dataEnrichment: meta as any },
    });

    this.logger.log(`Enrichment for team ${teamUid} marked as ${action} by ${reviewerEmail}`);
  }

  /**
   * Full list of teams that still have at least one thing needing admin review.
   *
   * Inclusion criteria — a team is included if EITHER of the following holds:
   *  - at least one non-logo `fieldsMeta[k].judgment` is NOT (`verdict='agrees'` AND
   *    `confidence='high'`). That pair is the exact criterion the judge uses to auto-promote
   *    a field to `Team`, and admin approval normalizes to the same pair — so anything else
   *    (disagrees, uncertain, or medium/low confidence) is still pending review.
   *  - the team has a logo (`row.logoUid` set) whose latest `TeamLogoVerificationResult`
   *    is NOT at (`verdict === 'verified'` AND `confidence === 'high'`). Logo verification
   *    uses verdict+confidence directly (no score column), mirroring the field-level check.
   *
   * Statuses excluded at the query level: `PendingEnrichment`, `InProgress`, `FailedToEnrich`.
   * The remaining statuses (`Enriched`, `Reviewed`, `Approved`, and any future addition) all
   * surface here as long as the inclusion check above flags something.
   *
   * Per-field rules in the response:
   *  - fields without a `fieldsMeta[k].judgment` entry are skipped (not review-ready)
   *  - empty candidate values (null / empty string / empty array) are excluded
   *
   * Logos: emitted whenever `TeamEnrichment.logoUid` is set; the latest
   * `TeamLogoVerificationResult` (any confidence) populates `verification`.
   */
  async listEnrichmentsForReview(): Promise<{ teams: EnrichmentReviewItem[] }> {
    const rows = await this.prisma.teamEnrichment.findMany({
      where: {
        NOT: {
          OR: [
            { dataEnrichment: { path: ['status'], equals: EnrichmentStatus.PendingEnrichment } },
            { dataEnrichment: { path: ['status'], equals: EnrichmentStatus.InProgress } },
            { dataEnrichment: { path: ['status'], equals: EnrichmentStatus.FailedToEnrich } },
          ],
        },
      },
      select: {
        teamUid: true,
        team: {
          select: {
            uid: true,
            name: true,
            priority: true,
            logo: { select: { uid: true, url: true } },
            website: true,
            blog: true,
            contactMethod: true,
            twitterHandler: true,
            linkedinHandler: true,
            telegramHandler: true,
            shortDescription: true,
            longDescription: true,
          },
        },
        website: true,
        blog: true,
        contactMethod: true,
        twitterHandler: true,
        linkedinHandler: true,
        telegramHandler: true,
        shortDescription: true,
        longDescription: true,
        logoUid: true,
        logo: { select: { uid: true, url: true } },
        investmentFocus: true,
        industryTags: true,
        dataEnrichment: true,
      },
      orderBy: { team: { name: 'asc' } },
    });

    if (rows.length === 0) {
      return { teams: [] };
    }

    const teamUids = rows.map((r) => r.teamUid);
    const grouped = await this.prisma.teamLogoVerificationResult.groupBy({
      by: ['teamUid'],
      where: { teamUid: { in: teamUids } },
      _max: { createdAt: true },
    });
    const latestPairs = grouped
      .filter((g): g is typeof g & { _max: { createdAt: Date } } => g._max.createdAt !== null)
      .map((g) => ({ teamUid: g.teamUid, createdAt: g._max.createdAt }));
    const latestRows =
      latestPairs.length === 0
        ? []
        : await this.prisma.teamLogoVerificationResult.findMany({
            where: { OR: latestPairs.map((p) => ({ teamUid: p.teamUid, createdAt: p.createdAt })) },
            select: {
              teamUid: true,
              verdict: true,
              confidence: true,
              reason: true,
              createdAt: true,
            },
          });
    const latestByTeam = new Map<string, typeof latestRows[number]>();
    for (const lv of latestRows) latestByTeam.set(lv.teamUid, lv);

    const items: EnrichmentReviewItem[] = [];
    for (const row of rows) {
      const meta = this.parseEnrichmentMeta(row.dataEnrichment);
      if (!meta?.fieldsMeta) continue;

      // Fields the judge marked as suppressed (Stage 3 recovery exhaustion
      // OR website trust-transfer). The AI's per-field judgment is still on
      // `fieldsMeta[field].judgment` — we never overwrite it — but the
      // review endpoint treats these fields as if they had no judgment for
      // visibility purposes. See `dataEnrichment.judgment.reviewSuppressedFields`
      // doc in `team-enrichment.types.ts` for the full rule.
      const suppressed = new Set<FieldMetaKey>(meta.judgment?.reviewSuppressedFields ?? []);

      // A field is "auto-approved" iff the judge would have promoted it, i.e.
      // verdict=agrees AND confidence=high (admin approval also normalizes to this).
      // Score is intentionally NOT the gate — ScrapingDog/AI can emit score=90
      // at medium confidence (not promoted) or score=85 at high (promoted),
      // so score-thresholding produces both false negatives and false positives.
      // Logo has no judgment.score on its verification row — the equivalent check is
      // verdict='verified' AND confidence='high' (what admin-approve writes).
      const hasUnapprovedField = Object.entries(meta.fieldsMeta).some(([k, fm]) => {
        if (k === 'logo' || !fm?.judgment) return false;
        if (suppressed.has(k as FieldMetaKey)) return false;
        return !(fm.judgment.verdict === JudgmentVerdict.Agrees && fm.judgment.confidence === FieldConfidence.High);
      });
      // A team also needs review when a ChangedByUser field's *user value*
      // is junk-shaped (fails `isLikelyValueForField`) AND TeamEnrichment
      // has a shape-valid AI candidate to suggest. The judge might have
      // already marked the field `agrees + high` via the `user trusted`
      // fallback (because the user supplied it), but with junk + AI
      // alternative the admin should still confirm. Bench case: ANDÉN
      // with `Team.website = "Coming soon!"` and AI candidate
      // `https://andendigital.com/`.
      const hasJunkUserValueWithAiAlt = (Object.keys(meta.fieldsMeta) as FieldMetaKey[]).some((k) => {
        if (k === 'logo') return false;
        if (suppressed.has(k)) return false;
        const fm = meta.fieldsMeta[k];
        if (fm?.status !== FieldEnrichmentStatus.ChangedByUser) return false;
        const teamValue = (row.team as any)[k];
        const enrichmentValue = (row as any)[k];
        if (typeof teamValue !== 'string' || teamValue.trim() === '') return false;
        if (typeof enrichmentValue !== 'string' || enrichmentValue.trim() === '') return false;
        // Junk on the user side AND shape-valid on the AI side.
        return !isLikelyValueForField(k, teamValue) && isLikelyValueForField(k, enrichmentValue);
      });
      const latestLogoVerif = latestByTeam.get(row.teamUid);
      const logoFieldMeta = meta.fieldsMeta.logo;
      const logoApprovedByAdmin =
        logoFieldMeta?.judgment?.verdict === JudgmentVerdict.Agrees &&
        logoFieldMeta?.judgment?.confidence === FieldConfidence.High;
      const logoApprovedByVLM =
        latestLogoVerif?.verdict === 'verified' && latestLogoVerif?.confidence === 'high';
      const hasUnapprovedLogo = !!row.logoUid && !logoApprovedByAdmin && !logoApprovedByVLM;
      if (!hasUnapprovedField && !hasUnapprovedLogo && !hasJunkUserValueWithAiAlt) continue;

      const fields: EnrichmentReviewItem['fields'] = {};
      for (const [keyStr, fieldMeta] of Object.entries(meta.fieldsMeta) as Array<
        [FieldMetaKey, FieldEnrichmentMeta | undefined]
      >) {
        if (keyStr === 'moreDetails') continue;
        // Suppressed by the judge's recovery-exhaustion or trust-transfer
        // logic — the AI's verdict is still on `fieldMeta.judgment` for
        // audit, but the operational decision is to hide this field from
        // admin review.
        if (suppressed.has(keyStr)) continue;

        // Logo: no AI judgment exists (logo isn't judged — binary presence, not semantic).
        // Emit it as a regular field with `content = Image.url` so the UI can iterate
        // uniformly. The richer VLM verification still lives on the top-level `logo` block.
        if (keyStr === 'logo') {
          const logoUrl = row.logo?.url ?? row.team.logo?.url;
          if (!logoUrl) continue;
          fields.logo = {
            content: logoUrl,
            metadata: {
              status: fieldMeta?.status,
              source: fieldMeta?.source,
              lastModifiedAt: fieldMeta?.lastModifiedAt,
            },
            judgment: {},
          };
          continue;
        }

        if (!fieldMeta) continue;
        const fieldStatus = fieldMeta.status;
        // Most fields require a judgment to surface. The exception is the
        // ChangedByUser-with-junk-Team-value case: the judge accepts the
        // user's value (often via the `user trusted` fallback), but the AI
        // has a better alternative we want to put in front of the admin.
        // Emit the field so the back-office can render the AI suggestion.
        const teamValue = (row.team as any)[keyStr];
        const enrichmentValue = (row as any)[keyStr];
        const isEmpty = (v: any) =>
          v === null ||
          v === undefined ||
          (typeof v === 'string' && v.trim() === '') ||
          (Array.isArray(v) && v.length === 0);
        const userValIsJunk =
          fieldStatus === FieldEnrichmentStatus.ChangedByUser &&
          typeof teamValue === 'string' &&
          teamValue.trim() !== '' &&
          !isLikelyValueForField(keyStr, teamValue);
        const teValIsShapeValid =
          typeof enrichmentValue === 'string' &&
          enrichmentValue.trim() !== '' &&
          isLikelyValueForField(keyStr, enrichmentValue);

        // Skip fields with no judgment UNLESS this is the junk-user + AI-alt case.
        if (!fieldMeta.judgment && !(userValIsJunk && teValIsShapeValid)) continue;

        // Status decides the source of truth:
        //   - ChangedByUser → Team.<field> (user-owned value lives on Team; the TeamEnrichment
        //     candidate, if any, is informational provenance)
        //   - Enriched / CannotEnrich → TeamEnrichment.<field> (AI candidate not yet promoted)
        // Fallback to the other side covers rows where one side is empty (e.g. AI candidate
        // promoted-then-cleared, or pre-tracking user data with stale meta).
        const isUserOwned = fieldStatus === FieldEnrichmentStatus.ChangedByUser;
        const primary = isUserOwned ? teamValue : enrichmentValue;
        const fallback = isUserOwned ? enrichmentValue : teamValue;
        const candidate = !isEmpty(primary) ? primary : fallback;
        if (isEmpty(candidate)) continue;

        // Compute the opposite-side alternative — surface it when:
        //   - both sides are non-empty,
        //   - they differ (case-insensitive trimmed compare, to avoid
        //     "https://acme.com" vs "https://acme.com/" looking distinct),
        //   - and at least ONE of the two sides is shape-valid. This lets
        //     us show the literal user-typed `"Coming soon!"` as the
        //     alternative when the primary is the AI's shape-valid URL —
        //     admins benefit from seeing what the user typed even when
        //     it's junk. We only suppress when BOTH sides are junk; then
        //     there's nothing actionable to surface.
        let alternative: EnrichmentReviewFieldEntry['alternative'] | undefined;
        const otherSide = isUserOwned ? enrichmentValue : teamValue;
        const otherSideSide: 'team' | 'enrichment' = isUserOwned ? 'enrichment' : 'team';
        if (
          typeof otherSide === 'string' &&
          otherSide.trim() !== '' &&
          typeof candidate === 'string' &&
          otherSide.trim().toLowerCase() !== candidate.trim().toLowerCase() &&
          (isLikelyValueForField(keyStr, otherSide) || isLikelyValueForField(keyStr, candidate))
        ) {
          alternative = { content: otherSide, fromSide: otherSideSide };
        }

        fields[keyStr] = {
          content: candidate,
          metadata: {
            status: fieldMeta.status,
            source: fieldMeta.source,
            lastModifiedAt: fieldMeta.lastModifiedAt,
          },
          judgment: fieldMeta.judgment
            ? {
                note: fieldMeta.judgment.note,
                score: fieldMeta.judgment.score,
                verdict: fieldMeta.judgment.verdict,
                confidence: fieldMeta.judgment.confidence,
              }
            : {},
          ...(alternative ? { alternative } : {}),
        };
      }

      let logo: EnrichmentReviewLogo | undefined;
      const logoMeta = meta.fieldsMeta.logo;
      if (row.logoUid) {
        logo = {
          content: row.logo ? { uid: row.logo.uid, url: row.logo.url } : null,
          metadata: {
            status: logoMeta?.status,
            source: logoMeta?.source,
            lastModifiedAt: logoMeta?.lastModifiedAt,
          },
          ...(logoMeta?.judgment
            ? {
                judgment: {
                  note: logoMeta.judgment.note,
                  score: logoMeta.judgment.score,
                  verdict: logoMeta.judgment.verdict,
                  confidence: logoMeta.judgment.confidence,
                },
              }
            : {}),
          verification: latestLogoVerif
            ? {
                verdict: latestLogoVerif.verdict,
                confidence: latestLogoVerif.confidence,
                reason: latestLogoVerif.reason,
                verifiedAt: latestLogoVerif.createdAt.toISOString(),
              }
            : null,
        };
      }

      items.push({
        uid: row.team.uid,
        name: row.team.name,
        priority: row.team.priority,
        enrichmentStatus: meta.status,
        enrichmentAt: meta.usage?.enrichment?.lastRunAt ?? null,
        judgedAt: meta.judgment?.judgedAt ?? null,
        fields,
        ...(logo ? { logo } : {}),
      });
    }

    return { teams: items };
  }

  /**
   * Per-team enrich + judge status snapshot. Returns `enrichment: null` if the team has no
   * `TeamEnrichment` row yet. Throws `NotFoundException` if the team uid doesn't exist.
   */
  async getEnrichmentStatus(teamUid: string): Promise<TeamEnrichmentStatusResult> {
    const team = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: {
        uid: true,
        name: true,
        teamEnrichment: { select: { dataEnrichment: true } },
      },
    });

    if (!team) {
      throw new NotFoundException(`Team ${teamUid} not found`);
    }

    const meta = this.parseEnrichmentMeta(team.teamEnrichment?.dataEnrichment);
    if (!meta) {
      return { uid: team.uid, name: team.name, enrichment: null, judgment: null };
    }

    const enrichment: TeamEnrichmentStatusEntry = {
      status: meta.status,
      shouldEnrich: !!meta.shouldEnrich,
      enrichedAt: meta.enrichedAt ?? null,
      enrichedBy: meta.enrichedBy ?? null,
      reviewedAt: meta.reviewedAt ?? null,
      reviewedBy: meta.reviewedBy ?? null,
      errorMessage: meta.errorMessage ?? null,
      aiModel: meta.aiModel ?? null,
    };

    const judgment: TeamJudgmentStatusEntry | null = meta.judgment
      ? {
          status: meta.judgment.status,
          judgedAt: meta.judgment.judgedAt ?? null,
          judgedBy: meta.judgment.judgedBy ?? null,
          aiModel: meta.judgment.aiModel ?? null,
          errorMessage: meta.judgment.errorMessage ?? null,
          overallAssessment: meta.judgment.overallAssessment ?? null,
          fieldsForReview: meta.judgment.fieldsForReview ?? [],
        }
      : null;

    return { uid: team.uid, name: team.name, enrichment, judgment };
  }

  /**
   * Pending / in-progress counts for the enrichment + judge crons. Pending judge count uses the
   * same SQL pre-filter as the cron itself (`status=Enriched`, excluding rows already Judged or
   * InProgress); the cron's post-filter (`collectJudgableFieldKeys`) is not applied here because
   * it requires materializing every row, and the SQL-pre-filter count is the same shape the cron
   * logs report.
   */
  async getCronCounts(): Promise<EnrichmentCronCounts> {
    const [enrichPending, enrichInProgress, judgePending, judgeInProgress] = await Promise.all([
      this.prisma.teamEnrichment.count({
        where: {
          AND: [
            { dataEnrichment: { path: ['shouldEnrich'], equals: true } },
            { dataEnrichment: { path: ['status'], equals: EnrichmentStatus.PendingEnrichment } },
          ],
        },
      }),
      this.prisma.teamEnrichment.count({
        where: { dataEnrichment: { path: ['status'], equals: EnrichmentStatus.InProgress } },
      }),
      this.prisma.teamEnrichment.count({
        where: {
          AND: [
            { dataEnrichment: { path: ['status'], equals: EnrichmentStatus.Enriched } },
            {
              NOT: {
                OR: [
                  { dataEnrichment: { path: ['judgment', 'status'], equals: JudgmentStatus.Judged } },
                  { dataEnrichment: { path: ['judgment', 'status'], equals: JudgmentStatus.InProgress } },
                ],
              },
            },
          ],
        },
      }),
      this.prisma.teamEnrichment.count({
        where: { dataEnrichment: { path: ['judgment', 'status'], equals: JudgmentStatus.InProgress } },
      }),
    ]);

    return {
      enrichment: { pending: enrichPending, inProgress: enrichInProgress },
      judge: { pending: judgePending, inProgress: judgeInProgress },
    };
  }

  /**
   * Admin team approval. For each requested field, writes the value to Team and normalizes
   * the per-field judgment to `{ verdict: agrees, confidence: high, score: 100 }`.
   *
   * Per-field rule:
   *  - `content` provided → admin edited the value. Final value is the admin input;
   *    `fieldsMeta[key].status` flips to `ChangedByUser`.
   *  - `content` omitted ("Confirm") → admin accepted the existing value. Final value is
   *    read from the canonical source: `Team.<field>` when current status is `ChangedByUser`
   *    (the user's value is already there), otherwise the AI candidate on `TeamEnrichment.<field>`.
   *    `status` is left unchanged.
   *
   * Empty resolved values are pushed into `skipped` (`empty_value` / `no_candidate`) and not
   * promoted. Team-level `dataEnrichment.status` flips to `Approved`; approved keys are dropped
   * from `judgment.fieldsForReview`. Logo approval also marks the latest
   * `TeamLogoVerificationResult` row `verified` at high confidence.
   */
  async approveEnrichmentForTeam(
    teamUid: string,
    inputs: ApproveEnrichmentFieldInput[],
    reviewerEmail: string
  ): Promise<ApproveEnrichmentTeamResult> {
    const team = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: TEAM_WITH_ENRICHMENT_SELECT,
    });
    if (!team) {
      return { success: false, approved: [], skipped: [], message: `Team ${teamUid} not found` };
    }
    if (!team.teamEnrichment) {
      return {
        success: false,
        approved: [],
        skipped: [],
        message: `Team ${teamUid} has no enrichment row`,
      };
    }
    const meta = this.parseEnrichmentMeta(team.teamEnrichment.dataEnrichment);
    if (!meta) {
      return {
        success: false,
        approved: [],
        skipped: [],
        message: `Team ${teamUid} has no enrichment data`,
      };
    }
    if (meta.status === EnrichmentStatus.InProgress) {
      return {
        success: false,
        approved: [],
        skipped: [],
        message: `Enrichment already in progress for team ${teamUid}`,
      };
    }

    const fieldsMeta = meta.fieldsMeta ?? {};
    const skipped: ApproveEnrichmentTeamSkip[] = [];

    const isEmpty = (v: unknown): boolean =>
      v === null ||
      v === undefined ||
      (typeof v === 'string' && v.trim() === '') ||
      (Array.isArray(v) && v.length === 0);

    // `write` is the value to send to Team; null means "no Team write needed" (already there
    // for ChangedByUser + confirm). We still normalize fieldsMeta regardless.
    type Resolved = { key: FieldMetaKey; flip: boolean; write: string | string[] | null };
    const resolved: Resolved[] = [];
    const seen = new Set<FieldMetaKey>();

    for (const { key, content } of inputs) {
      if (seen.has(key)) continue;
      seen.add(key);

      const adminProvided = content !== undefined;
      if (adminProvided) {
        if (isEmpty(content)) {
          skipped.push({ key, reason: 'empty_value' });
          continue;
        }
        resolved.push({ key, flip: true, write: content as string | string[] });
        continue;
      }

      const currentStatus = fieldsMeta[key]?.status;
      // For ChangedByUser + confirm: value is already on Team / InvestorProfile. Bump score
      // only — no Team write needed (and reading team.<field> isn't well-typed for relations).
      if (currentStatus === FieldEnrichmentStatus.ChangedByUser) {
        resolved.push({ key, flip: false, write: null });
        continue;
      }

      const candidate =
        key === 'logo'
          ? team.teamEnrichment.logoUid
          : key === 'investmentFocus'
          ? team.teamEnrichment.investmentFocus
          : key === 'industryTags'
          ? team.teamEnrichment.industryTags
          : (team.teamEnrichment as any)[key];
      if (isEmpty(candidate)) {
        skipped.push({ key, reason: 'no_candidate' });
        continue;
      }
      resolved.push({ key, flip: false, write: candidate as string | string[] });
    }

    if (resolved.length === 0) {
      return { success: true, approved: [], skipped, message: 'No fields to approve' };
    }

    const teamUpdate: Prisma.TeamUpdateInput = {};
    let investmentFocus: string[] | null = null;

    for (const r of resolved) {
      if (r.write === null) continue;
      if (r.key === 'industryTags') {
        const titles = (r.write as string[]).filter((s) => typeof s === 'string' && s.trim() !== '');
        const matched =
          titles.length === 0
            ? []
            : await this.prisma.industryTag.findMany({
                where: { title: { in: titles, mode: 'insensitive' } },
                select: { uid: true },
              });
        teamUpdate.industryTags = { set: matched.map((t) => ({ uid: t.uid })) };
        continue;
      }
      if (r.key === 'investmentFocus') {
        investmentFocus = r.write as string[];
        continue;
      }
      if (r.key === 'logo') {
        const logoUid = Array.isArray(r.write) ? r.write[0] : r.write;
        teamUpdate.logo = { connect: { uid: logoUid } };
        continue;
      }
      // scalar
      (teamUpdate as any)[r.key] = Array.isArray(r.write) ? r.write[0] : r.write;
    }

    const now = new Date().toISOString();
    const approvedKeys = resolved.map((r) => r.key);
    const approvedSet = new Set<FieldMetaKey>(approvedKeys);

    const newFieldsMeta: FieldsMetaMap = { ...fieldsMeta };
    for (const r of resolved) {
      const existing = newFieldsMeta[r.key];
      const nextStatus = r.flip
        ? FieldEnrichmentStatus.ChangedByUser
        : existing?.status ?? FieldEnrichmentStatus.Enriched;
      newFieldsMeta[r.key] = stampModified(
        {
          ...(existing ?? {}),
          status: nextStatus,
          judgment: {
            // Admin approval supersedes the AI's note — clear it so stale judgment
            // text ("matches-known-...") doesn't outlive the value it described.
            note: '',
            judgedVia: existing?.judgment?.judgedVia ?? JudgmentSource.AI,
            verdict: JudgmentVerdict.Agrees,
            confidence: FieldConfidence.High,
            score: 100,
          },
        },
        now
      );
    }

    const updatedTeamJudgment = meta.judgment
      ? {
          ...meta.judgment,
          fieldsForReview: (meta.judgment.fieldsForReview ?? []).filter((f) => !approvedSet.has(f as FieldMetaKey)),
        }
      : meta.judgment;

    const updated: TeamDataEnrichment = {
      ...meta,
      fieldsMeta: newFieldsMeta,
      judgment: updatedTeamJudgment,
      status: EnrichmentStatus.Reviewed,
      reviewedAt: now,
      reviewedBy: reviewerEmail,
    };

    let latestLogoVerificationUid: string | null = null;
    if (approvedSet.has('logo')) {
      const latest = await this.prisma.teamLogoVerificationResult.findFirst({
        where: { teamUid },
        orderBy: { createdAt: 'desc' },
        select: { uid: true },
      });
      latestLogoVerificationUid = latest?.uid ?? null;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.teamEnrichment.update({
        where: { teamUid },
        data: { dataEnrichment: updated as any },
      });
      if (Object.keys(teamUpdate).length > 0) {
        await tx.team.update({ where: { uid: teamUid }, data: teamUpdate });
      }
      if (investmentFocus !== null) {
        if (team.investorProfile) {
          await tx.investorProfile.update({
            where: { uid: team.investorProfile.uid },
            data: { investmentFocus },
          });
        } else {
          await tx.investorProfile.create({
            data: {
              investmentFocus,
              team: { connect: { uid: teamUid } },
            },
          });
        }
      }
      if (latestLogoVerificationUid) {
        await tx.teamLogoVerificationResult.update({
          where: { uid: latestLogoVerificationUid },
          data: { verdict: 'verified', confidence: 'high' },
        });
      }
    });

    this.logger.log(
      `Admin enrichment approve: team ${teamUid} approved=[${approvedKeys.join(',')}] reviewer=${reviewerEmail}`
    );

    return {
      success: true,
      approved: approvedKeys,
      skipped,
      message: `Approved ${approvedKeys.length} field(s) for team ${teamUid}`,
    };
  }

  private async maybeEnrichViaScrapingDog(ctx: {
    teamUid: string;
    team: TeamWithEnrichment;
    existingFieldsMeta: FieldsMetaMap;
    aiLinkedinHandler: string | null;
    enrichmentUpdate: Prisma.TeamEnrichmentUpdateInput;
    newFieldsMeta: FieldsMetaMap;
    forceOverwrite?: boolean;
  }): Promise<TeamDataEnrichment['scrapingDog'] | null> {
    const { teamUid, team, existingFieldsMeta, aiLinkedinHandler, enrichmentUpdate, newFieldsMeta, forceOverwrite } =
      ctx;

    const markSdField = (field: FieldMetaKey) => {
      newFieldsMeta[field] = {
        status: FieldEnrichmentStatus.Enriched,
        confidence: FieldConfidence.High,
        source: EnrichmentSource.ScrapingDog,
      };
    };

    if (!this.scrapingDogService.isConfigured()) return null;

    const handle = team.linkedinHandler || aiLinkedinHandler || null;
    if (!handle) {
      this.logger.debug(`Team ${teamUid}: no LinkedIn handle available, skipping ScrapingDog`);
      return null;
    }

    const logoIsUserOwned =
      existingFieldsMeta.logo?.status === FieldEnrichmentStatus.ChangedByUser ||
      (!!team.logoUid && !existingFieldsMeta.logo);
    const hasLogoGap = !logoIsUserOwned && (!team.logoUid || !!forceOverwrite) && !(enrichmentUpdate as any).logo;
    const hasWebsiteGap = !team.website && !(enrichmentUpdate as any).website;
    const hasShortDescGap = !team.shortDescription && !(enrichmentUpdate as any).shortDescription;
    const hasLongDescGap = !team.longDescription && !(enrichmentUpdate as any).longDescription;
    const hasMoreDetailsGap = !team.moreDetails && !(enrichmentUpdate as any).moreDetails;
    const tagsStatus = existingFieldsMeta.industryTags?.status;
    const hasIndustryTagsGap =
      tagsStatus !== FieldEnrichmentStatus.Enriched &&
      tagsStatus !== FieldEnrichmentStatus.ChangedByUser &&
      team.industryTags.length === 0 &&
      !(enrichmentUpdate as any).industryTags;

    if (
      !hasLogoGap &&
      !hasWebsiteGap &&
      !hasShortDescGap &&
      !hasLongDescGap &&
      !hasMoreDetailsGap &&
      !hasIndustryTagsGap
    ) {
      this.logger.debug(`Team ${teamUid}: no gaps remain, skipping ScrapingDog`);
      return null;
    }

    const usingUserOwnedHandle =
      handle === team.linkedinHandler &&
      isFieldUserOwned(existingFieldsMeta, 'linkedinHandler', team.linkedinHandler);

    this.logger.log(
      `Team ${teamUid} (${team.name}): invoking ScrapingDog for handle "${handle}"${
        usingUserOwnedHandle ? ' (user-owned handle, entity check bypassed)' : ''
      }`
    );
    const fetchResult = await this.scrapingDogService.fetchCompanyProfile(handle);

    if (fetchResult.kind === 'error') {
      this.logger.warn(
        `Team ${teamUid} (${team.name}): ScrapingDog error "${fetchResult.reason}", leaving handle as-is`
      );
      return null;
    }

    if (fetchResult.kind === 'not-found') {
      const handleIsUserOwned = isFieldUserOwned(existingFieldsMeta, 'linkedinHandler', team.linkedinHandler);
      if (handleIsUserOwned) {
        this.logger.warn(
          `Team ${teamUid} (${team.name}): ScrapingDog reports "${handle}" not found, but handle is user-owned — leaving as-is`
        );
        return null;
      }
      this.logger.warn(
        `Team ${teamUid} (${team.name}): LinkedIn handle "${handle}" is invalid per ScrapingDog, nulling`
      );
      // Null the stored handle if it was persisted on Team; otherwise it only existed on the AI
      // response and was never written.
      if (team.linkedinHandler === handle) {
        await this.prisma.team.update({
          where: { uid: teamUid },
          data: { linkedinHandler: null },
        });
      }
      newFieldsMeta.linkedinHandler = {
        status: FieldEnrichmentStatus.CannotEnrich,
        source: EnrichmentSource.AI,
      };
      return null;
    }

    const profile = fetchResult.profile;

    const nameMatch = this.scrapingDogService.classifyNameMatch(team.name, profile);
    if (!usingUserOwnedHandle && nameMatch === 'none') {
      this.logger.warn(
        `Team ${teamUid} (${team.name}): ScrapingDog profile name "${profile.companyName}" / "${profile.universalNameId}" does not match, discarding`
      );
      return null;
    }

    const filledFields: string[] = [];

    if (hasWebsiteGap && profile.website) {
      (enrichmentUpdate as any).website = profile.website;
      markSdField('website');
      filledFields.push('website');
    }

    if (hasShortDescGap && profile.tagline) {
      (enrichmentUpdate as any).shortDescription = this.aiService.truncateString(profile.tagline, 200);
      markSdField('shortDescription');
      filledFields.push('shortDescription');
    }

    if (hasLongDescGap && profile.about) {
      (enrichmentUpdate as any).longDescription = this.aiService.truncateString(profile.about, 1000);
      markSdField('longDescription');
      filledFields.push('longDescription');
    }

    if (hasMoreDetailsGap) {
      const parts: string[] = [];
      if (profile.founded) parts.push(`Founded: ${profile.founded}`);
      if (profile.headquarters) parts.push(`Headquarters: ${profile.headquarters}`);
      if (profile.industries.length) parts.push(`Industries: ${profile.industries.join(', ')}`);
      if (profile.specialties.length) parts.push(`Specialties: ${profile.specialties.join(', ')}`);
      if (parts.length > 0) {
        (enrichmentUpdate as any).moreDetails = parts.join('\n');
        markSdField('moreDetails');
        filledFields.push('moreDetails');
      }
    }

    if (hasIndustryTagsGap) {
      const candidates = [...profile.industries, ...profile.specialties];
      if (candidates.length > 0) {
        const matchedTags = await this.prisma.industryTag.findMany({
          where: { title: { in: candidates, mode: 'insensitive' } },
          select: { uid: true, title: true },
        });
        if (matchedTags.length > 0) {
          enrichmentUpdate.industryTags = matchedTags.map((t) => t.title);
          markSdField('industryTags');
          filledFields.push('industryTags');
        }
      }
    }

    if (hasLogoGap && profile.profilePhoto) {
      try {
        const persisted = await this.persistLogoImage(teamUid, profile.profilePhoto, 'scrapingdog');
        if (persisted) {
          enrichmentUpdate.logo = { connect: { uid: persisted.imageUid } };
          markSdField('logo');
          filledFields.push('logo');
          this.logger.log(
            `Team ${teamUid} (${team.name}): logo set from ScrapingDog, image uid: ${persisted.imageUid}`
          );
        }
      } catch (error) {
        this.logger.warn(`Team ${teamUid} (${team.name}): ScrapingDog logo download/upload failed: ${error.message}`);
      }
    }

    // Confidence upgrade: on a valid ScrapingDog profile with a matching name, corroborate
    // AI-filled fields. Snapshot is taken against the in-progress TeamEnrichment update so we
    // verify the candidate values, not the current Team values.
    const postRunTeam = {
      name: team.name,
      website: ((enrichmentUpdate as any).website as string | null | undefined) ?? team.website,
      linkedinHandler: team.linkedinHandler,
      shortDescription:
        ((enrichmentUpdate as any).shortDescription as string | null | undefined) ?? team.shortDescription,
      longDescription: ((enrichmentUpdate as any).longDescription as string | null | undefined) ?? team.longDescription,
      moreDetails: ((enrichmentUpdate as any).moreDetails as string | null | undefined) ?? team.moreDetails,
      industryTags: team.industryTags.map((t) => ({ title: t.title })),
    };
    const verdicts = this.scrapingDogService.compareProfileToTeam(postRunTeam, profile, nameMatch);
    for (const [field, verdict] of Object.entries(verdicts) as Array<[FieldMetaKey, FieldJudgment | undefined]>) {
      if (!verdict || verdict.verdict !== JudgmentVerdict.Agrees) continue;
      const currentMeta = (newFieldsMeta[field] ?? existingFieldsMeta[field]) as FieldEnrichmentMeta | undefined;
      if (!currentMeta || currentMeta.status !== FieldEnrichmentStatus.Enriched) continue;
      if (currentMeta.source === EnrichmentSource.ScrapingDog) continue;
      const currentRank = rankConfidence(currentMeta.confidence);
      const newRank = rankConfidence(verdict.confidence);
      if (newRank > currentRank) {
        newFieldsMeta[field] = {
          ...currentMeta,
          confidence: verdict.confidence,
        };
        this.logger.log(
          `Team ${teamUid} (${team.name}): upgraded ${field} confidence to ${verdict.confidence} via ScrapingDog match`
        );
      }
    }

    if (filledFields.length === 0) {
      this.logger.log(`Team ${teamUid} (${team.name}): ScrapingDog returned no fillable data`);
      return {
        used: true,
        fetchedAt: new Date().toISOString(),
        fields: [],
        linkedinInternalId: profile.linkedinInternalId,
      };
    }

    this.logger.log(`Team ${teamUid} (${team.name}): ScrapingDog filled [${filledFields.join(', ')}]`);

    return {
      used: true,
      fetchedAt: new Date().toISOString(),
      fields: filledFields,
      linkedinInternalId: profile.linkedinInternalId,
    };
  }

  private verifyScrapingDogEntity(teamName: string, profile: ScrapingDogCompanyProfile): boolean {
    return this.scrapingDogService.classifyNameMatch(teamName, profile) !== 'none';
  }

  /**
   * Verifies a candidate `twitterHandler` against ScrapingDog's X profile.
   * Mirrors the LinkedIn fallback's intent — turn an AI guess into a
   * deterministically-corroborated value — but with three differences:
   *
   *   1. It runs even when the field has no "gap" (since the goal is to
   *      upgrade an already-filled candidate, not to discover a new one).
   *   2. It picks up orphan values left behind by a prior run (a candidate
   *      stored on `te.twitterHandler` whose `fieldsMeta` status got flipped to
   *      `CannotEnrich` on a later force-enrich where the AI returned null).
   *   3. On a verified profile it writes `source = scrapingdog` /
   *      `confidence = high`, which the judge's Stage 1.5 source-trust rule
   *      auto-promotes — no AI call, no admin review.
   *
   * Verification accepts the handle when ANY of:
   *   - profile website host equals team website host (strongest single signal),
   *   - profile name shares a substantive token with the team name AND the
   *     account is X-verified as a Business/Government org,
   *   - profile name shares a substantive token with the team name AND the
   *     handle's first label prefix-matches a team-name token (two converging
   *     identity anchors, same doctrine as the existing `name in twitter handle`
   *     corroboration rule).
   *
   * Non-verifying outcomes (profile fetched but no anchor fires, or
   * not-found / error) are non-destructive on first occurrence — the prior
   * state stands and the AI judge gets a normal turn at the field. We
   * intentionally do NOT null an orphan handle here because the same handle
   * can be correct even when X's parsed payload misses an anchor (an org
   * account with no listed website and a brand-different display name is
   * plausible); the LinkedIn `nullBadLinkedinHandle` path has the much
   * stronger signal of a hard "not found" response, which the X endpoint
   * provides equivalently.
   */
  private async maybeVerifyTwitterHandleViaScrapingDog(ctx: {
    teamUid: string;
    team: TeamWithEnrichment;
    existingFieldsMeta: FieldsMetaMap;
    enrichmentUpdate: Prisma.TeamEnrichmentUpdateInput;
    newFieldsMeta: FieldsMetaMap;
  }): Promise<void> {
    if (!this.scrapingDogService.isConfigured()) return;

    const { teamUid, team, existingFieldsMeta, enrichmentUpdate, newFieldsMeta } = ctx;

    if (isFieldUserOwned(existingFieldsMeta, 'twitterHandler', team.twitterHandler)) return;

    // Candidate priority:
    //   1. Value being written this run (AI / website-signal / lead-backfill).
    //   2. Existing TeamEnrichment.twitterHandler (orphan from a prior run, or
    //      from the previous Enriched state that this force-run is re-evaluating).
    // The newFieldsMeta status is the in-flight write; the existing fieldsMeta
    // status is what's about to be overwritten.
    const candidateFromUpdate =
      typeof (enrichmentUpdate as any).twitterHandler === 'string'
        ? ((enrichmentUpdate as any).twitterHandler as string)
        : null;
    const candidate = candidateFromUpdate ?? team.teamEnrichment?.twitterHandler ?? null;
    if (!candidate || !isLikelyValueForField('twitterHandler', candidate)) return;

    const result = await this.scrapingDogService.fetchTwitterProfile(candidate);
    if (result.kind !== 'ok') {
      this.logger.log(
        `Team ${teamUid} (${team.name}): X profile for "${candidate}" returned ${result.kind}` +
          (result.kind === 'error' ? ` (${result.reason})` : '') +
          ' — leaving twitterHandler state untouched'
      );
      return;
    }

    const verification = verifyTwitterProfileMatchesTeam(team, result.profile);
    if (!verification.verified) {
      this.logger.log(
        `Team ${teamUid} (${team.name}): X profile fetched for "${candidate}" but no identity anchor fired ` +
          `(profile.name="${result.profile.name ?? ''}" website="${result.profile.website ?? ''}" verifiedType="${result.profile.verifiedType ?? ''}")`
      );
      return;
    }

    // Canonical handle from the verified profile (X's preferred casing,
    // stripped of `@`). Fall back to the candidate when the profile omits
    // its own username (shouldn't happen for a parsed payload, but defensive).
    const canonicalHandle = result.profile.username ?? candidate.replace(/^@/, '');
    (enrichmentUpdate as any).twitterHandler = canonicalHandle;
    newFieldsMeta.twitterHandler = {
      status: FieldEnrichmentStatus.Enriched,
      confidence: FieldConfidence.High,
      source: EnrichmentSource.ScrapingDog,
    };
    this.logger.log(
      `Team ${teamUid} (${team.name}): X profile verified twitterHandler="${canonicalHandle}" via [${verification.anchors.join(', ')}]`
    );
  }


  parseEnrichmentMeta(raw: any): TeamDataEnrichment | null {
    if (!raw) return null;
    try {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return data as TeamDataEnrichment;
    } catch {
      return null;
    }
  }

  /**
   * Reads the latest TeamEnrichment.dataEnrichment for a given team. Returns null when
   * the team has never been enriched (no TeamEnrichment row yet).
   */
  private async readEnrichmentMeta(teamUid: string): Promise<TeamDataEnrichment | null> {
    const row = await this.prisma.teamEnrichment.findUnique({
      where: { teamUid },
      select: { dataEnrichment: true },
    });
    return this.parseEnrichmentMeta(row?.dataEnrichment);
  }

  /**
   * Upserts a TeamEnrichment row carrying just the dataEnrichment JSON. Used for marking,
   * status transitions, and any other metadata-only writes that don't touch candidate values.
   */
  private async upsertEnrichmentRow(teamUid: string, enrichment: TeamDataEnrichment): Promise<void> {
    await this.prisma.teamEnrichment.upsert({
      where: { teamUid },
      create: {
        team: { connect: { uid: teamUid } },
        dataEnrichment: enrichment as any,
      },
      update: { dataEnrichment: enrichment as any },
    });
  }

  /**
   * Translates a `TeamEnrichmentUpdateInput` into the equivalent `TeamEnrichmentCreateInput`
   * shape for the upsert `create` branch. The only divergence is `logo`, which uses a relation
   * verb on both sides; scalars and String[] arrays pass through as-is.
   */
  private updateInputToCreate(
    update: Prisma.TeamEnrichmentUpdateInput
  ): Omit<Prisma.TeamEnrichmentCreateInput, 'team'> {
    const { logo, industryTags, investmentFocus, dataEnrichment, ...scalars } = update as any;
    const out: Omit<Prisma.TeamEnrichmentCreateInput, 'team'> = { ...scalars };
    if (logo?.connect) out.logo = logo;
    if (industryTags?.set) out.industryTags = industryTags.set;
    if (investmentFocus?.set) out.investmentFocus = investmentFocus.set;
    if (dataEnrichment !== undefined) out.dataEnrichment = dataEnrichment;
    return out;
  }

  /**
   * Cross-validates that the AI response is about the correct entity.
   * Checks multiple signals: website owner name, descriptions, and sources.
   * Returns true only if we're confident the data is about the right team.
   */
  private verifyEntityIdentity(
    teamName: string,
    aiResponse: {
      website: string | null;
      websiteOwnerName: string | null;
      shortDescription: string | null;
      longDescription: string | null;
      sources: string[];
    }
  ): boolean {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim();

    const normalizedTeamName = normalize(teamName);
    const teamWords = normalizedTeamName.split(/\s+/);

    let websiteNameMatch = false;
    if (aiResponse.websiteOwnerName) {
      const normalizedOwner = normalize(aiResponse.websiteOwnerName);
      websiteNameMatch = normalizedOwner.includes(normalizedTeamName) || normalizedTeamName.includes(normalizedOwner);
    }

    let descriptionMatch = false;
    const descriptionsToCheck = [aiResponse.shortDescription, aiResponse.longDescription].filter(
      (d): d is string => !!d
    );
    for (const desc of descriptionsToCheck) {
      if (this.containsExactEntityName(normalize(desc), normalizedTeamName)) {
        descriptionMatch = true;
        break;
      }
    }

    let sourceMatch = false;
    const urlSlug = teamWords.join('-');
    const urlSlugAlt = teamWords.join('');
    for (const source of aiResponse.sources || []) {
      const lowerSource = source.toLowerCase();
      if (lowerSource.includes(urlSlug) || lowerSource.includes(urlSlugAlt)) {
        sourceMatch = true;
        break;
      }
    }

    const matchCount = [websiteNameMatch, descriptionMatch, sourceMatch].filter(Boolean).length;

    this.logger.log(
      `Entity verification for "${teamName}": website=${websiteNameMatch}, description=${descriptionMatch}, sources=${sourceMatch} (${matchCount}/3 signals)`
    );

    if (websiteNameMatch) return true;
    if (matchCount >= 2) return true;
    if (descriptionMatch) return true;
    return false;
  }

  private containsExactEntityName(text: string, entityName: string): boolean {
    let startIndex = 0;
    while (true) {
      const idx = text.indexOf(entityName, startIndex);
      if (idx === -1) return false;

      const charBefore = idx > 0 ? text[idx - 1] : ' ';
      const charAfter = idx + entityName.length < text.length ? text[idx + entityName.length] : ' ';

      const isWordBoundaryBefore = charBefore === ' ' || idx === 0;
      const isWordBoundaryAfter =
        charAfter === ' ' ||
        charAfter === ',' ||
        charAfter === '.' ||
        charAfter === ')' ||
        charAfter === ':' ||
        charAfter === ';' ||
        idx + entityName.length === text.length;

      if (isWordBoundaryBefore && isWordBoundaryAfter) {
        const textBefore = text.substring(0, idx).trim();
        const wordBefore = textBefore.split(/\s+/).pop() || '';

        const textAfter = text.substring(idx + entityName.length).trim();
        const wordAfter = textAfter.split(/\s+/)[0] || '';

        const entityExtendingWords = ['gaming', 'capital', 'labs', 'studio', 'studios', 'digital', 'global', 'network'];

        const beforeSafe = !entityExtendingWords.includes(wordBefore);
        const safeSuffixes = [
          'is',
          'was',
          'has',
          'are',
          'aims',
          'provides',
          'offers',
          'focuses',
          'represents',
          'initiative',
          'program',
          'fund',
          'working',
          'group',
          'agv',
          'avi',
          'formerly',
          'also',
          'the',
          'a',
          'an',
          'and',
          'or',
          'for',
          'to',
          'in',
          'on',
          'at',
          'by',
          'with',
          '',
        ];
        const afterSafe = safeSuffixes.includes(wordAfter) || !entityExtendingWords.includes(wordAfter);

        if (beforeSafe && afterSafe) {
          return true;
        }
      }

      startIndex = idx + 1;
    }
  }

  private async updateEnrichmentStatus(
    teamUid: string,
    currentMeta: TeamDataEnrichment | null,
    status: EnrichmentStatus,
    errorMessage?: string
  ): Promise<void> {
    const meta = currentMeta || {
      shouldEnrich: false,
      status,
      isAIGenerated: false,
      fieldsMeta: {},
    };

    meta.status = status;
    if (status === EnrichmentStatus.FailedToEnrich) {
      meta.shouldEnrich = false;
    }
    if (errorMessage) {
      meta.errorMessage = errorMessage;
    }

    await this.upsertEnrichmentRow(teamUid, meta);
  }
}
