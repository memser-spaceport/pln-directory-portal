import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { RecommendationsService } from './recommendations.service';
import { CreateRecommendationRunRequest } from 'libs/contracts/src/schema/recommendations';

@Injectable()
export class RecommendationsJob {
  private readonly recommendationIntervalMs = 14 * 24 * 60 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private logger: LogService,
    private recommendationsService: RecommendationsService
  ) {}

  /**
   * Checks if a member has any notification settings configured
   */
  private hasNotificationSettings(member: any): boolean {
    return !!(
      member.notificationSetting?.byFocusArea ||
      member.notificationSetting?.byFundingStage ||
      member.notificationSetting?.byRole ||
      member.notificationSetting?.byTechnology ||
      member.notificationSetting?.byIndustryTag ||
      member.notificationSetting?.byKeyword
    );
  }

  /**
   * Daily job that runs at 9:00 AM UTC to send example emails
   * Sends example emails to members who:
   * - Are subscribed and have no settings configured
   * - Haven't received an example email yet (exampleSent = false)
   */
  @Cron('0 9 * * *', {
    name: 'daily-example-emails',
    timeZone: 'UTC',
  })
  async sendExampleEmails() {
    if (process.env.IS_RECOMMENDATIONS_ENABLED !== 'true') {
      this.logger.info('Skipping example emails as recommendations are disabled');
      return;
    }

    this.logger.info('Starting daily example emails job');

    try {
      const allMembers = await this.recommendationsService.loadRecommendationMembersInChunks(500);
      const membersWithRecommendationsEnabled =
        await this.recommendationsService.getMembersWithEnabledRecommendations();

      this.logger.info(`Found ${membersWithRecommendationsEnabled.length} members eligible for example emails`);

      let successCount = 0;
      let errorCount = 0;

      for (const member of membersWithRecommendationsEnabled) {
        try {
          const hasSomeSettings = this.hasNotificationSettings(member);

          // Skip if member has settings configured
          if (hasSomeSettings) {
            continue;
          }

          // Skip if member already received an example email
          if (member.notificationSetting?.exampleSent) {
            continue;
          }

          // Send example email
          const createDto: CreateRecommendationRunRequest = {
            targetMemberUid: member.uid,
          };

          const recommendationRun = await this.recommendationsService.createRecommendationRun(createDto, allMembers);

          if (recommendationRun.recommendations.length > 0) {
            await this.recommendationsService.sendRecommendations(recommendationRun.uid, {
              approvedRecommendationUids: recommendationRun.recommendations.map((r) => r.uid),
              email: member.email ?? undefined,
              emailSubject: '[Action required] Your Recommendations from PL Network',
              isExample: true,
            });

            // Mark example as sent
            await this.prisma.notificationSetting.update({
              where: { memberUid: member.uid },
              data: {
                exampleSent: true,
                subscribed: false,
              },
            });
          }

          this.logger.info(`Successfully sent example email for member ${member.uid} (${member.name})`);
          successCount++;
        } catch (error) {
          this.logger.error(`Failed to send example email for member ${member.uid}: ${error.message}`);
          errorCount++;
        }
      }

      // Log summary
      this.logger.info(`Daily example emails job completed:`);
      this.logger.info(`- Total members processed: ${membersWithRecommendationsEnabled.length}`);
      this.logger.info(`- Successful emails sent: ${successCount}`);
      this.logger.info(`- Errors: ${errorCount}`);

      // Log to the application log service for monitoring
      this.logger.info(
        `Daily example emails job completed: ${successCount} successful, ${errorCount} errors`,
        'daily-example-emails'
      );
    } catch (error) {
      this.logger.error(`Daily example emails job failed: ${error.message}`, error.stack, 'daily-example-emails');
      throw error;
    }
  }

  /**
   * Bi-monthly job that runs on the 1st and 15th of every month at 9:00 AM UTC
   * Creates recommendation runs for all members with recommendations enabled and settings configured
   */
  @Cron('0 9 1,15 * *', {
    name: 'bi-monthly-recommendations',
    timeZone: 'UTC',
  })
  async generateRecommendations() {
    if (process.env.IS_RECOMMENDATIONS_ENABLED !== 'true') {
      this.logger.info('Skipping recommendations generation as it is disabled');
      return;
    }

    this.logger.info('Starting bi-monthly recommendations generation job');

    try {
      const membersWithRecommendationsEnabled =
        await this.recommendationsService.getMembersWithEnabledRecommendations();
      const allMembers = await this.recommendationsService.loadRecommendationMembersInChunks(500);

      this.logger.info(`Found ${membersWithRecommendationsEnabled.length} members with recommendations enabled`);

      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      for (const member of membersWithRecommendationsEnabled) {
        try {
          const hasSomeSettings = this.hasNotificationSettings(member);

          // Only send regular recommendations if member has settings configured
          if (!hasSomeSettings) {
            this.logger.info(
              `Skipping member ${member.uid} - no settings configured, will be handled by example emails job`
            );
            skippedCount++;
            continue;
          }

          const recentRun = await this.prisma.recommendationNotification.findFirst({
            where: {
              targetMemberUid: member.uid,
              isExample: false,
              sentAt: {
                gte: new Date(Date.now() - this.recommendationIntervalMs),
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          });

          if (recentRun) {
            this.logger.info(`Skipping member ${member.uid} - has recent recommendation run from ${recentRun.sentAt}`);
            skippedCount++;
            continue;
          }

          const createDto: CreateRecommendationRunRequest = {
            targetMemberUid: member.uid,
          };

          const recommendationRun = await this.recommendationsService.createRecommendationRun(createDto, allMembers);

          if (recommendationRun.recommendations.length > 0) {
            await this.recommendationsService.sendRecommendations(recommendationRun.uid, {
              approvedRecommendationUids: recommendationRun.recommendations.map((r) => r.uid),
              email: member.email ?? undefined,
              emailSubject: 'Your Recommendations from PL Network',
            });
          }

          this.logger.info(`Successfully created recommendation run for member ${member.uid} (${member.name})`);
          successCount++;
        } catch (error) {
          this.logger.error(`Failed to create recommendation run for member ${member.uid}: ${error.message}`);
          errorCount++;
        }
      }

      // Log summary
      this.logger.info(`Bi-monthly recommendations job completed:`);
      this.logger.info(`- Total members processed: ${membersWithRecommendationsEnabled.length}`);
      this.logger.info(`- Successful runs created: ${successCount}`);
      this.logger.info(`- Skipped: ${skippedCount}`);
      this.logger.info(`- Errors: ${errorCount}`);

      // Log to the application log service for monitoring
      this.logger.info(
        `Bi-monthly recommendations job completed: ${successCount} successful, ${skippedCount} skipped, ${errorCount} errors`,
        'bi-monthly-recommendations'
      );
    } catch (error) {
      this.logger.error(
        `Bi-monthly recommendations job failed: ${error.message}`,
        error.stack,
        'bi-monthly-recommendations'
      );
      throw error;
    }
  }

  /**
   * Manual trigger method for testing or on-demand execution of regular recommendations
   */
  async triggerRecommendations() {
    this.logger.info('Manually triggering bi-monthly recommendations generation');
    await this.generateRecommendations();
  }

  /**
   * Manual trigger method for testing or on-demand execution of example emails
   */
  async triggerExampleEmails() {
    this.logger.info('Manually triggering daily example emails generation');
    await this.sendExampleEmails();
  }
}
