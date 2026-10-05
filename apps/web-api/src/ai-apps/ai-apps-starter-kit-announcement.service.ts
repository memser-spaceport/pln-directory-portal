import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PushNotificationCategory } from '@prisma/client';
import { AI_APPS_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { PrismaService } from '../shared/prisma.service';
import {
  AI_APPS_ADD_APP_DIALOG_PATH,
  AI_APPS_NOTIFICATION_MESSAGES,
  AI_APPS_NOTIFICATION_TRIGGERS,
  AI_APPS_STARTER_KIT_VERSION,
} from './ai-apps.constants';

export type StarterKitAnnouncementOutcome = 'sent' | 'not-production' | 'already-announced' | 'failed';

/**
 * Tells AI Apps access holders when a new starter kit version reaches production (LAB-2721). "On deploy" is a
 * one-time check when the API starts: if AI_APPS_STARTER_KIT_VERSION has no AiAppStarterKitAnnouncement row yet,
 * the instance whose insert wins sends one broadcast; restarts and other instances find the row and skip. A failed
 * send removes the row again so the next start retries. Never throws: startup must not depend on it.
 */
@Injectable()
export class AiAppsStarterKitAnnouncementService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiAppsStarterKitAnnouncementService.name);

  constructor(private readonly prisma: PrismaService, private readonly pushNotifications: PushNotificationsService) {}

  onApplicationBootstrap(): void {
    // Not awaited: the check runs alongside startup instead of delaying it.
    this.announceCurrentVersion().catch((error) =>
      this.logger.warn(`AI Apps starter kit announcement failed: ${errorMessage(error)}`)
    );
  }

  async announceCurrentVersion(
    version: string = AI_APPS_STARTER_KIT_VERSION,
    environment: string | undefined = process.env.ENVIRONMENT
  ): Promise<StarterKitAnnouncementOutcome> {
    if (environment !== 'production') return 'not-production';

    try {
      await this.prisma.aiAppStarterKitAnnouncement.create({ data: { version } });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return 'already-announced';
      this.logger.warn(`AI Apps starter kit v${version} announcement check failed: ${errorMessage(error)}`);
      return 'failed';
    }

    try {
      await this.pushNotifications.create({
        category: PushNotificationCategory.NEW_FEATURE,
        ...AI_APPS_NOTIFICATION_MESSAGES.starterKitUpdated(version),
        link: AI_APPS_ADD_APP_DIALOG_PATH,
        isPublic: false,
        requiredPermissions: [AI_APPS_PERMISSIONS.READ, AI_APPS_PERMISSIONS.WRITE],
        metadata: {
          eventType: 'ai_app_starter_kit',
          trigger: AI_APPS_NOTIFICATION_TRIGGERS.STARTER_KIT_UPDATED,
          version,
          link: AI_APPS_ADD_APP_DIALOG_PATH,
        },
      });
      this.logger.log(`AI Apps starter kit v${version} announced to AI Apps access holders`);
      return 'sent';
    } catch (error) {
      this.logger.warn(`AI Apps starter kit v${version} announcement failed: ${errorMessage(error)}`);
      try {
        await this.prisma.aiAppStarterKitAnnouncement.deleteMany({ where: { version } });
      } catch (cleanupError) {
        this.logger.warn(
          `AI Apps starter kit v${version} announcement record not removed; it will not retry: ${errorMessage(
            cleanupError
          )}`
        );
      }
      return 'failed';
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
