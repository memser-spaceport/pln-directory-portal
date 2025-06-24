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
   * Bi-monthly job that runs on the 1st and 15th of every month at 9:00 AM UTC
   * Creates recommendation runs for all members with recommendations enabled
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

      for (const member of membersWithRecommendationsEnabled) {
        try {
          const recentRun = await this.prisma.recommendationNotification.findFirst({
            where: {
              targetMemberUid: member.uid,
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
              emailSubject: 'Your Recommended Connections from PL Network',
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
      this.logger.info(`- Errors: ${errorCount}`);

      // Log to the application log service for monitoring
      this.logger.info(
        `Bi-monthly recommendations job completed: ${successCount} successful, ${errorCount} errors`,
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
   * Manual trigger method for testing or on-demand execution
   */
  async triggerRecommendations() {
    this.logger.info('Manually triggering bi-monthly recommendations generation');
    await this.generateRecommendations();
  }
}
