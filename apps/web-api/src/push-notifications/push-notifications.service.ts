import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { WebSocketService } from '../websocket/websocket.service';
import { Prisma, PushNotificationCategory } from '@prisma/client';
import { NotificationServiceClient } from '../notifications/notification-service.client';

export interface CreatePushNotificationDto {
  category: PushNotificationCategory;
  title: string;
  description?: string;
  image?: string;
  link?: string;
  metadata?: Record<string, unknown>;
  recipientUid?: string;
  isPublic?: boolean;
  accessLevels?: string[]; // Optional: list of access levels (L2, L3, L4, L5, L6) to target
}

export interface ForumMentionEmailDto {
  recipientUid: string;
  title: string;
  description?: string;
  link?: string;
  metadata?: Record<string, unknown>;
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
  accessLevels: string[];
  isRead: boolean;
  createdAt: Date;
  isAttended?: boolean;
}

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webSocketService: WebSocketService,
    private readonly notificationServiceClient: NotificationServiceClient
  ) {}

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
        accessLevels: dto.accessLevels ?? [],
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
      } else if (dto.accessLevels && dto.accessLevels.length > 0) {
        // Send to users with specified access levels
        await this.webSocketService.notifyByAccessLevels(dto.accessLevels, payload);
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
   * - Access level notifications: check if user's access level is in the accessLevels array
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

    // Get user's access level
    const member = await this.prisma.member.findFirst({
      where: { externalId: memberUid },
      select: { accessLevel: true, uid: true },
    });

    const userAccessLevel = member?.accessLevel;

    const realMemberUid = member?.uid ?? memberUid;

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

    // Get access level notifications (where user's access level is in the accessLevels array)
    const accessLevelNotifications = userAccessLevel
      ? await this.prisma.pushNotification.findMany({
          where: {
            accessLevels: { has: userAccessLevel },
            isPublic: false,
            recipientUid: null,
          },
          include: {
            readStatuses: {
              where: { memberUid },
              take: 1,
            },
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];

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
        accessLevels: n.accessLevels,
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
          accessLevels: n.accessLevels,
          isRead: n.readStatuses.length > 0,
          createdAt: n.createdAt,
        })),
      ...accessLevelNotifications
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
          accessLevels: n.accessLevels,
          isRead: n.readStatuses.length > 0,
          createdAt: n.createdAt,
        })),
    ];

    // Sort: unread first, then by createdAt desc
    notifications.sort((a, b) => {
      // Unread notifications first
      if (a.isRead !== b.isRead) {
        return a.isRead ? 1 : -1;
      }
      // Then by createdAt descending
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    // Sort: unread first, then by createdAt desc
    notifications.sort((a, b) => {
      if (a.isRead !== b.isRead) {
        return a.isRead ? 1 : -1;
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const paginatedNotifications = notifications.slice(offset, offset + limit);

    // ---- IRL: compute isAttended per user (only for returned page) ----
    const irlPage = paginatedNotifications.filter(
      (n) =>
        n.category === PushNotificationCategory.IRL_GATHERING &&
        n.metadata &&
        typeof n.metadata === 'object' &&
        (n.metadata as any)?.ui?.locationUid
    );

    const locationUids = [...new Set(irlPage.map((n) => (n.metadata as any).ui.locationUid).filter(Boolean))];

    if (locationUids.length > 0) {
      const attendedRows = await this.prisma.pLEventGuest.findMany({
        where: {
          memberUid: realMemberUid,
          locationUid: { in: locationUids },
        },
        select: { locationUid: true },
        distinct: ['locationUid'],
      });

      const attendedSet = new Set(attendedRows.map((r) => r.locationUid));

      for (const n of irlPage) {
        const loc = (n.metadata as any)?.ui?.locationUid;
        n.isAttended = attendedSet.has(loc);
      }
    }

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
   * - Access level: count where user's access level is in accessLevels array and no read status exists
   */
  async getUnreadCount(memberUid: string): Promise<number> {
    // Get user's access level
    const member = await this.prisma.member.findFirst({
      where: { externalId: memberUid },
      select: { accessLevel: true },
    });

    const userAccessLevel = member?.accessLevel;

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

    // Count access level notifications not read by this user
    let accessLevelUnread = 0;
    if (userAccessLevel) {
      const totalAccessLevel = await this.prisma.pushNotification.count({
        where: {
          accessLevels: { has: userAccessLevel },
          isPublic: false,
          recipientUid: null,
        },
      });

      const readAccessLevel = await this.prisma.pushNotificationReadStatus.count({
        where: {
          memberUid,
          notification: {
            accessLevels: { has: userAccessLevel },
            isPublic: false,
            recipientUid: null,
          },
        },
      });

      accessLevelUnread = totalAccessLevel - readAccessLevel;
    }

    return privateUnread + (totalPublic - readPublic) + accessLevelUnread;
  }

  /**
   * Get all unread notification links for a user.
   * Only returns notifications that have a non-null link.
   */
  async getUnreadLinksForUser(memberUid: string): Promise<Array<{ uid: string; link: string }>> {
    const member = await this.prisma.member.findFirst({
      where: { externalId: memberUid },
      select: { accessLevel: true },
    });

    const userAccessLevel = member?.accessLevel;

    // Unread private notifications with links
    const privateLinks = await this.prisma.pushNotification.findMany({
      where: {
        recipientUid: memberUid,
        isPublic: false,
        isRead: false,
        link: { not: null },
      },
      select: { uid: true, link: true },
    });

    // Unread public notifications with links (no read status for this user)
    const publicLinks = await this.prisma.pushNotification.findMany({
      where: {
        isPublic: true,
        link: { not: null },
        readStatuses: {
          none: { memberUid },
        },
      },
      select: { uid: true, link: true },
    });

    // Unread access-level notifications with links
    const accessLevelLinks = userAccessLevel
      ? await this.prisma.pushNotification.findMany({
          where: {
            accessLevels: { has: userAccessLevel },
            isPublic: false,
            recipientUid: null,
            link: { not: null },
            readStatuses: {
              none: { memberUid },
            },
          },
          select: { uid: true, link: true },
        })
      : [];

    return [
      ...privateLinks.map((n) => ({ uid: n.uid, link: n.link as string })),
      ...publicLinks.map((n) => ({ uid: n.uid, link: n.link as string })),
      ...accessLevelLinks.map((n) => ({ uid: n.uid, link: n.link as string })),
    ];
  }

  /**
   * Mark a notification as read for a specific user.
   * - Private notifications: update isRead field
   * - Public notifications: insert into PushNotificationReadStatus
   * - Access level notifications: insert into PushNotificationReadStatus
   */
  async markAsRead(uid: string, memberUid: string) {
    // Get user's access level
    const member = await this.prisma.member.findFirst({
      where: { externalId: memberUid },
      select: { accessLevel: true },
    });

    const userAccessLevel = member?.accessLevel;

    // Build OR conditions for finding the notification
    const orConditions: Prisma.PushNotificationWhereInput[] = [{ recipientUid: memberUid }, { isPublic: true }];

    // Add access level condition if user has an access level
    if (userAccessLevel) {
      orConditions.push({
        accessLevels: { has: userAccessLevel },
        isPublic: false,
        recipientUid: null,
      });
    }

    const notification = await this.prisma.pushNotification.findFirst({
      where: {
        uid,
        OR: orConditions,
      },
    });

    if (!notification) {
      return null;
    }

    if (notification.isPublic || (notification.accessLevels.length > 0 && !notification.recipientUid)) {
      // For public and access level notifications, create a read status entry
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
   * - Access level: insert read status for all unread access level notifications
   */
  async markAllAsRead(memberUid: string) {
    // Get user's access level
    const member = await this.prisma.member.findFirst({
      where: { externalId: memberUid },
      select: { accessLevel: true },
    });

    const userAccessLevel = member?.accessLevel;

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

    // Get all access level notifications not yet read by this user
    if (userAccessLevel) {
      const unreadAccessLevelNotifications = await this.prisma.pushNotification.findMany({
        where: {
          accessLevels: { has: userAccessLevel },
          isPublic: false,
          recipientUid: null,
          readStatuses: {
            none: { memberUid },
          },
        },
        select: { id: true },
      });

      // Create read status for all unread access level notifications
      if (unreadAccessLevelNotifications.length > 0) {
        await this.prisma.pushNotificationReadStatus.createMany({
          data: unreadAccessLevelNotifications.map((n) => ({
            notificationId: n.id,
            memberUid,
          })),
          skipDuplicates: true,
        });
      }
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

  /**
   * Send email notification for forum mention
   */
  async sendForumMentionEmail(notification: ForumMentionEmailDto): Promise<void> {
    const metadata = notification.metadata as Record<string, unknown> | undefined;

    if (metadata?.eventType !== 'forum_mention') {
      return;
    }

    try {
      // Get recipient's email from member table using externalId (recipientUid)
      const member = await this.prisma.member.findFirst({
        where: { externalId: notification.recipientUid },
        select: { email: true, name: true, uid: true },
      });

      if (!member?.email) {
        this.logger.warn(`Cannot send forum mention email: member email not found for ${notification.recipientUid}`);
        return;
      }

      const authorName = (metadata.authorName as string) || 'Unknown User';
      const authorRole = (metadata.authorRole as string) || 'N/A';
      const authorTeam = (metadata.authorTeam as string) || 'N/A';
      const authorUid = (metadata.authorUid as string) || '';
      const authorPicture = metadata.authorPicture as string | undefined;
      const postLink = notification.link
        ? `${process.env.WEB_UI_BASE_URL}${notification.link}`
        : process.env.WEB_UI_BASE_URL;

      await this.notificationServiceClient.sendNotification({
        isPriority: true,
        deliveryChannel: 'EMAIL',
        templateName: 'FORUM_MENTION',
        recipientsInfo: {
          to: [member.email],
        },
        deliveryPayload: {
          body: {
            recipientName: member.name || 'there',
            authorName,
            authorRole,
            authorTeam,
            authorPicture: authorPicture || '',
            postContent: notification.description || '',
            postLink,
            postTitle: notification.metadata?.postTitle || 'Untitled Post',
          },
        },
        entityType: 'FORUM',
        actionType: 'MENTION',
        sourceMeta: {
          activityId: '',
          activityType: 'FORUM_MENTION',
          activityUserId: authorUid,
          activityUserName: authorName,
        },
        targetMeta: {
          emailId: member.email,
          userId: member.uid,
          userName: member.name || '',
        },
      });

      this.logger.log(`Forum mention email sent to ${member.email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send forum mention email for ${notification.recipientUid}: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }
}
