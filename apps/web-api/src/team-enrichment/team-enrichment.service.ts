import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { TeamEnrichmentAiService } from './team-enrichment-ai.service';
import { buildTeamEnrichmentEligibilityFilter } from './team-enrichment-eligibility-filter';
import { formatUsageLog, mergeUsageEntries } from './team-enrichment-cost';
import { buildPromotionPayload, executePromotion } from './team-enrichment-promotion';
import { ScrapingDogCompanyProfile, TeamEnrichmentScrapingDogService } from './team-enrichment-scrapingdog.service';
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
  content: string | string[];
  metadata: { status?: FieldEnrichmentStatus; source?: EnrichmentSource; lastModifiedAt?: string };
  judgment: { note?: string; score?: number };
  promotable: boolean;
};

export type EnrichmentReviewLogo = {
  content: { uid: string; url: string } | null;
  metadata: { status?: FieldEnrichmentStatus; source?: EnrichmentSource; lastModifiedAt?: string };
  verification: {
    verdict: string;
    confidence: string;
    reason: string | null;
    verifiedAt: string;
  } | null;
  promotable: boolean;
};

export type EnrichmentReviewItem = {
  uid: string;
  name: string;
  enrichmentStatus: EnrichmentStatus;
  fields: Partial<Record<FieldMetaKey, EnrichmentReviewFieldEntry>>;
  logo?: EnrichmentReviewLogo;
};

export type ApproveEnrichmentFieldsResult = {
  success: boolean;
  promoted: string[];
  skipped: Array<{ field: string; reason: string }>;
  message?: string;
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
  teamSlotHasValue: boolean
): boolean {
  const status = fieldsMeta[field]?.status;
  if (status === FieldEnrichmentStatus.ChangedByUser) return true;
  if (teamSlotHasValue && !fieldsMeta[field]) return true;
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
   */
  async findTeamsPendingEnrichment(): Promise<Array<{ uid: string }>> {
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
        const linkedinIsUserOwned = isFieldUserOwned(existingFieldsMeta, 'linkedinHandler', !!team.linkedinHandler);
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
        shortDescription: isFieldUserOwned(existingFieldsMeta, 'shortDescription', !!team.shortDescription)
          ? team.shortDescription
          : null,
        longDescription: isFieldUserOwned(existingFieldsMeta, 'longDescription', !!team.longDescription)
          ? team.longDescription
          : null,
        moreDetails: isFieldUserOwned(existingFieldsMeta, 'moreDetails', !!team.moreDetails) ? team.moreDetails : null,
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
      const websiteIsUserOwned = !!team.website && isFieldUserOwned(existingFieldsMeta, 'website', !!team.website);
      const websiteBackfilledFields = new Set<EnrichableTeamField>();
      const websiteHtml = websiteToScan ? await this.aiService.fetchWebsiteHtml(websiteToScan) : null;

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
        }
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
        aiReturnedNull: [],
        aiCannotEnrich: [],
      };

      for (const field of ENRICHABLE_TEAM_FIELDS) {
        const fieldStatus = existingFieldsMeta[field]?.status;

        if (fieldStatus === FieldEnrichmentStatus.ChangedByUser) {
          skipReasons.userEdited.push(field);
          continue;
        }

        // user-owned check is against the Team row (what the user/judge see),
        // not the TeamEnrichment candidate row.
        const teamValue = team[field];
        const teamSlotIsEmpty = !teamValue || teamValue.trim() === '';

        if (!teamSlotIsEmpty && fieldStatus !== FieldEnrichmentStatus.Enriched) {
          newFieldsMeta[field] = {
            ...existingFieldsMeta[field],
            status: FieldEnrichmentStatus.ChangedByUser,
          };
          skipReasons.userOwned.push(field);
          continue;
        }

        if (!forceOverwrite && fieldStatus === FieldEnrichmentStatus.Enriched) {
          skipReasons.alreadyEnriched.push(field);
          continue;
        }

        const newValue = aiResponse[field];
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

      const enrichment: TeamDataEnrichment = {
        shouldEnrich: false,
        status: EnrichmentStatus.Enriched,
        isAIGenerated: Object.values(mergedFieldsMeta).some((m) => m.status === FieldEnrichmentStatus.Enriched),
        enrichedAt: new Date().toISOString(),
        enrichedBy,
        aiModel: this.aiService.getModelName(),
        fieldsMeta: mergedFieldsMeta,
        ...(scrapingDogMeta ? { scrapingDog: scrapingDogMeta } : {}),
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
   * Full list of teams whose enrichment is in `EnrichmentStatus.Enriched`. Includes every
   * judged field regardless of confidence so admins can spot-check what the judge promoted.
   *
   * Per-field rules:
   *  - fields without a `fieldsMeta[k].judgment` entry are skipped (not review-ready)
   *  - empty candidate values (null / empty string / empty array) are excluded
   *  - ChangedByUser fields are surfaced with `promotable: false`
   *
   * Logos: emitted whenever `TeamEnrichment.logoUid` is set; the latest
   * `TeamLogoVerificationResult` (any confidence) populates `verification`. The live
   * `Team.logo` is exposed separately as `teamLogo` for current-vs-candidate comparison.
   */
  async listEnrichmentsForReview(): Promise<{ teams: EnrichmentReviewItem[] }> {
    const rows = await this.prisma.teamEnrichment.findMany({
      where: { dataEnrichment: { path: ['status'], equals: EnrichmentStatus.Enriched } },
      select: {
        teamUid: true,
        team: {
          select: {
            uid: true,
            name: true,
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

      const fields: EnrichmentReviewItem['fields'] = {};
      for (const [keyStr, fieldMeta] of Object.entries(meta.fieldsMeta) as Array<
        [FieldMetaKey, FieldEnrichmentMeta | undefined]
      >) {
        if (keyStr === 'moreDetails') continue;

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
            promotable: fieldMeta?.status !== FieldEnrichmentStatus.ChangedByUser,
          };
          continue;
        }

        if (!fieldMeta?.judgment) continue;

        // Status decides the source of truth:
        //   - ChangedByUser → Team.<field> (user-owned value lives on Team; the TeamEnrichment
        //     candidate, if any, is informational provenance)
        //   - Enriched / CannotEnrich → TeamEnrichment.<field> (AI candidate not yet promoted)
        // Fallback to the other side covers rows where one side is empty (e.g. AI candidate
        // promoted-then-cleared, or pre-tracking user data with stale meta).
        const isUserOwned = fieldMeta.status === FieldEnrichmentStatus.ChangedByUser;
        const teamValue = (row.team as any)[keyStr];
        const enrichmentValue = (row as any)[keyStr];
        const isEmpty = (v: any) =>
          v === null ||
          v === undefined ||
          (typeof v === 'string' && v.trim() === '') ||
          (Array.isArray(v) && v.length === 0);
        const primary = isUserOwned ? teamValue : enrichmentValue;
        const fallback = isUserOwned ? enrichmentValue : teamValue;
        const candidate = !isEmpty(primary) ? primary : fallback;
        if (isEmpty(candidate)) continue;

        fields[keyStr] = {
          content: candidate,
          metadata: {
            status: fieldMeta.status,
            source: fieldMeta.source,
            lastModifiedAt: fieldMeta.lastModifiedAt,
          },
          judgment: { note: fieldMeta.judgment.note, score: fieldMeta.judgment.score },
          promotable: fieldMeta.status !== FieldEnrichmentStatus.ChangedByUser,
        };
      }

      let logo: EnrichmentReviewLogo | undefined;
      const logoMeta = meta.fieldsMeta.logo;
      const latestLogoVerif = latestByTeam.get(row.teamUid);
      if (row.logoUid) {
        logo = {
          content: row.logo ? { uid: row.logo.uid, url: row.logo.url } : null,
          metadata: {
            status: logoMeta?.status,
            source: logoMeta?.source,
            lastModifiedAt: logoMeta?.lastModifiedAt,
          },
          verification: latestLogoVerif
            ? {
                verdict: latestLogoVerif.verdict,
                confidence: latestLogoVerif.confidence,
                reason: latestLogoVerif.reason,
                verifiedAt: latestLogoVerif.createdAt.toISOString(),
              }
            : null,
          promotable: logoMeta?.status !== FieldEnrichmentStatus.ChangedByUser,
        };
      }

      items.push({
        uid: row.team.uid,
        name: row.team.name,
        enrichmentStatus: meta.status,
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
   * Approve a specific set of enrichment fields (and optionally `logo`) for one team.
   *
   * For each approved field:
   *  - copy the candidate value from TeamEnrichment to Team (scalars), or set the M2M
   *    (industryTags), or upsert InvestorProfile.investmentFocus, or set Team.logoUid (logo) —
   *    via the shared promotion helpers, so the write path matches the AI judge's.
   *  - normalize `fieldsMeta[field].judgment` to `{ verdict: 'agrees', confidence: 'high', score: 90 }`
   *    while preserving `note` and `judgedVia` (audit signal).
   *  - drop the field from team-level `dataEnrichment.judgment.fieldsForReview`.
   *
   * Team-level: flip `dataEnrichment.status` to `Reviewed`, write `reviewedAt` / `reviewedBy`.
   *
   * Logo approval also mutates the latest `TeamLogoVerificationResult` row for the team
   * (any provider, newest by createdAt) → `verdict='verified'`, `confidence='high'`. Other columns
   * (reason, brandSignals, rawResponse, predictedCompanyName, quality, hasReadableText, model,
   * provider) are left verbatim as the model's snapshot.
   *
   * Skipped fields are returned with a `reason` (`user_owned`, `not_enriched`, `no_field_meta`,
   * `empty_candidate`) so the caller can surface partial outcomes.
   */
  async approveEnrichmentFields(
    teamUid: string,
    fields: string[],
    reviewerEmail: string
  ): Promise<ApproveEnrichmentFieldsResult> {
    const team = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: TEAM_WITH_ENRICHMENT_SELECT,
    });
    if (!team) {
      return { success: false, promoted: [], skipped: [], message: `Team ${teamUid} not found` };
    }
    if (!team.teamEnrichment) {
      return {
        success: false,
        promoted: [],
        skipped: [],
        message: `Team ${teamUid} has no enrichment row`,
      };
    }
    const meta = this.parseEnrichmentMeta(team.teamEnrichment.dataEnrichment);
    if (!meta) {
      return {
        success: false,
        promoted: [],
        skipped: [],
        message: `Team ${teamUid} has no enrichment data`,
      };
    }
    if (meta.status === EnrichmentStatus.InProgress) {
      return {
        success: false,
        promoted: [],
        skipped: [],
        message: `Enrichment already in progress for team ${teamUid}`,
      };
    }

    const fieldsMeta = meta.fieldsMeta ?? {};
    const skipped: Array<{ field: string; reason: string }> = [];
    const promotableKeys: FieldMetaKey[] = [];

    for (const f of fields) {
      const key = f as FieldMetaKey;
      const fm = fieldsMeta[key];
      if (!fm) {
        skipped.push({ field: f, reason: 'no_field_meta' });
        continue;
      }
      if (fm.status === FieldEnrichmentStatus.ChangedByUser) {
        skipped.push({ field: f, reason: 'user_owned' });
        continue;
      }
      if (fm.status !== FieldEnrichmentStatus.Enriched) {
        skipped.push({ field: f, reason: 'not_enriched' });
        continue;
      }
      promotableKeys.push(key);
    }

    if (promotableKeys.length === 0) {
      return { success: true, promoted: [], skipped, message: 'No promotable fields' };
    }

    const promotion = await buildPromotionPayload(this.prisma, team.teamEnrichment, promotableKeys, fieldsMeta);
    const promotedSet = new Set<string>(promotion.promotedFields);
    for (const requested of promotableKeys) {
      if (!promotedSet.has(requested)) {
        skipped.push({ field: requested, reason: 'empty_candidate' });
      }
    }

    if (promotion.promotedFields.length === 0) {
      return { success: true, promoted: [], skipped, message: 'No values to promote' };
    }

    const newFieldsMeta: FieldsMetaMap = { ...fieldsMeta };
    for (const k of promotion.promotedFields) {
      const existing = newFieldsMeta[k];
      if (!existing) continue;
      newFieldsMeta[k] = {
        ...existing,
        judgment: {
          note: existing.judgment?.note,
          judgedVia: existing.judgment?.judgedVia ?? JudgmentSource.AI,
          verdict: JudgmentVerdict.Agrees,
          confidence: FieldConfidence.High,
          score: 90,
        },
      };
    }

    const updatedTeamJudgment = meta.judgment
      ? {
          ...meta.judgment,
          fieldsForReview: (meta.judgment.fieldsForReview ?? []).filter((f) => !promotedSet.has(f)),
        }
      : meta.judgment;

    const updated: TeamDataEnrichment = {
      ...meta,
      fieldsMeta: newFieldsMeta,
      judgment: updatedTeamJudgment,
      status: EnrichmentStatus.Reviewed,
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewerEmail,
    };

    let latestLogoVerificationUid: string | null = null;
    if (promotedSet.has('logo')) {
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
      await executePromotion(tx, teamUid, team, promotion);
      if (latestLogoVerificationUid) {
        await tx.teamLogoVerificationResult.update({
          where: { uid: latestLogoVerificationUid },
          data: { verdict: 'verified', confidence: 'high' },
        });
      }
    });

    this.logger.log(
      `Admin enrichment approve: team ${teamUid} promoted=[${promotion.promotedFields.join(
        ','
      )}] reviewer=${reviewerEmail}`
    );

    return {
      success: true,
      promoted: promotion.promotedFields,
      skipped,
      message: `Approved ${promotion.promotedFields.length} field(s) for team ${teamUid}`,
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
      isFieldUserOwned(existingFieldsMeta, 'linkedinHandler', !!team.linkedinHandler);

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
      const handleIsUserOwned = isFieldUserOwned(existingFieldsMeta, 'linkedinHandler', !!team.linkedinHandler);
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
