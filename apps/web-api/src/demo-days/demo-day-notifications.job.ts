import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../shared/prisma.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { DemoDayStatus, PushNotificationCategory } from '@prisma/client';

@Injectable()
export class DemoDayNotificationsJob {
  private readonly logger = new Logger(DemoDayNotificationsJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotificationsService: PushNotificationsService
  ) {}

  /**
   * Hourly job that runs to check and send scheduled demo day notifications:
   * - "Starting Soon" notifications (X hours before startDate)
   * - "Closing Soon" notifications (X hours before endDate)
   *
   * Duplicate prevention is handled by checking for existing notifications
   * in the PushNotification table with matching metadata.
   */
  @Cron('0 * * * *', {
    name: 'hourly-demo-day-notifications',
    timeZone: 'UTC',
  })
  async sendScheduledNotifications() {
    this.logger.log('Starting hourly demo day scheduled notifications job');

    try {
      const demoDays = await this.prisma.demoDay.findMany({
        where: {
          isDeleted: false,
          notificationsEnabled: true,
          status: {
            in: [
              DemoDayStatus.UPCOMING,
              DemoDayStatus.REGISTRATION_OPEN,
              DemoDayStatus.EARLY_ACCESS,
              DemoDayStatus.ACTIVE,
            ],
          },
        },
        select: {
          uid: true,
          title: true,
          slugURL: true,
          startDate: true,
          endDate: true,
          status: true,
          notifyBeforeStartHours: true,
          notifyBeforeEndHours: true,
        },
      });

      this.logger.log(`Found ${demoDays.length} demo days with notifications enabled`);

      let startingSoonSent = 0;
      let closingSoonSent = 0;
      let errors = 0;

      const now = new Date();

      for (const demoDay of demoDays) {
        try {
          // Check "Starting Soon" notification
          if (demoDay.notifyBeforeStartHours) {
            const notifyBeforeHours = demoDay.notifyBeforeStartHours;
            const startDate = new Date(demoDay.startDate);
            const notificationDate = new Date(startDate);
            notificationDate.setHours(notificationDate.getHours() - notifyBeforeHours);

            // Check if we're at or past the notification date but before the start date
            if (now >= notificationDate && now < startDate) {
              const sent = await this.sendStartingSoonNotification(demoDay);
              if (sent) startingSoonSent++;
            }
          }

          // Check "Closing Soon" notification
          if (demoDay.notifyBeforeEndHours) {
            const notifyBeforeHours = demoDay.notifyBeforeEndHours;
            const endDate = new Date(demoDay.endDate);
            const notificationDate = new Date(endDate);
            notificationDate.setHours(notificationDate.getHours() - notifyBeforeHours);

            // Check if we're at or past the notification date but before the end date
            if (now >= notificationDate && now < endDate) {
              const sent = await this.sendClosingSoonNotification(demoDay);
              if (sent) closingSoonSent++;
            }
          }
        } catch (error) {
          this.logger.error(`Error processing demo day ${demoDay.uid}: ${error.message}`);
          errors++;
        }
      }

      this.logger.log(
        `Hourly demo day notifications job completed: ${startingSoonSent} starting soon, ${closingSoonSent} closing soon, ${errors} errors`
      );
    } catch (error) {
      this.logger.error(`Hourly demo day notifications job failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async sendStartingSoonNotification(demoDay: {
    uid: string;
    title: string;
    slugURL: string;
    startDate: Date;
    notifyBeforeStartHours: number | null;
  }): Promise<boolean> {
    // Check for existing notification to prevent duplicates
    const existingNotification = await this.prisma.pushNotification.findFirst({
      where: {
        category: PushNotificationCategory.DEMO_DAY_ANNOUNCEMENT,
        metadata: {
          path: ['demoDayUid'],
          equals: demoDay.uid,
        },
        AND: {
          metadata: {
            path: ['notificationType'],
            equals: 'STARTING_SOON',
          },
        },
      },
    });

    if (existingNotification) {
      this.logger.log(`Skipping "Starting Soon" notification for ${demoDay.title} - already sent`);
      return false;
    }

    this.logger.log(`Sending "Starting Soon" notification for demo day: ${demoDay.title}`);

    const hoursUntilStart = demoDay.notifyBeforeStartHours ?? 336;
    const timeMessage = this.formatHoursMessage(hoursUntilStart);

    // Create the notification
    await this.pushNotificationsService.create({
      category: PushNotificationCategory.DEMO_DAY_ANNOUNCEMENT,
      title: `${demoDay.title}`,
      description: `${demoDay.title} starts in ${timeMessage}.`,
      link: `demoday/${demoDay.slugURL}`,
      metadata: {
        demoDayUid: demoDay.uid,
        notificationType: 'STARTING_SOON',
        startDate: demoDay.startDate.toISOString(),
      },
      isPublic: true,
    });

    this.logger.log(`Successfully sent "Starting Soon" notification for demo day: ${demoDay.title}`);
    return true;
  }

  private async sendClosingSoonNotification(demoDay: {
    uid: string;
    title: string;
    slugURL: string;
    endDate: Date;
    notifyBeforeEndHours: number | null;
  }): Promise<boolean> {
    // Check for existing notification to prevent duplicates
    const existingNotification = await this.prisma.pushNotification.findFirst({
      where: {
        category: PushNotificationCategory.DEMO_DAY_ANNOUNCEMENT,
        metadata: {
          path: ['demoDayUid'],
          equals: demoDay.uid,
        },
        AND: {
          metadata: {
            path: ['notificationType'],
            equals: 'CLOSING_SOON',
          },
        },
      },
    });

    if (existingNotification) {
      this.logger.log(`Skipping "Closing Soon" notification for ${demoDay.title} - already sent`);
      return false;
    }

    this.logger.log(`Sending "Closing Soon" notification for demo day: ${demoDay.title}`);

    const hoursUntilEnd = demoDay.notifyBeforeEndHours ?? 48;
    const timeMessage = this.formatHoursMessage(hoursUntilEnd);

    // Create the notification
    await this.pushNotificationsService.create({
      category: PushNotificationCategory.DEMO_DAY_ANNOUNCEMENT,
      title: `${demoDay.title}`,
      description: `${demoDay.title} closing soon: only ${timeMessage} left!`,
      link: `demoday/${demoDay.slugURL}`,
      metadata: {
        demoDayUid: demoDay.uid,
        notificationType: 'CLOSING_SOON',
        endDate: demoDay.endDate.toISOString(),
      },
      isPublic: true,
    });

    this.logger.log(`Successfully sent "Closing Soon" notification for demo day: ${demoDay.title}`);
    return true;
  }

  /**
   * Format hours into a human-readable message (e.g., "2 weeks", "3 days", "48 hours")
   */
  private formatHoursMessage(hours: number): string {
    if (hours >= 168) {
      // 168 hours = 1 week
      const weeks = Math.round(hours / 168);
      return weeks === 1 ? '1 week' : `${weeks} weeks`;
    } else if (hours >= 24) {
      const days = Math.round(hours / 24);
      return days === 1 ? '1 day' : `${days} days`;
    } else {
      return hours === 1 ? '1 hour' : `${hours} hours`;
    }
  }
}
