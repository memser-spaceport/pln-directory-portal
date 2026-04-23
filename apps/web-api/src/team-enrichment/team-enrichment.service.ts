import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { TeamEnrichmentAiService } from './team-enrichment-ai.service';
import {
  ScrapingDogCompanyProfile,
  TeamEnrichmentScrapingDogService,
} from './team-enrichment-scrapingdog.service';
import {
  ENRICHABLE_TEAM_FIELDS,
  EnrichableTeamField,
  EnrichmentSource,
  EnrichmentStatus,
  FieldConfidence,
  FieldEnrichmentMeta,
  FieldEnrichmentStatus,
  FieldMetaKey,
  ForceEnrichmentMode,
  TeamDataEnrichment,
} from './team-enrichment.types';

type FieldsMetaMap = Partial<Record<FieldMetaKey, FieldEnrichmentMeta>>;

function toConfidence(raw: unknown): FieldConfidence | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.toLowerCase();
  if (v === 'high') return FieldConfidence.High;
  if (v === 'medium') return FieldConfidence.Medium;
  if (v === 'low') return FieldConfidence.Low;
  return undefined;
}

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
    const team = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: { dataEnrichment: true },
    });

    const existing = this.parseEnrichmentMeta(team?.dataEnrichment);

    const enrichment: TeamDataEnrichment = {
      ...existing,
      shouldEnrich: true,
      status: EnrichmentStatus.PendingEnrichment,
      isAIGenerated: existing?.isAIGenerated ?? false,
      fieldsMeta: existing?.fieldsMeta ?? {},
    };

    await this.prisma.team.update({
      where: { uid: teamUid },
      data: { dataEnrichment: enrichment as any },
    });

    this.logger.log(`Marked team ${teamUid} for enrichment`);
  }

  async findTeamsEligibleForEnrichment(): Promise<Array<{ uid: string }>> {
    return this.prisma.team.findMany({
      where: {
        isFund: true,
        dataEnrichment: { equals: Prisma.DbNull },
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

  async findTeamsPendingEnrichment(): Promise<
    Array<{
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
      dataEnrichment: any;
    }>
  > {
    return this.prisma.team.findMany({
      where: {
        dataEnrichment: {
          path: ['shouldEnrich'],
          equals: true,
        },
        AND: {
          dataEnrichment: {
            path: ['status'],
            equals: EnrichmentStatus.PendingEnrichment,
          },
        },
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
        logoUid: true,
        dataEnrichment: true,
      },
    });
  }

  async enrichTeam(teamUid: string, enrichedBy = 'system-cron'): Promise<{ status: 'started' | 'in_progress' }> {
    const team = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: { dataEnrichment: true },
    });

    const meta = this.parseEnrichmentMeta(team?.dataEnrichment);
    if (meta?.status === EnrichmentStatus.InProgress) {
      this.logger.warn(`Enrichment already in progress for team ${teamUid}, skipping`);
      return { status: 'in_progress' };
    }

    // Mark as pending before kicking off background work
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
      select: { dataEnrichment: true },
    });
    if (!team) return { status: 'not_found' };

    const existing = this.parseEnrichmentMeta(team.dataEnrichment);
    if (existing?.status === EnrichmentStatus.InProgress) {
      this.logger.warn(`Force-enrichment: already in progress for team ${teamUid}, skipping`);
      return { status: 'in_progress' };
    }

    // Preserve all existing fieldsMeta entries (including Enriched, CannotEnrich, ChangedByUser)
    // so provenance (confidence, source, prior status) is retained as history.
    // doEnrichTeam decides per-field whether to skip or overwrite based on forceOverwrite + status.
    const enrichment: TeamDataEnrichment = {
      ...(existing ?? { isAIGenerated: false }),
      shouldEnrich: true,
      status: EnrichmentStatus.PendingEnrichment,
      isAIGenerated: existing?.isAIGenerated ?? false,
      fieldsMeta: existing?.fieldsMeta ?? {},
    };

    await this.prisma.team.update({
      where: { uid: teamUid },
      data: { dataEnrichment: enrichment as any },
    });

    this.logger.log(`Force-enrichment queued for team ${teamUid} (mode=${mode})`);

    this.doEnrichTeam(teamUid, enrichedBy, { forceOverwrite: mode === 'all' }).catch((err) => {
      this.logger.error(`Background force-enrichment failed for team ${teamUid}: ${err.message}`, err.stack);
    });

    return { status: 'started' };
  }

  async findCompletedTeams(): Promise<Array<{ uid: string }>> {
    const completedStatuses = [
      EnrichmentStatus.Enriched,
      EnrichmentStatus.Reviewed,
      EnrichmentStatus.Approved,
      EnrichmentStatus.FailedToEnrich,
    ];
    return this.prisma.team.findMany({
      where: {
        OR: completedStatuses.map((status) => ({
          dataEnrichment: { path: ['status'], equals: status },
        })),
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
      if (status === 'started') {
        started++;
      } else {
        skipped++;
      }
    }

    return { total: teams.length, started, skipped };
  }

  private async doEnrichTeam(
    teamUid: string,
    enrichedBy: string,
    opts: { forceOverwrite?: boolean } = {}
  ): Promise<void> {
    const forceOverwrite = opts.forceOverwrite === true;
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
        logoUid: true,
        dataEnrichment: true,
        industryTags: { select: { uid: true, title: true } },
        investorProfile: { select: { uid: true, investmentFocus: true } },
      },
    });

    if (!team) {
      this.logger.warn(`Team ${teamUid} not found`);
      return;
    }

    // Mark as in-progress
    await this.updateEnrichmentStatus(teamUid, team.dataEnrichment, EnrichmentStatus.InProgress);

    try {
      // Call AI for enrichment
      const aiResponse = await this.aiService.enrichTeamViaAI(team.name, {
        website: team.website,
        contactMethod: team.contactMethod,
        linkedinHandler: team.linkedinHandler,
        twitterHandler: team.twitterHandler,
        telegramHandler: team.telegramHandler,
        shortDescription: team.shortDescription,
        longDescription: team.longDescription,
      });

      // Preserve existing field statuses from previous enrichment runs
      const existingMeta = this.parseEnrichmentMeta(team.dataEnrichment);
      const existingFieldsMeta = (existingMeta?.fieldsMeta ?? {}) as FieldsMetaMap;

      // Verify entity identity to decide which fields are safe to enrich.
      // Website and logo require high confidence (verified entity).
      // Other fields (descriptions, socials, tags) are enriched regardless — the AI
      // was asked about the exact name, and these fields are usually correct even when the website match fails.
      const hadNoWebsite = !team.website || team.website.trim() === '';
      const isEntityVerified = hadNoWebsite ? this.verifyEntityIdentity(team.name, aiResponse) : true;
      if (!isEntityVerified) {
        this.logger.warn(
          `Team ${teamUid} (${team.name}): entity identity not verified — will skip website and logo, but still enrich other fields`
        );
        // Clear website from AI response so it won't be used for enrichment or logo
        aiResponse.website = null;
        aiResponse.websiteCandidates = [];
      }

      // Determine which fields need enrichment (skip already Enriched ones)
      const updateData: Prisma.TeamUpdateInput = {};
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

        // Never overwrite user-edited fields.
        if (fieldStatus === FieldEnrichmentStatus.ChangedByUser) {
          skipReasons.userEdited.push(field);
          continue;
        }

        const currentValue = team[field];
        const slotIsEmpty = !currentValue || currentValue.trim() === '';

        // User-owned: non-empty value with no prior AI enrichment. Applies in BOTH
        // standard and force modes — force mode must NEVER overwrite user data whose
        // only "crime" is that dataEnrichment was null on a team's first enrichment.
        if (!slotIsEmpty && fieldStatus !== FieldEnrichmentStatus.Enriched) {
          newFieldsMeta[field] = {
            ...existingFieldsMeta[field],
            status: FieldEnrichmentStatus.ChangedByUser,
          };
          skipReasons.userOwned.push(field);
          continue;
        }

        // Standard mode skips already-enriched fields; force mode re-queries them.
        if (!forceOverwrite && fieldStatus === FieldEnrichmentStatus.Enriched) {
          skipReasons.alreadyEnriched.push(field);
          continue;
        }

        // Remaining shapes: slot empty, OR (slot non-empty && Enriched && forceOverwrite).
        const newValue = aiResponse[field];
        if (newValue) {
          (updateData as any)[field] = newValue;
          newFieldsMeta[field] = {
            status: FieldEnrichmentStatus.Enriched,
            confidence: toConfidence(aiResponse.confidence?.[field]),
            source: EnrichmentSource.AI,
          };
          fieldsUpdatedCount++;
        } else if (slotIsEmpty) {
          newFieldsMeta[field] = { status: FieldEnrichmentStatus.CannotEnrich };
          skipReasons.aiCannotEnrich.push(field);
        } else {
          // Force mode + non-empty slot + AI returned null: preserve existing value + meta.
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

      // Handle industryTags — same four-layer check as the scalar loop.
      const tagsStatus = existingFieldsMeta.industryTags?.status;

      if (tagsStatus === FieldEnrichmentStatus.ChangedByUser) {
        // User-controlled — skip entirely.
      } else if (team.industryTags.length > 0 && tagsStatus !== FieldEnrichmentStatus.Enriched) {
        // User-owned: team has tags with no prior AI enrichment. Protect in both modes.
        newFieldsMeta.industryTags = {
          ...existingFieldsMeta.industryTags,
          status: FieldEnrichmentStatus.ChangedByUser,
        };
      } else if (!forceOverwrite && tagsStatus === FieldEnrichmentStatus.Enriched) {
        // Standard mode, already enriched — skip.
      } else {
        // Either team has no tags, or force mode + Enriched — run AI matching.
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
            // Force mode: replace existing tag set; fresh-field mode: team had none, connect is equivalent.
            updateData.industryTags = forceOverwrite
              ? { set: matchedTags.map((t) => ({ uid: t.uid })) }
              : { connect: matchedTags.map((t) => ({ uid: t.uid })) };
            newFieldsMeta.industryTags = {
              status: FieldEnrichmentStatus.Enriched,
              confidence: toConfidence(aiResponse.confidence?.industryTags),
              source: EnrichmentSource.AI,
            };
            fieldsUpdatedCount++;
          } else if (team.industryTags.length === 0) {
            newFieldsMeta.industryTags = { status: FieldEnrichmentStatus.CannotEnrich };
          }
        } else if (team.industryTags.length === 0) {
          newFieldsMeta.industryTags = { status: FieldEnrichmentStatus.CannotEnrich };
        }
      }

      // Handle investmentFocus — same four-layer check.
      const currentFocus = team.investorProfile?.investmentFocus || [];
      const focusStatus = existingFieldsMeta.investmentFocus?.status;

      if (focusStatus === FieldEnrichmentStatus.ChangedByUser) {
        // User-controlled — skip entirely.
      } else if (currentFocus.length > 0 && focusStatus !== FieldEnrichmentStatus.Enriched) {
        // User-owned: team has focus tags with no prior AI enrichment. Protect in both modes.
        newFieldsMeta.investmentFocus = {
          ...existingFieldsMeta.investmentFocus,
          status: FieldEnrichmentStatus.ChangedByUser,
        };
      } else if (!forceOverwrite && focusStatus === FieldEnrichmentStatus.Enriched) {
        // Standard mode, already enriched — skip.
      } else {
        // Either team has no focus, or force mode + Enriched — run AI matching.
        this.logger.debug(`Team ${teamUid}: AI returned investmentFocus = [${aiResponse.investmentFocus.join(', ')}]`);
        if (aiResponse.investmentFocus.length > 0) {
          if (team.investorProfile) {
            await this.prisma.investorProfile.update({
              where: { uid: team.investorProfile.uid },
              data: { investmentFocus: aiResponse.investmentFocus },
            });
          } else {
            await this.prisma.investorProfile.create({
              data: {
                investmentFocus: aiResponse.investmentFocus,
                team: { connect: { uid: teamUid } },
              },
            });
          }
          newFieldsMeta.investmentFocus = {
            status: FieldEnrichmentStatus.Enriched,
            confidence: toConfidence(aiResponse.confidence?.investmentFocus),
            source: EnrichmentSource.AI,
          };
          fieldsUpdatedCount++;
        } else if (currentFocus.length === 0) {
          newFieldsMeta.investmentFocus = { status: FieldEnrichmentStatus.CannotEnrich };
        }
      }

      // Handle logo via OG tag scraping — only from a verified website
      // Do NOT use websiteCandidates for logo since they are unverified and may belong to a different entity
      const effectiveWebsite = team.website || aiResponse.website || null;
      if (!team.logoUid && effectiveWebsite) {
        this.logger.log(`Attempting logo fetch for team ${teamUid} (${team.name}) from website: ${effectiveWebsite}`);
        const logoResult = await this.aiService.fetchLogoFromWebsite(team.name, effectiveWebsite);

        if (logoResult) {
          this.logger.log(`Logo metadata found for team ${teamUid} (${team.name}): ${logoResult.logoUrl}`);
          try {
            const filename = `team-enrichment-${teamUid}-${Date.now()}.png`;
            const multerFile = await this.aiService.downloadImageAsMulterFile(logoResult.logoUrl, filename);
            const s3Url = await this.fileUploadService.storeImageFiles([multerFile]);

            if (s3Url) {
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
              updateData.logo = { connect: { uid: image.uid } };
              newFieldsMeta.logo = {
                status: FieldEnrichmentStatus.Enriched,
                confidence: FieldConfidence.Medium,
                source: EnrichmentSource.OpenGraph,
              };
              this.logger.log(`Logo uploaded successfully for team ${teamUid} (${team.name}), image uid: ${image.uid}`);
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
      } else if (team.logoUid) {
        this.logger.log(`Team ${teamUid} (${team.name}) already has a logo, skipping logo fetch`);
        // Logo predates enrichment and has no meta entry — treat as user-owned.
        if (!existingFieldsMeta.logo) {
          newFieldsMeta.logo = { status: FieldEnrichmentStatus.ChangedByUser };
        }
      } else {
        this.logger.log(`Team ${teamUid} (${team.name}): no verified website available, skipping logo fetch`);
        newFieldsMeta.logo = { status: FieldEnrichmentStatus.CannotEnrich };
      }

      // ScrapingDog fallback — only when primary enrichment left high-value gaps AND we have a LinkedIn handle
      const scrapingDogMeta = await this.maybeEnrichViaScrapingDog({
        teamUid,
        team,
        existingFieldsMeta,
        aiLinkedinHandler: aiResponse.linkedinHandler,
        updateData,
        newFieldsMeta,
      });

      // Merge field metadata per-field. Undefined keys on the fresh entry don't clobber
      // prior provenance (confidence, source), so history is preserved when the new AI
      // run doesn't re-supply them. Entries not touched this run remain as-is.
      const mergedFieldsMeta: FieldsMetaMap = { ...existingFieldsMeta };
      for (const [field, fresh] of Object.entries(newFieldsMeta) as Array<
        [FieldMetaKey, FieldEnrichmentMeta | undefined]
      >) {
        if (!fresh) continue;
        const prior = mergedFieldsMeta[field];
        const freshDefined = Object.fromEntries(
          Object.entries(fresh).filter(([, v]) => v !== undefined)
        ) as Partial<FieldEnrichmentMeta>;
        mergedFieldsMeta[field] = {
          ...(prior ?? {}),
          ...freshDefined,
        } as FieldEnrichmentMeta;
      }

      // Build enrichment metadata
      const enrichment: TeamDataEnrichment = {
        shouldEnrich: false,
        status: EnrichmentStatus.Enriched,
        isAIGenerated: Object.values(mergedFieldsMeta).some((m) => m.status === FieldEnrichmentStatus.Enriched),
        enrichedAt: new Date().toISOString(),
        enrichedBy,
        aiModel: this.aiService.getModelName(),
        fieldsMeta: mergedFieldsMeta,
        ...(scrapingDogMeta ? { scrapingDog: scrapingDogMeta } : {}),
      };

      // Update team with enriched data + metadata
      await this.prisma.team.update({
        where: { uid: teamUid },
        data: {
          ...updateData,
          dataEnrichment: enrichment as any,
        },
      });

      this.logger.log(`Enriched team ${teamUid} (${team.name}): ${fieldsUpdatedCount} new fields updated`);
    } catch (error) {
      this.logger.error(`Failed to enrich team ${teamUid} (${team.name}): ${error.message}`, error.stack);
      await this.updateEnrichmentStatus(teamUid, team.dataEnrichment, EnrichmentStatus.FailedToEnrich, error.message);
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
      if (status === 'started') {
        started++;
      } else {
        skipped++;
      }
    }

    return { total: teams.length, started, skipped };
  }

  async handleUserFieldChange(
    teamUid: string,
    changedFieldValues: Record<string, unknown>,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const db = tx || this.prisma;

    const team = await db.team.findUnique({
      where: { uid: teamUid },
      select: { dataEnrichment: true },
    });

    const meta = this.parseEnrichmentMeta(team?.dataEnrichment);
    if (!meta || !meta.isAIGenerated) return;
    if (!meta.fieldsMeta) meta.fieldsMeta = {};

    const flipped: string[] = [];
    for (const [field, newValue] of Object.entries(changedFieldValues)) {
      if (!ENRICHABLE_TEAM_FIELDS.includes(field as EnrichableTeamField)) continue;
      const currentStatus = meta.fieldsMeta[field as EnrichableTeamField]?.status;

      // AI previously filled this field; user just edited it → flip to ChangedByUser.
      if (currentStatus === FieldEnrichmentStatus.Enriched) {
        meta.fieldsMeta[field as EnrichableTeamField] = {
          ...meta.fieldsMeta[field as EnrichableTeamField],
          status: FieldEnrichmentStatus.ChangedByUser,
        };
        flipped.push(field);
        continue;
      }

      // AI couldn't enrich; user is supplying a non-empty value → flip to ChangedByUser
      // so a later force-enrich run won't overwrite it.
      if (
        currentStatus === FieldEnrichmentStatus.CannotEnrich &&
        typeof newValue === 'string' &&
        newValue.trim() !== ''
      ) {
        meta.fieldsMeta[field as EnrichableTeamField] = {
          ...meta.fieldsMeta[field as EnrichableTeamField],
          status: FieldEnrichmentStatus.ChangedByUser,
        };
        flipped.push(field);
      }
    }

    if (flipped.length > 0) {
      await db.team.update({
        where: { uid: teamUid },
        data: { dataEnrichment: meta as any },
      });
      this.logger.log(`Marked fields as ChangedByUser for team ${teamUid}: ${flipped.join(', ')}`);
    }
  }

  async reviewEnrichment(teamUid: string, action: 'Reviewed' | 'Approved', reviewerEmail: string): Promise<void> {
    const team = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: { dataEnrichment: true },
    });

    const meta = this.parseEnrichmentMeta(team?.dataEnrichment);
    if (!meta) {
      this.logger.warn(`No enrichment data found for team ${teamUid}`);
      return;
    }

    meta.status = action === 'Approved' ? EnrichmentStatus.Approved : EnrichmentStatus.Reviewed;
    meta.reviewedAt = new Date().toISOString();
    meta.reviewedBy = reviewerEmail;

    await this.prisma.team.update({
      where: { uid: teamUid },
      data: { dataEnrichment: meta as any },
    });

    this.logger.log(`Enrichment for team ${teamUid} marked as ${action} by ${reviewerEmail}`);
  }

  private async maybeEnrichViaScrapingDog(ctx: {
    teamUid: string;
    team: {
      name: string;
      website: string | null;
      shortDescription: string | null;
      longDescription: string | null;
      moreDetails: string | null;
      logoUid: string | null;
      linkedinHandler: string | null;
      industryTags: Array<{ uid: string; title: string }>;
    };
    existingFieldsMeta: FieldsMetaMap;
    aiLinkedinHandler: string | null;
    updateData: Prisma.TeamUpdateInput;
    newFieldsMeta: FieldsMetaMap;
  }): Promise<TeamDataEnrichment['scrapingDog'] | null> {
    const { teamUid, team, existingFieldsMeta, aiLinkedinHandler, updateData, newFieldsMeta } = ctx;

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

    const hasLogoGap = !team.logoUid && !(updateData as any).logo;
    const hasWebsiteGap = !team.website && !(updateData as any).website;
    const hasShortDescGap = !team.shortDescription && !(updateData as any).shortDescription;
    const hasLongDescGap = !team.longDescription && !(updateData as any).longDescription;
    const hasMoreDetailsGap = !team.moreDetails && !(updateData as any).moreDetails;
    const hasIndustryTagsGap =
      existingFieldsMeta.industryTags?.status !== FieldEnrichmentStatus.Enriched &&
      team.industryTags.length === 0 &&
      !(updateData as any).industryTags;

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

    this.logger.log(`Team ${teamUid} (${team.name}): invoking ScrapingDog for handle "${handle}"`);
    const profile = await this.scrapingDogService.fetchCompanyProfile(handle);
    if (!profile) return null;

    if (!this.verifyScrapingDogEntity(team.name, profile)) {
      this.logger.warn(
        `Team ${teamUid} (${team.name}): ScrapingDog profile name "${profile.companyName}" / "${profile.universalNameId}" does not match, discarding`
      );
      return null;
    }

    const filledFields: string[] = [];

    if (hasWebsiteGap && profile.website) {
      (updateData as any).website = profile.website;
      markSdField('website');
      filledFields.push('website');
    }

    if (hasShortDescGap && profile.tagline) {
      (updateData as any).shortDescription = this.aiService.truncateString(profile.tagline, 200);
      markSdField('shortDescription');
      filledFields.push('shortDescription');
    }

    if (hasLongDescGap && profile.about) {
      (updateData as any).longDescription = this.aiService.truncateString(profile.about, 1000);
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
        (updateData as any).moreDetails = parts.join('\n');
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
          (updateData as any).industryTags = { connect: matchedTags.map((t) => ({ uid: t.uid })) };
          markSdField('industryTags');
          filledFields.push('industryTags');
        }
      }
    }

    if (hasLogoGap && profile.profilePhoto) {
      try {
        const filename = `team-enrichment-${teamUid}-scrapingdog-${Date.now()}.png`;
        const multerFile = await this.aiService.downloadImageAsMulterFile(profile.profilePhoto, filename);
        const s3Url = await this.fileUploadService.storeImageFiles([multerFile]);
        if (s3Url) {
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
          (updateData as any).logo = { connect: { uid: image.uid } };
          markSdField('logo');
          filledFields.push('logo');
          this.logger.log(`Team ${teamUid} (${team.name}): logo set from ScrapingDog, image uid: ${image.uid}`);
        }
      } catch (error) {
        this.logger.warn(`Team ${teamUid} (${team.name}): ScrapingDog logo download/upload failed: ${error.message}`);
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

    this.logger.log(
      `Team ${teamUid} (${team.name}): ScrapingDog filled [${filledFields.join(', ')}]`
    );

    return {
      used: true,
      fetchedAt: new Date().toISOString(),
      fields: filledFields,
      linkedinInternalId: profile.linkedinInternalId,
    };
  }

  private verifyScrapingDogEntity(teamName: string, profile: ScrapingDogCompanyProfile): boolean {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim();
    const normalizedTeam = normalize(teamName);
    const candidates = [profile.companyName, profile.universalNameId]
      .filter((v): v is string => !!v)
      .map((v) => normalize(v));
    if (candidates.length === 0) return false;
    return candidates.some((c) => c === normalizedTeam || c.includes(normalizedTeam) || normalizedTeam.includes(c));
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

    // Signal 1: Website owner name matches the team name
    // Must be a substring match (contiguous words), NOT just individual word presence.
    // e.g., "Arbitrum Ventures Program" matches "Arbitrum Ventures" (contiguous substring)
    // but "Arbitrum Gaming Ventures" does NOT match "Arbitrum Ventures" (different entity)
    let websiteNameMatch = false;
    if (aiResponse.websiteOwnerName) {
      const normalizedOwner = normalize(aiResponse.websiteOwnerName);
      websiteNameMatch = normalizedOwner.includes(normalizedTeamName) || normalizedTeamName.includes(normalizedOwner);
    }

    // Signal 2: Descriptions mention the exact team name as a standalone phrase
    // We check that the team name appears in the description and is NOT part of a longer entity name
    // e.g., "Arbitrum Ventures" in "Arbitrum Gaming Ventures focuses on..." is NOT a match
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

    // Signal 3: Sources contain URLs that reference the team name
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

    // If website owner name matches, we trust it (strongest signal)
    if (websiteNameMatch) return true;

    // Otherwise need at least 2 of 3 signals to confirm identity
    if (matchCount >= 2) return true;

    // If description matches with exact entity name, it's a decent signal on its own
    if (descriptionMatch) return true;

    return false;
  }

  /**
   * Checks if a text contains the entity name as a standalone phrase,
   * NOT as part of a longer entity name.
   * e.g., "arbitrum ventures is a fund" → true for "arbitrum ventures"
   *        "arbitrum gaming ventures is a fund" → false for "arbitrum ventures"
   */
  private containsExactEntityName(text: string, entityName: string): boolean {
    let startIndex = 0;
    while (true) {
      const idx = text.indexOf(entityName, startIndex);
      if (idx === -1) return false;

      // Check what comes before and after the match
      const charBefore = idx > 0 ? text[idx - 1] : ' ';
      const charAfter = idx + entityName.length < text.length ? text[idx + entityName.length] : ' ';

      // Must be at a word boundary
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
        // It's at a word boundary, but we also need to check the surrounding context
        // isn't forming a longer entity name. Check if the word before or after is a capitalized
        // word that could be part of a compound entity name.
        // Since text is already normalized (lowercase), we check for adjacent name-like words

        // Get the word right before the entity name
        const textBefore = text.substring(0, idx).trim();
        const wordBefore = textBefore.split(/\s+/).pop() || '';

        // Get the word right after the entity name
        const textAfter = text.substring(idx + entityName.length).trim();
        const wordAfter = textAfter.split(/\s+/)[0] || '';

        // Words that suggest a different entity when prepended/appended
        // e.g., "gaming" before "ventures" in "arbitrum gaming ventures"
        const entityExtendingWords = ['gaming', 'capital', 'labs', 'studio', 'studios', 'digital', 'global', 'network'];

        // Check if the word before is NOT an entity-extending word
        const beforeSafe = !entityExtendingWords.includes(wordBefore);
        // Check if the word after is NOT an entity-extending word (but allow common suffixes)
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
    currentMeta: any,
    status: EnrichmentStatus,
    errorMessage?: string
  ): Promise<void> {
    const meta = this.parseEnrichmentMeta(currentMeta) || {
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

    await this.prisma.team.update({
      where: { uid: teamUid },
      data: { dataEnrichment: meta as any },
    });
  }
}
