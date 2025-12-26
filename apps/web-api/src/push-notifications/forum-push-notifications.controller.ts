import { Controller, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { PushNotificationsService } from './push-notifications.service';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { PushNotificationCategory } from '@prisma/client';

/**
 * DTO for sending a notification to a specific user
 */
interface SendNotificationDto {
  recipientUid: string;
  category: 'FORUM_POST' | 'FORUM_REPLY';
  title: string;
  description?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

/**
 * DTO for sending notifications to multiple users
 */
interface SendBulkNotificationsDto {
  notifications: SendNotificationDto[];
}

/**
 * DTO for broadcasting a notification to all users
 */
interface BroadcastNotificationDto {
  category: 'FORUM_POST' | 'FORUM_REPLY';
  title: string;
  description?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Controller for forum push notifications.
 * Used by NodeBB forum service to send in-app notifications.
 * Requires service authentication (shared secret).
 */
@Controller('v1/forum/push-notifications')
@UseGuards(ServiceAuthGuard)
export class ForumPushNotificationsController {
  private readonly logger = new Logger(ForumPushNotificationsController.name);

  constructor(private readonly pushNotificationsService: PushNotificationsService) {}

  /**
   * Send a notification to a specific user.
   *
   * POST /v1/forum/push-notifications/send
   * Body: { recipientUid, category, title, description?, link?, metadata? }
   */
  @Post('send')
  async sendNotification(@Body() dto: SendNotificationDto) {
    if (!dto.recipientUid) {
      return { success: false, error: 'recipientUid is required' };
    }

    if (!this.isValidForumCategory(dto.category)) {
      return { success: false, error: 'Invalid category. Must be FORUM_POST or FORUM_REPLY' };
    }

    try {
      const notification = await this.pushNotificationsService.create({
        category: dto.category as PushNotificationCategory,
        title: dto.title,
        description: dto.description,
        link: dto.link,
        metadata: dto.metadata,
        recipientUid: dto.recipientUid,
        isPublic: false,
      });

      this.logger.log(`Forum notification sent to ${dto.recipientUid}: ${dto.category}`);

      return {
        success: true,
        notification: {
          uid: notification.uid,
          title: notification.title,
          category: notification.category,
          recipientUid: notification.recipientUid,
          createdAt: notification.createdAt,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to send notification: ${error instanceof Error ? error.message : error}`);
      return { success: false, error: 'Failed to send notification' };
    }
  }

  /**
   * Send notifications to multiple users in bulk.
   *
   * POST /v1/forum/push-notifications/send-bulk
   * Body: { notifications: [{ recipientUid, category, title, ... }, ...] }
   */
  @Post('send-bulk')
  async sendBulkNotifications(@Body() dto: SendBulkNotificationsDto) {
    if (!dto.notifications || !Array.isArray(dto.notifications)) {
      return { success: false, error: 'notifications array is required' };
    }

    // Validate all notifications before processing
    for (const notification of dto.notifications) {
      if (!notification.recipientUid) {
        return { success: false, error: 'All notifications must have recipientUid' };
      }
      if (!this.isValidForumCategory(notification.category)) {
        return { success: false, error: 'All notifications must have valid category (FORUM_POST or FORUM_REPLY)' };
      }
    }

    const results = await Promise.allSettled(
      dto.notifications.map((n) =>
        this.pushNotificationsService.create({
          category: n.category as PushNotificationCategory,
          title: n.title,
          description: n.description,
          link: n.link,
          metadata: n.metadata,
          recipientUid: n.recipientUid,
          isPublic: false,
        })
      )
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.log(`Bulk forum notifications: ${sent} sent, ${failed} failed`);

    return {
      success: true,
      sent,
      failed,
      total: dto.notifications.length,
    };
  }

  /**
   * Broadcast a notification to all users (e.g., trending topics).
   *
   * POST /v1/forum/push-notifications/broadcast
   * Body: { category, title, description?, link?, metadata? }
   */
  @Post('broadcast')
  async broadcastNotification(@Body() dto: BroadcastNotificationDto) {
    if (!this.isValidForumCategory(dto.category)) {
      return { success: false, error: 'Invalid category. Must be FORUM_POST or FORUM_REPLY' };
    }

    try {
      const notification = await this.pushNotificationsService.create({
        category: dto.category as PushNotificationCategory,
        title: dto.title,
        description: dto.description,
        link: dto.link,
        metadata: dto.metadata,
        isPublic: true,
      });

      this.logger.log(`Forum broadcast notification sent: ${dto.category} - ${dto.title}`);

      return {
        success: true,
        notification: {
          uid: notification.uid,
          title: notification.title,
          category: notification.category,
          createdAt: notification.createdAt,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to broadcast notification: ${error instanceof Error ? error.message : error}`);
      return { success: false, error: 'Failed to broadcast notification' };
    }
  }

  /**
   * Validate that the category is a valid forum category
   */
  private isValidForumCategory(category: string): boolean {
    return category === 'FORUM_POST' || category === 'FORUM_REPLY';
  }
}
