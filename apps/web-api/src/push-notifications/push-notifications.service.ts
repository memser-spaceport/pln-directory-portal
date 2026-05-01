import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { WebSocketService } from '../websocket/websocket.service';
import { Prisma, PushNotificationCategory } from '@prisma/client';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { PLEventGuestsService } from '../pl-events/pl-event-guests.service';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';

export interface CreatePushNotificationDto {
  category: PushNotificationCategory;
  title: string;
  description?: string;
  image?: string;
  link?: string;
  linkText?: string; // Display text for the link button (e.g., "Explore Guides")
  metadata?: Record<string, unknown>;
  recipientUid?: string;
  isPublic?: boolean;
  accessLevels?: string[]; // Optional: list of access levels (L2, L3, L4, L5, L6) to target
  requiredPermissions?: string[]; // Optional: list of permission codes; user needs ANY of these to see notification
}

export interface ForumMentionEmailDto {
  recipientUid: string;
  title: string;
  description?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

export interface GuideCommentNotificationDto {
  recipientUid: string;
  category: 'GUIDE_POST' | 'GUIDE_REPLY';
  commentAuthor: {
    uid: string;
    name: string | null;
    image?: { url: string } | null;
  };
  articleTitle: string;
  commentContent: string;
  link: string;
  eventType: 'guide_comment' | 'guide_reply' | 'guide_mention';
}

interface NotificationWithReadStatus {
  uid: string;
  category: PushNotificationCategory;
  title: string;
  description: string | null;
  image: string | null;
  link: string | null;
  linkText: string | null;
  metadata: Prisma.JsonValue;
  isPublic: boolean;
  recipientUid: string | null;
  accessLevels: string[];
  requiredPermissions: string[];
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
    private readonly notificationServiceClient: NotificationServiceClient,
    @Inject(forwardRef(() => PLEventGuestsService))
    private readonly pleventGuestsService: PLEventGuestsService,
    private readonly accessControlV2Service: AccessControlV2Service
  ) {}

  private isSelfAuthoredForumPost(
    notification: { category: PushNotificationCategory; metadata: Prisma.JsonValue },
    memberUid: string
  ): boolean {
    return (
      notification.category === PushNotificationCategory.FORUM_POST &&
      notification.metadata != null &&
      typeof notification.metadata === 'object' &&
      (notification.metadata as any)?.authorUid === memberUid
    );
  }

  private async getFreshAttendeesTotal(locationUid: string): Promise<number> {
    const rows = await this.pleventGuestsService.getPLEventGuestsByLocationAndType(
      locationUid,
      { type: 'upcoming' },
      null
    );

    if (!rows || rows.length === 0) {
      return 0;
    }

    return typeof rows[0]?.count === 'number' ? rows[0].count : rows.length;
  }

  private async checkIsAttendedForNotification(
    memberUid: string,
    notification: NotificationWithReadStatus
  ): Promise<boolean> {
    const metadata = notification.metadata as Record<string, any> | null;
    const locationUid = metadata?.ui?.locationUid;
    const eventUids = !Array.isArray(metadata?.events?.eventUids)
      ? []
      : metadata?.events.eventUids.filter((uid: unknown): uid is string => typeof uid === 'string' && uid.length > 0);

    if (!locationUid) {
      return false;
    }

    const attended = await this.prisma.pLEventGuest.findFirst({
      where: {
        memberUid,
        locationUid,
        OR: [
          { eventUid: null },
          ...(eventUids.length > 0
            ? [
                {
                  eventUid: { in: eventUids },
                  event: {
                    isDeleted: false,
                    endDate: { gte: new Date() },
                  },
                },
              ]
            : []),
        ],
      },
      select: { uid: true },
    });

    return !!attended;
  }

  /**
   * Get all member UIDs who have ANY of the specified permissions.
   * Uses the new policy-based permission system (PolicyAssignment + MemberPermissionV2).
   */
  private async getMemberUidsByPermissions(permissionCodes: string[]): Promise<string[]> {
    if (!permissionCodes || permissionCodes.length === 0) {
      return [];
    }

    // Query members with policy-based permissions (via PolicyAssignment -> Policy -> PolicyPermission -> Permission)
    const policyBasedMembers = await this.prisma.policyAssignment.findMany({
      where: {
        policy: {
          policyPermissions: {
            some: {
              permission: {
                code: { in: permissionCodes },
              },
            },
          },
        },
      },
      select: { memberUid: true },
      distinct: ['memberUid'],
    });

    // Query members with direct permissions (MemberPermissionV2)
    const directPermissionMembers = await this.prisma.memberPermissionV2.findMany({
      where: {
        permission: {
          code: { in: permissionCodes },
        },
      },
      select: { memberUid: true },
      distinct: ['memberUid'],
    });

    // Combine and deduplicate
    const memberUids = new Set<string>([
      ...policyBasedMembers.map((p) => p.memberUid),
      ...directPermissionMembers.map((p) => p.memberUid),
    ]);

    return [...memberUids];
  }

  /**
   * Check if a user has ANY of the required permissions.
   * Uses the new policy-based permission system (PolicyAssignment + MemberPermissionV2).
   */
  private async userHasAnyPermission(memberUid: string, permissionCodes: string[]): Promise<boolean> {
    if (!permissionCodes || permissionCodes.length === 0) {
      return true; // No restrictions = everyone allowed
    }

    for (const permissionCode of permissionCodes) {
      const result = await this.accessControlV2Service.hasPermission(memberUid, permissionCode);
      if (result.allowed) {
        return true; // Has at least one required permission
      }
    }

    return false;
  }

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
        linkText: dto.linkText,
        metadata: dto.metadata ? (dto.metadata as Prisma.InputJsonValue) : undefined,
        recipientUid: dto.recipientUid,
        isPublic: dto.isPublic ?? false,
        accessLevels: dto.accessLevels ?? [],
        requiredPermissions: dto.requiredPermissions ?? [],
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
        linkText: notification.linkText || undefined,
        metadata: (notification.metadata as Record<string, unknown>) || {},
        isPublic: notification.isPublic,
        createdAt: notification.createdAt.toISOString(),
      };

      if (dto.recipientUid) {
        // Send to specific user
        await this.webSocketService.notifyUser(dto.recipientUid, payload);
      } else if (dto.requiredPermissions && dto.requiredPermissions.length > 0) {
        // Send to users with ANY of the required permissions
        const memberUids = await this.getMemberUidsByPermissions(dto.requiredPermissions);
        const excludeUid =
          dto.category === PushNotificationCategory.FORUM_POST &&
          dto.metadata?.authorUid &&
          typeof dto.metadata.authorUid === 'string'
            ? dto.metadata.authorUid
            : undefined;

        for (const memberUid of memberUids) {
          if (excludeUid && memberUid === excludeUid) continue;
          await this.webSocketService.notifyUser(memberUid, payload);
        }

        this.logger.debug(
          `Notification sent to ${memberUids.length} users with permissions ${dto.requiredPermissions.join(', ')}`
        );
      } else if (dto.accessLevels && dto.accessLevels.length > 0) {
        // Send to users with specified access levels
        const excludeUid =
          dto.category === PushNotificationCategory.FORUM_POST &&
          dto.metadata?.authorUid &&
          typeof dto.metadata.authorUid === 'string'
            ? dto.metadata.authorUid
            : undefined;
        await this.webSocketService.notifyByAccessLevels(dto.accessLevels, payload, { excludeUid });
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
   * - Permission-based notifications: check if user has ANY of the requiredPermissions
   *   (notifications with requiredPermissions set, but no accessLevels and no specific recipient)
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

    // Get user's access level and creation date
    const member = await this.prisma.member.findFirst({
      where: { uid: memberUid },
      select: { accessLevel: true, createdAt: true },
    });

    const userAccessLevel = member?.accessLevel;
    const memberCreatedAt = member?.createdAt;

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
    // Filter: notifications created after member joined OR NEW_FEATURE category
    const publicNotifications = await this.prisma.pushNotification.findMany({
      where: {
        isPublic: true,
        OR: [{ createdAt: { gte: memberCreatedAt } }, { category: PushNotificationCategory.NEW_FEATURE }],
      },
      include: {
        readStatuses: {
          where: { memberUid },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // NOTE: Access level notifications are deprecated in favor of permission-based notifications
    // Get access level notifications (where user's access level is in the accessLevels array)
    // Filter: notifications created after member joined OR NEW_FEATURE category
    // const accessLevelNotifications = userAccessLevel
    //   ? await this.prisma.pushNotification.findMany({
    //       where: {
    //         accessLevels: { has: userAccessLevel },
    //         isPublic: false,
    //         recipientUid: null,
    //         OR: [{ createdAt: { gte: memberCreatedAt } }, { category: PushNotificationCategory.NEW_FEATURE }],
    //       },
    //       include: {
    //         readStatuses: {
    //           where: { memberUid },
    //           take: 1,
    //         },
    //       },
    //       orderBy: { createdAt: 'desc' },
    //     })
    //   : [];
    const accessLevelNotifications: any[] = [];

    // Get permission-based notifications (where requiredPermissions is set but no accessLevels/recipient)
    // These are filtered by checking if user has any of the required permissions
    // Filter: notifications created after member joined OR NEW_FEATURE category
    const permissionBasedNotifications = await this.prisma.pushNotification.findMany({
      where: {
        requiredPermissions: { isEmpty: false },
        accessLevels: { isEmpty: true },
        isPublic: false,
        recipientUid: null,
        OR: [{ createdAt: { gte: memberCreatedAt } }, { category: PushNotificationCategory.NEW_FEATURE }],
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
    const allNotifications: NotificationWithReadStatus[] = [
      ...privateNotifications.map((n) => ({
        uid: n.uid,
        category: n.category,
        title: n.title,
        description: n.description,
        image: n.image,
        link: n.link,
        linkText: n.linkText,
        metadata: n.metadata,
        isPublic: n.isPublic,
        recipientUid: n.recipientUid,
        accessLevels: n.accessLevels,
        requiredPermissions: n.requiredPermissions,
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
          linkText: n.linkText,
          metadata: n.metadata,
          isPublic: n.isPublic,
          recipientUid: n.recipientUid,
          accessLevels: n.accessLevels,
          requiredPermissions: n.requiredPermissions,
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
          linkText: n.linkText,
          metadata: n.metadata,
          isPublic: n.isPublic,
          recipientUid: n.recipientUid,
          accessLevels: n.accessLevels,
          requiredPermissions: n.requiredPermissions,
          isRead: n.readStatuses.length > 0,
          createdAt: n.createdAt,
        })),
      ...permissionBasedNotifications
        .filter((n) => !unreadOnly || n.readStatuses.length === 0)
        .map((n) => ({
          uid: n.uid,
          category: n.category,
          title: n.title,
          description: n.description,
          image: n.image,
          link: n.link,
          linkText: n.linkText,
          metadata: n.metadata,
          isPublic: n.isPublic,
          recipientUid: n.recipientUid,
          accessLevels: n.accessLevels,
          requiredPermissions: n.requiredPermissions,
          isRead: n.readStatuses.length > 0,
          createdAt: n.createdAt,
        })),
    ].filter((n) => !this.isSelfAuthoredForumPost(n, memberUid));

    // Filter notifications by requiredPermissions (user must have ANY of the required permissions)
    const notifications: NotificationWithReadStatus[] = [];
    for (const notification of allNotifications) {
      if (notification.requiredPermissions && notification.requiredPermissions.length > 0) {
        const hasPermission = await this.userHasAnyPermission(memberUid, notification.requiredPermissions);
        if (hasPermission) {
          notifications.push(notification);
        }
      } else {
        // No required permissions = visible to all
        notifications.push(notification);
      }
    }

    // Sort: unread first, then by createdAt desc
    notifications.sort((a, b) => {
      // Unread notifications first
      if (a.isRead !== b.isRead) {
        return a.isRead ? 1 : -1;
      }
      // Then by createdAt descending
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const paginatedNotifications = notifications.slice(offset, offset + limit);

    // ---- IRL: compute isAttended + refresh attendees.total from live attendees source ----
    const irlPage = paginatedNotifications.filter(
      (n) =>
        n.category === PushNotificationCategory.IRL_GATHERING &&
        n.metadata &&
        typeof n.metadata === 'object' &&
        (n.metadata as any)?.ui?.locationUid
    );

    const locationUids = [
      ...new Set(irlPage.map((n) => (n.metadata as any)?.ui?.locationUid).filter(Boolean)),
    ] as string[];

    if (locationUids.length > 0) {
      const attendeesTotals = new Map<string, number>();

      await Promise.all(
        locationUids.map(async (locationUid) => {
          try {
            const total = await this.getFreshAttendeesTotal(locationUid);
            attendeesTotals.set(locationUid, total);
          } catch (error) {
            this.logger.warn(
              `Failed to refresh attendees total for IRL notification location ${locationUid}: ${
                error instanceof Error ? error.message : error
              }`
            );
          }
        })
      );

      await Promise.all(
        irlPage.map(async (n) => {
          const metadata = n.metadata as Record<string, any>;
          const loc = metadata?.ui?.locationUid;

          n.isAttended = await this.checkIsAttendedForNotification(memberUid, n);

          if (loc) {
            const freshTotal = attendeesTotals.get(loc);

            if (freshTotal !== undefined) {
              metadata.attendees = {
                ...(metadata.attendees ?? {}),
                total: freshTotal,
              };

              n.metadata = metadata as Prisma.JsonValue;
            }
          }
        })
      );
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
   * - Permission-based: filter by requiredPermissions (user must have ANY of the required permissions)
   */
  async getUnreadCount(memberUid: string): Promise<number> {
    // Get user's access level and creation date
    const member = await this.prisma.member.findFirst({
      where: { uid: memberUid },
      select: { accessLevel: true, createdAt: true },
    });

    const userAccessLevel = member?.accessLevel;
    const memberCreatedAt = member?.createdAt;

    // Count unread private notifications (filter by requiredPermissions)
    const privateNotifications = await this.prisma.pushNotification.findMany({
      where: {
        recipientUid: memberUid,
        isPublic: false,
        isRead: false,
      },
      select: { requiredPermissions: true },
    });

    let privateUnread = 0;
    for (const notification of privateNotifications) {
      if (notification.requiredPermissions && notification.requiredPermissions.length > 0) {
        const hasPermission = await this.userHasAnyPermission(memberUid, notification.requiredPermissions);
        if (hasPermission) {
          privateUnread++;
        }
      } else {
        privateUnread++;
      }
    }

    // Count public notifications not read by this user (filter by requiredPermissions)
    // Filter: notifications created after member joined OR NEW_FEATURE category
    const publicNotifications = await this.prisma.pushNotification.findMany({
      where: {
        isPublic: true,
        readStatuses: {
          none: { memberUid },
        },
        OR: [{ createdAt: { gte: memberCreatedAt } }, { category: PushNotificationCategory.NEW_FEATURE }],
      },
      select: { requiredPermissions: true },
    });

    let publicUnread = 0;
    for (const notification of publicNotifications) {
      if (notification.requiredPermissions && notification.requiredPermissions.length > 0) {
        const hasPermission = await this.userHasAnyPermission(memberUid, notification.requiredPermissions);
        if (hasPermission) {
          publicUnread++;
        }
      } else {
        publicUnread++;
      }
    }

    // Count permission-based notifications not read by this user
    // These are notifications with requiredPermissions set, but no accessLevels and no specific recipient
    // Filter: notifications created after member joined OR NEW_FEATURE category
    const permissionBasedNotifications = await this.prisma.pushNotification.findMany({
      where: {
        requiredPermissions: { isEmpty: false },
        accessLevels: { isEmpty: true },
        isPublic: false,
        recipientUid: null,
        readStatuses: {
          none: { memberUid },
        },
        OR: [{ createdAt: { gte: memberCreatedAt } }, { category: PushNotificationCategory.NEW_FEATURE }],
      },
      select: { requiredPermissions: true, category: true, metadata: true },
    });

    let permissionBasedUnread = 0;
    for (const notification of permissionBasedNotifications) {
      // Skip self-authored forum posts
      if (this.isSelfAuthoredForumPost(notification as any, memberUid)) {
        continue;
      }

      const hasPermission = await this.userHasAnyPermission(memberUid, notification.requiredPermissions);
      if (hasPermission) {
        permissionBasedUnread++;
      }
    }

    return privateUnread + publicUnread + permissionBasedUnread;
  }

  /**
   * Get all unread notification links for a user.
   * Only returns notifications that have a non-null link.
   * Filters by requiredPermissions (user must have ANY of the required permissions).
   */
  async getUnreadLinksForUser(memberUid: string): Promise<Array<{ uid: string; link: string }>> {
    const member = await this.prisma.member.findFirst({
      where: { uid: memberUid },
      select: { accessLevel: true, createdAt: true },
    });

    const userAccessLevel = member?.accessLevel;
    const memberCreatedAt = member?.createdAt;

    // Unread private notifications with links
    const privateLinks = await this.prisma.pushNotification.findMany({
      where: {
        recipientUid: memberUid,
        isPublic: false,
        isRead: false,
        link: { not: null },
      },
      select: { uid: true, link: true, requiredPermissions: true },
    });

    // Unread public notifications with links (no read status for this user)
    // Filter: notifications created after member joined OR NEW_FEATURE category
    const publicLinks = await this.prisma.pushNotification.findMany({
      where: {
        isPublic: true,
        link: { not: null },
        readStatuses: {
          none: { memberUid },
        },
        OR: [{ createdAt: { gte: memberCreatedAt } }, { category: PushNotificationCategory.NEW_FEATURE }],
      },
      select: { uid: true, link: true, requiredPermissions: true },
    });

    // NOTE: Access level notifications are deprecated in favor of permission-based notifications
    // Unread access-level notifications with links
    // Filter: notifications created after member joined OR NEW_FEATURE category
    // const accessLevelLinks = userAccessLevel
    //   ? await this.prisma.pushNotification.findMany({
    //       where: {
    //         accessLevels: { has: userAccessLevel },
    //         isPublic: false,
    //         recipientUid: null,
    //         link: { not: null },
    //         readStatuses: {
    //           none: { memberUid },
    //         },
    //         OR: [{ createdAt: { gte: memberCreatedAt } }, { category: PushNotificationCategory.NEW_FEATURE }],
    //       },
    //       select: { uid: true, link: true, category: true, metadata: true, requiredPermissions: true },
    //     })
    //   : [];
    const accessLevelLinks: any[] = [];

    const filteredAccessLevelLinks = accessLevelLinks.filter((n) => !this.isSelfAuthoredForumPost(n as any, memberUid));

    // Unread permission-based notifications with links
    // Filter: notifications created after member joined OR NEW_FEATURE category
    const permissionBasedLinks = await this.prisma.pushNotification.findMany({
      where: {
        requiredPermissions: { isEmpty: false },
        accessLevels: { isEmpty: true },
        isPublic: false,
        recipientUid: null,
        link: { not: null },
        readStatuses: {
          none: { memberUid },
        },
        OR: [{ createdAt: { gte: memberCreatedAt } }, { category: PushNotificationCategory.NEW_FEATURE }],
      },
      select: { uid: true, link: true, category: true, metadata: true, requiredPermissions: true },
    });

    const filteredPermissionBasedLinks = permissionBasedLinks.filter(
      (n) => !this.isSelfAuthoredForumPost(n as any, memberUid)
    );

    // Combine all links
    const allLinks = [...privateLinks, ...publicLinks, ...filteredAccessLevelLinks, ...filteredPermissionBasedLinks];

    // Filter by requiredPermissions
    const result: Array<{ uid: string; link: string }> = [];
    for (const notification of allLinks) {
      if (notification.requiredPermissions && notification.requiredPermissions.length > 0) {
        const hasPermission = await this.userHasAnyPermission(memberUid, notification.requiredPermissions);
        if (hasPermission) {
          result.push({ uid: notification.uid, link: notification.link as string });
        }
      } else {
        result.push({ uid: notification.uid, link: notification.link as string });
      }
    }
    return result;
  }

  /**
   * Mark a notification as read for a specific user.
   * - Private notifications: update isRead field
   * - Public notifications: insert into PushNotificationReadStatus
   * - Access level notifications: insert into PushNotificationReadStatus
   * - Permission-based notifications: insert into PushNotificationReadStatus
   */
  async markAsRead(uid: string, memberUid: string) {
    // Get user's access level
    const member = await this.prisma.member.findFirst({
      where: { uid: memberUid },
      select: { accessLevel: true },
    });

    const userAccessLevel = member?.accessLevel;

    // Build OR conditions for finding the notification
    const orConditions: Prisma.PushNotificationWhereInput[] = [{ recipientUid: memberUid }, { isPublic: true }];

    // NOTE: Access level notifications are deprecated in favor of permission-based notifications
    // Add access level condition if user has an access level
    // if (userAccessLevel) {
    //   orConditions.push({
    //     accessLevels: { has: userAccessLevel },
    //     isPublic: false,
    //     recipientUid: null,
    //   });
    // }

    // Add permission-based condition (notifications with requiredPermissions but no accessLevels/recipient)
    orConditions.push({
      requiredPermissions: { isEmpty: false },
      accessLevels: { isEmpty: true },
      isPublic: false,
      recipientUid: null,
    });

    const notification = await this.prisma.pushNotification.findFirst({
      where: {
        uid,
        OR: orConditions,
      },
    });

    if (!notification) {
      return null;
    }

    if (
      notification.isPublic ||
      // NOTE: Access level notifications are deprecated
      // (notification.accessLevels.length > 0 && !notification.recipientUid) ||
      (notification.requiredPermissions.length > 0 &&
        !notification.recipientUid &&
        notification.accessLevels.length === 0)
    ) {
      // For public and permission-based notifications, create a read status entry
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
   * - Permission-based: insert read status for unread permission-based notifications user has access to
   */
  async markAllAsRead(memberUid: string) {
    // NOTE: Access level notifications are deprecated in favor of permission-based notifications
    // Get user's access level
    // const member = await this.prisma.member.findFirst({
    //   where: { uid: memberUid },
    //   select: { accessLevel: true },
    // });
    // const userAccessLevel = member?.accessLevel;

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

    // NOTE: Access level notifications are deprecated
    // Get all access level notifications not yet read by this user
    // if (userAccessLevel) {
    //   const unreadAccessLevelNotifications = await this.prisma.pushNotification.findMany({
    //     where: {
    //       accessLevels: { has: userAccessLevel },
    //       isPublic: false,
    //       recipientUid: null,
    //       readStatuses: {
    //         none: { memberUid },
    //       },
    //     },
    //     select: { id: true },
    //   });
    //
    //   // Create read status for all unread access level notifications
    //   if (unreadAccessLevelNotifications.length > 0) {
    //     await this.prisma.pushNotificationReadStatus.createMany({
    //       data: unreadAccessLevelNotifications.map((n) => ({
    //         notificationId: n.id,
    //         memberUid,
    //       })),
    //       skipDuplicates: true,
    //     });
    //   }
    // }

    // Get all permission-based notifications not yet read by this user
    // Filter to only those the user has permissions for
    const unreadPermissionBasedNotifications = await this.prisma.pushNotification.findMany({
      where: {
        requiredPermissions: { isEmpty: false },
        accessLevels: { isEmpty: true },
        isPublic: false,
        recipientUid: null,
        readStatuses: {
          none: { memberUid },
        },
      },
      select: { id: true, requiredPermissions: true },
    });

    // Filter notifications by requiredPermissions and mark as read
    const permissionBasedIdsToMark: number[] = [];
    for (const notification of unreadPermissionBasedNotifications) {
      const hasPermission = await this.userHasAnyPermission(memberUid, notification.requiredPermissions);
      if (hasPermission) {
        permissionBasedIdsToMark.push(notification.id);
      }
    }

    // Create read status for unread permission-based notifications user has access to
    if (permissionBasedIdsToMark.length > 0) {
      await this.prisma.pushNotificationReadStatus.createMany({
        data: permissionBasedIdsToMark.map((id) => ({
          notificationId: id,
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

  /**
   * Send email notification for forum mention
   */
  async sendForumMentionEmail(notification: ForumMentionEmailDto): Promise<void> {
    const metadata = notification.metadata as Record<string, unknown> | undefined;

    if (metadata?.eventType !== 'forum_mention') {
      return;
    }

    try {
      // Get recipient's email from member table using uid (recipientUid)
      const member = await this.prisma.member.findFirst({
        where: { uid: notification.recipientUid },
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

  /**
   * Send push notification + email for guide comment events
   */
  async sendGuideCommentNotification(dto: GuideCommentNotificationDto): Promise<void> {
    const authorName = dto.commentAuthor.name || 'Unknown User';
    const authorPicture = dto.commentAuthor.image?.url || '';

    let title: string;

    switch (dto.eventType) {
      case 'guide_comment':
        title = `${authorName} commented on your Guide "${dto.articleTitle}"`;
        break;
      case 'guide_reply':
        title = `${authorName} replied to your comment on "${dto.articleTitle}"`;
        break;
      case 'guide_mention':
        title = `${authorName} mentioned you in a comment on "${dto.articleTitle}"`;
        break;
    }

    // 1. Send push notification (in-app)
    try {
      await this.create({
        category: dto.category as PushNotificationCategory,
        title,
        description: dto.commentContent,
        link: dto.link,
        recipientUid: dto.recipientUid,
        isPublic: false,
        metadata: {
          authorName,
          authorUid: dto.commentAuthor.uid,
          authorPicture,
          eventType: dto.eventType,
          articleTitle: dto.articleTitle,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to send guide push notification: ${error instanceof Error ? error.message : error}`);
    }

    // 2. Send email notification
    try {
      await this.sendGuideCommentEmail({
        recipientUid: dto.recipientUid,
        authorName,
        authorUid: dto.commentAuthor.uid,
        authorPicture,
        articleTitle: dto.articleTitle,
        commentContent: dto.commentContent,
        link: dto.link,
        eventType: dto.eventType,
      });
    } catch (error) {
      this.logger.error(`Failed to send guide email notification: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Send email notification for guide comment events
   */
  private async sendGuideCommentEmail(params: {
    recipientUid: string;
    authorName: string;
    authorUid: string;
    authorPicture: string;
    articleTitle: string;
    commentContent: string;
    link: string;
    eventType: 'guide_comment' | 'guide_reply' | 'guide_mention';
  }): Promise<void> {
    const member = await this.prisma.member.findFirst({
      where: { uid: params.recipientUid },
      select: { email: true, name: true, uid: true },
    });

    if (!member?.email) {
      this.logger.warn(`Cannot send guide email: member email not found for ${params.recipientUid}`);
      return;
    }

    const templateMap: Record<string, { templateName: string; actionType: string }> = {
      guide_comment: { templateName: 'GUIDE_POST_COMMENT', actionType: 'COMMENT' },
      guide_reply: { templateName: 'GUIDE_POST_REPLIED', actionType: 'REPLY' },
      guide_mention: { templateName: 'GUIDE_MENTION', actionType: 'MENTION' },
    };

    const { templateName, actionType } = templateMap[params.eventType];
    const postLink = `${process.env.WEB_UI_BASE_URL}${params.link}`;

    await this.notificationServiceClient.sendNotification({
      isPriority: true,
      deliveryChannel: 'EMAIL',
      templateName,
      recipientsInfo: {
        to: [member.email],
      },
      deliveryPayload: {
        body: {
          recipientName: member.name || 'there',
          authorName: params.authorName,
          authorPicture: params.authorPicture,
          postContent: params.commentContent,
          postLink,
          postTitle: params.articleTitle,
        },
      },
      entityType: 'GUIDE',
      actionType,
      sourceMeta: {
        activityId: '',
        activityType: `GUIDE_${actionType}`,
        activityUserId: params.authorUid,
        activityUserName: params.authorName,
      },
      targetMeta: {
        emailId: member.email,
        userId: member.uid,
        userName: member.name || '',
      },
    });

    this.logger.log(`Guide ${params.eventType} email sent to ${member.email}`);
  }
}
