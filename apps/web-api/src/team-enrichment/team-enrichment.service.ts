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
    const enrichment: TeamDataEnrichment = {
      shouldEnrich: true,
      status: EnrichmentStatus.PendingEnrichment,
      isAIGenerated: false,
      fields: {},
    };

    await this.prisma.team.update({
      where: { uid: teamUid },
      data: { dataEnrichment: enrichment as any },
    });

    this.logger.log(`Marked team ${teamUid} for enrichment`);
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

  async enrichTeam(teamUid: string): Promise<void> {
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

    const website = team.website;
    if (!website) {
      await this.updateEnrichmentStatus(
        teamUid,
        team.dataEnrichment,
        EnrichmentStatus.FailedToEnrich,
        'Team has no website — cannot enrich without a website'
      );
      this.logger.warn(`Team ${teamUid} (${team.name}) has no website, skipping enrichment`);
      return;
    }

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

      // Determine which fields to update (only null/empty fields)
      const updateData: Prisma.TeamUpdateInput = {};
      const enrichedFields: Partial<Record<EnrichableField, FieldEnrichmentStatus>> = {};

      for (const field of ENRICHABLE_TEAM_FIELDS) {
        const currentValue = team[field];
        const newValue = aiResponse[field];

        if (!currentValue || currentValue.trim() === '') {
          if (newValue) {
            (updateData as any)[field] = newValue;
            enrichedFields[field] = FieldEnrichmentStatus.Enriched;
          } else {
            enrichedFields[field] = FieldEnrichmentStatus.CannotEnrich;
          }
        }
      }

      // Handle industryTags (many-to-many) — only if team has none
      this.logger.debug(
        `Team ${teamUid}: current industryTags count = ${
          team.industryTags.length
        }, AI returned = [${aiResponse.industryTags.join(', ')}]`
      );
      if (team.industryTags.length === 0) {
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
            enrichedFields.industryTags = FieldEnrichmentStatus.Enriched;
          } else {
            enrichedFields.industryTags = FieldEnrichmentStatus.CannotEnrich;
          }
        } else {
          enrichedFields.industryTags = FieldEnrichmentStatus.CannotEnrich;
        }
      } else {
        this.logger.log(
          `Team ${teamUid}: skipping industryTags enrichment — team already has ${team.industryTags.length} tags`
        );
      }

      // Handle investmentFocus (String[] on InvestorProfile) — only if empty
      const currentFocus = team.investorProfile?.investmentFocus || [];
      this.logger.debug(
        `Team ${teamUid}: current investmentFocus count = ${
          currentFocus.length
        }, AI returned = [${aiResponse.investmentFocus.join(', ')}]`
      );
      if (currentFocus.length === 0) {
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
          enrichedFields.investmentFocus = FieldEnrichmentStatus.Enriched;
        } else {
          enrichedFields.investmentFocus = FieldEnrichmentStatus.CannotEnrich;
        }
      }

      // Handle logo via OG tag scraping
      if (!team.logoUid) {
        this.logger.log(`Attempting logo fetch for team ${teamUid} (${team.name}) from website: ${team.website}`);
        const logoResult = await this.aiService.fetchLogoFromWebsite(team.name, team.website);

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
      } else {
        this.logger.log(`Team ${teamUid} (${team.name}) already has a logo, skipping logo fetch`);
      }

      const hasUpdates = Object.keys(enrichedFields).length > 0 || updateData.logo;

      // Build enrichment metadata
      const enrichment: TeamDataEnrichment = {
        shouldEnrich: false,
        status: hasUpdates ? EnrichmentStatus.Enriched : EnrichmentStatus.Enriched,
        isAIGenerated: Object.keys(enrichedFields).length > 0,
        enrichedAt: new Date().toISOString(),
        enrichedBy: 'system-cron',
        fields: enrichedFields,
      };

      // Update team with enriched data + metadata
      await this.prisma.team.update({
        where: { uid: teamUid },
        data: {
          ...updateData,
          dataEnrichment: enrichment as any,
        },
      });

      this.logger.log(`Enriched team ${teamUid} (${team.name}): ${Object.keys(enrichedFields).length} fields updated`);
    } catch (error) {
      this.logger.error(`Failed to enrich team ${teamUid} (${team.name}): ${error.message}`, error.stack);
      await this.updateEnrichmentStatus(teamUid, team.dataEnrichment, EnrichmentStatus.FailedToEnrich, error.message);
    }
  }

  async triggerEnrichmentForAllPending(): Promise<{ total: number; enriched: number; failed: number }> {
    const teams = await this.findTeamsPendingEnrichment();
    this.logger.log(`Manual trigger: found ${teams.length} teams pending enrichment`);

    let enriched = 0;
    let failed = 0;

    for (const team of teams) {
      try {
        await this.enrichTeam(team.uid);
        enriched++;
      } catch (error) {
        this.logger.error(`Failed to enrich team ${team.uid} (${team.name}): ${error.message}`, error.stack);
        failed++;
      }
    }

    return { total: teams.length, enriched, failed };
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
