import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { PushNotificationsService, CreatePushNotificationDto } from './push-notifications.service';
import { AdminAuthGuard } from '../guards/admin-auth.guard';

/**
 * Admin controller for managing push notifications.
 * Requires admin authentication.
 */
// TODO probably move to back-office
@Controller('v1/admin/push-notifications')
@UseGuards(AdminAuthGuard)
export class AdminPushNotificationsController {
  constructor(private readonly pushNotificationsService: PushNotificationsService) {}

  /**
   * Send a broadcast notification to all users.
   *
   * POST /v1/admin/push-notifications/broadcast
   * Body: { category, title, description?, image?, link?, metadata? }
   */
  @Post('broadcast')
  async broadcastNotification(@Body() dto: Omit<CreatePushNotificationDto, 'recipientUid' | 'isPublic'>) {
    const notification = await this.pushNotificationsService.create({
      ...dto,
      isPublic: true,
    });

    return {
      success: true,
      notification: {
        uid: notification.uid,
        title: notification.title,
        category: notification.category,
        createdAt: notification.createdAt,
      },
    };
  }

  /**
   * Send a notification to a specific user.
   *
   * POST /v1/admin/push-notifications/send
   * Body: { recipientUid, category, title, description?, image?, link?, metadata? }
   */
  @Post('send')
  async sendNotification(@Body() dto: CreatePushNotificationDto) {
    if (!dto.recipientUid) {
      return { success: false, error: 'recipientUid is required' };
    }

    const notification = await this.pushNotificationsService.create({
      ...dto,
      isPublic: false,
    });

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
  }
}
