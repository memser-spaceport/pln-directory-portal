import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { TeamEnrichmentAiService } from './team-enrichment-ai.service';
import {
  ENRICHABLE_TEAM_FIELDS,
  EnrichableField,
  EnrichableTeamField,
  EnrichmentStatus,
  FieldEnrichmentStatus,
  TeamDataEnrichment,
} from './team-enrichment.types';

@Injectable()
export class TeamEnrichmentService {
  private readonly logger = new Logger(TeamEnrichmentService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileUploadService: FileUploadService,
    private readonly aiService: TeamEnrichmentAiService
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
      fields: existing?.fields ?? {},
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

  private async doEnrichTeam(teamUid: string, enrichedBy: string): Promise<void> {
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
      const existingFields = existingMeta?.fields || {};

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
      const newFields: Partial<Record<EnrichableField, FieldEnrichmentStatus>> = {};
      let fieldsUpdatedCount = 0;

      for (const field of ENRICHABLE_TEAM_FIELDS) {
        // Skip fields already successfully enriched
        if (existingFields[field] === FieldEnrichmentStatus.Enriched) continue;

        const currentValue = team[field];
        const newValue = aiResponse[field];

        if (!currentValue || currentValue.trim() === '') {
          if (newValue) {
            (updateData as any)[field] = newValue;
            newFields[field] = FieldEnrichmentStatus.Enriched;
            fieldsUpdatedCount++;
          } else {
            newFields[field] = FieldEnrichmentStatus.CannotEnrich;
          }
        }
      }

      // Handle industryTags — skip if already enriched
      if (existingFields.industryTags !== FieldEnrichmentStatus.Enriched && team.industryTags.length === 0) {
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
            updateData.industryTags = { connect: matchedTags.map((t) => ({ uid: t.uid })) };
            newFields.industryTags = FieldEnrichmentStatus.Enriched;
            fieldsUpdatedCount++;
          } else {
            newFields.industryTags = FieldEnrichmentStatus.CannotEnrich;
          }
        } else {
          newFields.industryTags = FieldEnrichmentStatus.CannotEnrich;
        }
      }

      // Handle investmentFocus — skip if already enriched
      const currentFocus = team.investorProfile?.investmentFocus || [];
      if (existingFields.investmentFocus !== FieldEnrichmentStatus.Enriched && currentFocus.length === 0) {
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
          newFields.investmentFocus = FieldEnrichmentStatus.Enriched;
          fieldsUpdatedCount++;
        } else {
          newFields.investmentFocus = FieldEnrichmentStatus.CannotEnrich;
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
              this.logger.log(`Logo uploaded successfully for team ${teamUid} (${team.name}), image uid: ${image.uid}`);
            } else {
              this.logger.warn(`Logo upload returned no URL for team ${teamUid} (${team.name})`);
            }
          } catch (logoError) {
            this.logger.warn(`Failed to download/upload logo for team ${teamUid} (${team.name}): ${logoError.message}`);
          }
        } else {
          this.logger.log(`No logo found in website metadata for team ${teamUid} (${team.name})`);
        }
      } else if (team.logoUid) {
        this.logger.log(`Team ${teamUid} (${team.name}) already has a logo, skipping logo fetch`);
      } else {
        this.logger.log(`Team ${teamUid} (${team.name}): no verified website available, skipping logo fetch`);
      }

      // Merge new field statuses with existing ones (preserve previous Enriched/ChangedByUser)
      const mergedFields: Partial<Record<EnrichableField, FieldEnrichmentStatus>> = {
        ...existingFields,
        ...newFields,
      };

      // Build enrichment metadata
      const enrichment: TeamDataEnrichment = {
        shouldEnrich: false,
        status: EnrichmentStatus.Enriched,
        isAIGenerated: Object.values(mergedFields).some((s) => s === FieldEnrichmentStatus.Enriched),
        enrichedAt: new Date().toISOString(),
        enrichedBy,
        aiModel: this.aiService.getModelName(),
        fields: mergedFields,
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

  async handleUserFieldChange(teamUid: string, changedFields: string[], tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx || this.prisma;

    const team = await db.team.findUnique({
      where: { uid: teamUid },
      select: { dataEnrichment: true },
    });

    const meta = this.parseEnrichmentMeta(team?.dataEnrichment);
    if (!meta || !meta.isAIGenerated) return;

    let updated = false;
    for (const field of changedFields) {
      if (
        ENRICHABLE_TEAM_FIELDS.includes(field as EnrichableTeamField) &&
        meta.fields[field as EnrichableTeamField] === FieldEnrichmentStatus.Enriched
      ) {
        meta.fields[field as EnrichableTeamField] = FieldEnrichmentStatus.ChangedByUser;
        updated = true;
      }
    }

    if (updated) {
      await db.team.update({
        where: { uid: teamUid },
        data: { dataEnrichment: meta as any },
      });
      this.logger.log(`Marked fields as ChangedByUser for team ${teamUid}: ${changedFields.join(', ')}`);
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
      fields: {},
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
