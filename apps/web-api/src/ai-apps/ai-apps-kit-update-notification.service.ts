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

/** Advisory lock key that serializes the check across API instances starting at once. */
const KIT_UPDATE_LOCK_KEY = 'ai-apps-starter-kit-update-notification';

export type KitUpdateNotificationOutcome = 'sent' | 'already-announced';

/**
 * Tells AI Apps access holders when the starter kit this environment serves gets a newer version. Runs once per
 * API start: the stored `starter_kit_updated` notifications are the record of what was announced, so a version is
 * broadcast only when it is newer than every announced one (a restart or a rollback sends nothing). The check and
 * the send run under a Postgres advisory lock, so instances starting together send one notification. A failed send
 * stores nothing, and the next start tries again.
 */
@Injectable()
export class AiAppsKitUpdateNotificationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiAppsKitUpdateNotificationService.name);

  constructor(private readonly prisma: PrismaService, private readonly pushNotifications: PushNotificationsService) {}

  onApplicationBootstrap(): void {
    // Not awaited: startup never waits for or fails on the announcement.
    this.announceCurrentVersion().catch((error) =>
      this.logger.warn(
        `AI Apps starter kit v${AI_APPS_STARTER_KIT_VERSION} update notification failed: ${
          error instanceof Error ? error.message : error
        }`
      )
    );
  }

  async announceCurrentVersion(version: string = AI_APPS_STARTER_KIT_VERSION): Promise<KitUpdateNotificationOutcome> {
    return this.prisma.$transaction(
      async (tx) => {
        // Held until the transaction ends; a second instance waits here, then sees the committed notification.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${KIT_UPDATE_LOCK_KEY}))::text`;

        const announced = await tx.pushNotification.findMany({
          where: {
            category: PushNotificationCategory.AI_APP,
            metadata: { path: ['trigger'], equals: AI_APPS_NOTIFICATION_TRIGGERS.STARTER_KIT_UPDATED },
          },
          select: { metadata: true },
        });
        const isAnnounced = announced.some((row) => {
          const announcedVersion = (row.metadata as { version?: unknown } | null)?.version;
          return typeof announcedVersion === 'string' && compareKitVersions(announcedVersion, version) >= 0;
        });
        if (isAnnounced) {
          return 'already-announced';
        }

        await this.pushNotifications.create({
          category: PushNotificationCategory.AI_APP,
          ...AI_APPS_NOTIFICATION_MESSAGES.starterKitUpdated(version),
          link: AI_APPS_ADD_APP_DIALOG_PATH,
          isPublic: false,
          requiredPermissions: [AI_APPS_PERMISSIONS.READ, AI_APPS_PERMISSIONS.WRITE],
          metadata: {
            eventType: 'ai_app_starter_kit',
            trigger: AI_APPS_NOTIFICATION_TRIGGERS.STARTER_KIT_UPDATED,
            version,
          },
        });
        this.logger.log(`AI Apps starter kit v${version} update announced to AI Apps access holders`);
        return 'sent';
      },
      { timeout: 30_000 }
    );
  }
}

/** Compares dotted numeric versions ("1.9" < "1.17"); a missing segment counts as 0. */
export function compareKitVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) {
      return Math.sign(diff);
    }
  }
  return 0;
}
