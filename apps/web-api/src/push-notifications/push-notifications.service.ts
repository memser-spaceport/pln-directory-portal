import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { WebSocketService } from '../websocket/websocket.service';
import { Prisma, PushNotificationCategory } from '@prisma/client';

export interface CreatePushNotificationDto {
  category: PushNotificationCategory;
  title: string;
  description?: string;
  image?: string;
  link?: string;
  metadata?: Record<string, unknown>;
  recipientUid?: string;
  isPublic?: boolean;
}

interface NotificationWithReadStatus {
  uid: string;
  category: PushNotificationCategory;
  title: string;
  description: string | null;
  image: string | null;
  link: string | null;
  metadata: Prisma.JsonValue;
  isPublic: boolean;
  recipientUid: string | null;
  isRead: boolean;
  createdAt: Date;
}

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);

  constructor(private readonly prisma: PrismaService, private readonly webSocketService: WebSocketService) {}

  /**
   * Create and send a push notification.
   * 1. Stores in database
   * 2. Sends via WebSocket
   */
  async create(dto: CreatePushNotificationDto) {
    // Store in database
    const notification = await this.prisma.pushNotification.create({
      data: {
        category: dto.category,
        title: dto.title,
        description: dto.description,
        image: dto.image,
        link: dto.link,
        metadata: dto.metadata ? (dto.metadata as Prisma.InputJsonValue) : undefined,
        recipientUid: dto.recipientUid,
        isPublic: dto.isPublic ?? false,
        isRead: false,
        isSent: false,
      },
    });

    // Send via WebSocket
    try {
      const payload = {
        id: notification.uid,
        category: notification.category,
        title: notification.title,
        description: notification.description || undefined,
        image: notification.image || undefined,
        link: notification.link || undefined,
        metadata: (notification.metadata as Record<string, unknown>) || {},
        isPublic: notification.isPublic,
        createdAt: notification.createdAt.toISOString(),
      };

      if (dto.recipientUid) {
        // Send to specific user
        await this.webSocketService.notifyUser(dto.recipientUid, payload);
      } else if (dto.isPublic) {
        // Broadcast to all connected users
        await this.webSocketService.broadcast(payload);
      }

      // Mark as sent
      await this.prisma.pushNotification.update({
        where: { uid: notification.uid },
        data: {
          isSent: true,
          sentAt: new Date(),
        },
      });

      this.logger.log(`Push notification sent: ${notification.uid} - ${dto.category}`);
    } catch (error) {
      this.logger.error(
        `Failed to send push notification via WebSocket: ${error instanceof Error ? error.message : error}`
      );
      // Notification is stored but not sent - can be retried later
    }

    return notification;
  }

  /**
   * Get push notifications for a user.
   * - Private notifications: use isRead field directly
   * - Public notifications: check PushNotificationReadStatus table
   */
  async getForUser(
    memberUid: string,
    options?: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
    }
  ) {
    const { limit = 50, offset = 0, unreadOnly = false } = options || {};

    // Get private notifications for this user
    const privateNotifications = await this.prisma.pushNotification.findMany({
      where: {
        recipientUid: memberUid,
        isPublic: false,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get public notifications with read status for this user
    const publicNotifications = await this.prisma.pushNotification.findMany({
      where: {
        isPublic: true,
      },
      include: {
        readStatuses: {
          where: { memberUid },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Transform and combine notifications
    const notifications: NotificationWithReadStatus[] = [
      ...privateNotifications.map((n) => ({
        uid: n.uid,
        category: n.category,
        title: n.title,
        description: n.description,
        image: n.image,
        link: n.link,
        metadata: n.metadata,
        isPublic: n.isPublic,
        recipientUid: n.recipientUid,
        isRead: n.isRead,
        createdAt: n.createdAt,
      })),
      ...publicNotifications
        .filter((n) => !unreadOnly || n.readStatuses.length === 0)
        .map((n) => ({
          uid: n.uid,
          category: n.category,
          title: n.title,
          description: n.description,
          image: n.image,
          link: n.link,
          metadata: n.metadata,
          isPublic: n.isPublic,
          recipientUid: n.recipientUid,
          isRead: n.readStatuses.length > 0,
          createdAt: n.createdAt,
        })),
    ];

    // Sort by createdAt desc and apply pagination
    notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const paginatedNotifications = notifications.slice(offset, offset + limit);

    return {
      notifications: paginatedNotifications,
      total: notifications.length,
      unreadCount: await this.getUnreadCount(memberUid),
    };
  }

  /**
   * Get unread count for a user.
   * - Private: count where isRead = false
   * - Public: count where no read status exists for this user
   */
  async getUnreadCount(memberUid: string): Promise<number> {
    // Count unread private notifications
    const privateUnread = await this.prisma.pushNotification.count({
      where: {
        recipientUid: memberUid,
        isPublic: false,
        isRead: false,
      },
    });

    // Count public notifications not read by this user
    const totalPublic = await this.prisma.pushNotification.count({
      where: { isPublic: true },
    });

    const readPublic = await this.prisma.pushNotificationReadStatus.count({
      where: {
        memberUid,
        notification: { isPublic: true },
      },
    });

    return privateUnread + (totalPublic - readPublic);
  }

  /**
   * Mark a notification as read for a specific user.
   * - Private notifications: update isRead field
   * - Public notifications: insert into PushNotificationReadStatus
   */
  async markAsRead(uid: string, memberUid: string) {
    const notification = await this.prisma.pushNotification.findFirst({
      where: {
        uid,
        OR: [{ recipientUid: memberUid }, { isPublic: true }],
      },
    });

    if (!notification) {
      return null;
    }

    if (notification.isPublic) {
      // For public notifications, create a read status entry
      await this.prisma.pushNotificationReadStatus.upsert({
        where: {
          notificationId_memberUid: {
            notificationId: notification.id,
            memberUid,
          },
        },
        create: {
          notificationId: notification.id,
          memberUid,
        },
        update: {}, // Already exists, do nothing
      });
    } else {
      // For private notifications, update the isRead field
      await this.prisma.pushNotification.update({
        where: { uid },
        data: { isRead: true },
      });
    }

    // Notify via WebSocket
    await this.webSocketService.notifyUpdate(memberUid, {
      id: uid,
      status: 'read',
    });

    return notification;
  }

  /**
   * Mark all notifications as read for a user.
   * - Private: update isRead field
   * - Public: insert read status for all unread public notifications
   */
  async markAllAsRead(memberUid: string) {
    // Mark all private notifications as read
    await this.prisma.pushNotification.updateMany({
      where: {
        recipientUid: memberUid,
        isPublic: false,
        isRead: false,
      },
      data: { isRead: true },
    });

    // Get all public notifications not yet read by this user
    const unreadPublicNotifications = await this.prisma.pushNotification.findMany({
      where: {
        isPublic: true,
        readStatuses: {
          none: { memberUid },
        },
      },
      select: { id: true },
    });

    // Create read status for all unread public notifications
    if (unreadPublicNotifications.length > 0) {
      await this.prisma.pushNotificationReadStatus.createMany({
        data: unreadPublicNotifications.map((n) => ({
          notificationId: n.id,
          memberUid,
        })),
        skipDuplicates: true,
      });
    }

    // Notify via WebSocket
    await this.webSocketService.notifyCount(memberUid, { unreadCount: 0 });

    return { success: true };
  }

  /**
   * Delete a notification (only for private notifications owned by the user).
   */
  async delete(uid: string, memberUid: string) {
    const notification = await this.prisma.pushNotification.findFirst({
      where: {
        uid,
        recipientUid: memberUid, // Only owner can delete private notifications
        isPublic: false,
      },
    });

    if (!notification) {
      return null;
    }

    await this.prisma.pushNotification.delete({
      where: { uid },
    });

    // Notify via WebSocket
    await this.webSocketService.notifyUpdate(memberUid, {
      id: uid,
      status: 'deleted',
    });

    return notification;
  }
}
