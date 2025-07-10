import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { NotificationService } from '../utils/notification/notification.service';
import { AccessLevel } from 'libs/contracts/src/schema/admin-member';

@Injectable()
export class OnboardingRemindersJob {
  constructor(
    private prisma: PrismaService,
    private logger: LogService,
    private notificationService: NotificationService
  ) {}

  /**
   * TODO: Move to EKS jobs when notification service is moved to EKS
   * Daily job that runs at 10:00 AM UTC to send onboarding reminder emails
   * Sends reminder emails to members who:
   * - Have not provided any profile data (ignored onboarding)
   * - Haven't received 4 onboarding emails yet (onboardingAttempts < 4)
   * - Meet the timing requirements for subsequent attempts:
   *   - 2nd attempt: 48 hours after first onboarding email
   *   - 3rd attempt: 1 week after 2nd attempt
   *   - 4th attempt: 2 weeks after 3rd attempt
   */
  @Cron('0 10 * * *', {
    name: 'daily-onboarding-reminders',
    timeZone: 'UTC',
  })
  async sendOnboardingReminders() {
    this.logger.info('Starting daily onboarding reminders job');

    try {
      const members = await this.prisma.member.findMany({
        where: {
          accessLevel: AccessLevel.L4,
          deletedAt: null,
          bio: null,
          githubHandler: null,
          linkedinHandler: null,
          twitterHandler: null,
          discordHandler: null,
          telegramHandler: null,
          imageUid: null,
          locationUid: null,
          officeHours: null,
          skills: {
            none: {},
          },
          notificationSetting: {
            onboardingAttempts: {
              lt: 4,
              gte: 1,
            },
          },
        },
        include: {
          notificationSetting: true,
          skills: true,
          image: true,
          location: true,
        },
      });

      this.logger.info(`Found ${members.length} members with empty profiles for onboarding reminders`);

      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      for (const member of members) {
        try {
          const notificationSetting = member.notificationSetting;
          if (!notificationSetting) {
            this.logger.info(`Skipping member ${member.uid} - no notification settings`);
            skippedCount++;
            continue;
          }

          const currentAttempts = notificationSetting.onboardingAttempts || 1;
          const lastOnboardingSentAt = notificationSetting.lastOnboardingSentAt;

          // Skip if already sent 4 attempts (1 initial + 3 reminders)
          if (currentAttempts >= 4) {
            this.logger.info(`Skipping member ${member.uid} - already sent ${currentAttempts} onboarding emails`);
            skippedCount++;
            continue;
          }

          // Check timing requirements for subsequent attempts
          if (lastOnboardingSentAt) {
            const now = new Date();
            const timeSinceLastEmail = now.getTime() - lastOnboardingSentAt.getTime();
            const daysSinceLastEmail = timeSinceLastEmail / (1000 * 60 * 60 * 24);

            // 2nd attempt (1st reminder): must be at least 48 hours after 1st attempt
            if (currentAttempts === 1 && daysSinceLastEmail < 2) {
              this.logger.info(
                `Skipping member ${member.uid} - 2nd attempt too soon (${daysSinceLastEmail.toFixed(
                  1
                )} days since last email)`
              );
              skippedCount++;
              continue;
            }

            // 3rd attempt (2nd reminder): must be at least 7 days after 2nd attempt
            if (currentAttempts === 2 && daysSinceLastEmail < 7) {
              this.logger.info(
                `Skipping member ${member.uid} - 3rd attempt too soon (${daysSinceLastEmail.toFixed(
                  1
                )} days since last email)`
              );
              skippedCount++;
              continue;
            }

            // 4th attempt (3rd reminder): must be at least 14 days after 3rd attempt
            if (currentAttempts === 3 && daysSinceLastEmail < 14) {
              this.logger.info(
                `Skipping member ${member.uid} - 4th attempt too soon (${daysSinceLastEmail.toFixed(
                  1
                )} days since last email)`
              );
              skippedCount++;
              continue;
            }
          }

          // Determine subject based on attempt number
          let subject = "Reminder: Complete your profile on Protocol Lab's LabOS";
          if (currentAttempts === 3) {
            subject = "Final Reminder: Complete your profile on Protocol Lab's LabOS";
          }

          // Send onboarding reminder email
          await this.notificationService.notifyForOnboarding(member.name, member.email || '', subject);

          // Update onboarding email tracking
          await this.prisma.notificationSetting.update({
            where: { memberUid: member.uid },
            data: {
              onboardingAttempts: currentAttempts + 1,
              lastOnboardingSentAt: new Date(),
            },
          });

          this.logger.info(
            `Successfully sent onboarding reminder #${currentAttempts + 1} for member ${member.uid} (${member.name})`
          );
          successCount++;
        } catch (error) {
          this.logger.error(`Failed to send onboarding reminder for member ${member.uid}: ${error.message}`);
          errorCount++;
        }
      }

      // Log summary
      this.logger.info(`Daily onboarding reminders job completed:`);
      this.logger.info(`- Total members processed: ${members.length}`);
      this.logger.info(`- Successful emails sent: ${successCount}`);
      this.logger.info(`- Skipped: ${skippedCount}`);
      this.logger.info(`- Errors: ${errorCount}`);

      // Log to the application log service for monitoring
      this.logger.info(
        `Daily onboarding reminders job completed: ${successCount} successful, ${skippedCount} skipped, ${errorCount} errors`,
        'daily-onboarding-reminders'
      );
    } catch (error) {
      this.logger.error(
        `Daily onboarding reminders job failed: ${error.message}`,
        error.stack,
        'daily-onboarding-reminders'
      );
      throw error;
    }
  }
}
