import { Injectable, Logger } from '@nestjs/common';
import { NotificationGateway } from './websocket.gateway';
import { PrismaService } from '../shared/prisma.service';
import {
  getRoomName,
  NotificationCountPayload,
  NotificationPayload,
  NotificationUpdatePayload,
  WebSocketEvent,
} from './websocket.types';

/**
 * Service for emitting WebSocket events to connected clients.
 */
@Injectable()
export class WebSocketService {
  private readonly logger = new Logger(WebSocketService.name);

  constructor(private readonly gateway: NotificationGateway, private readonly prisma: PrismaService) {}

  /**
   * Send a new notification to a specific user
   */
  async notifyUser(memberUid: string, payload: NotificationPayload): Promise<void> {
    const roomName = getRoomName(memberUid);

    if (!this.gateway.server) {
      this.logger.warn('WebSocket server not initialized');
      return;
    }

    this.gateway.server.to(roomName).emit(WebSocketEvent.NOTIFICATION_NEW, payload);
    this.logger.debug(`Notification sent to user ${memberUid}: ${payload.id}`);
  }

  /**
   * Send notification update (read/deleted status) to a user
   */
  async notifyUpdate(memberUid: string, payload: NotificationUpdatePayload): Promise<void> {
    const roomName = getRoomName(memberUid);

    if (!this.gateway.server) {
      this.logger.warn('WebSocket server not initialized');
      return;
    }

    this.gateway.server.to(roomName).emit(WebSocketEvent.NOTIFICATION_UPDATE, payload);
    this.logger.debug(`Update sent to user ${memberUid}: ${payload.id} -> ${payload.status}`);
  }

  /**
   * Send unread count update to a user
   */
  async notifyCount(memberUid: string, payload: NotificationCountPayload): Promise<void> {
    const roomName = getRoomName(memberUid);

    if (!this.gateway.server) {
      this.logger.warn('WebSocket server not initialized');
      return;
    }

    this.gateway.server.to(roomName).emit(WebSocketEvent.NOTIFICATION_COUNT, payload);
    this.logger.debug(`Count update sent to user ${memberUid}: ${payload.unreadCount}`);
  }

  /**
   * Send notification to multiple users
   */
  async notifyUsers(memberUids: string[], payload: NotificationPayload): Promise<void> {
    for (const uid of memberUids) {
      await this.notifyUser(uid, payload);
    }
  }

  /**
   * Broadcast notification to all connected users (for public notifications)
   */
  async broadcast(payload: NotificationPayload): Promise<void> {
    if (!this.gateway.server) {
      this.logger.warn('WebSocket server not initialized');
      return;
    }

    this.gateway.server.emit(WebSocketEvent.NOTIFICATION_NEW, payload);
    this.logger.debug(`Broadcast notification: ${payload.id}`);
  }

  /**
   * Send notification to all users with specified access levels
   */
  async notifyByAccessLevels(accessLevels: string[], payload: NotificationPayload): Promise<void> {
    if (!this.gateway.server) {
      this.logger.warn('WebSocket server not initialized');
      return;
    }

    if (!accessLevels || accessLevels.length === 0) {
      this.logger.warn('No access levels specified for notification');
      return;
    }

    // Query database for all members with the specified access levels
    const members = await this.prisma.member.findMany({
      where: {
        accessLevel: { in: accessLevels },
        externalId: { not: null },
      },
      select: {
        externalId: true,
      },
    });

    // Send notification to all members with matching access levels (both connected and disconnected)
    // Connected users will receive it immediately, others will see it when they fetch notifications
    for (const member of members) {
      if (member.externalId) {
        const roomName = getRoomName(member.externalId);
        this.gateway.server.to(roomName).emit(WebSocketEvent.NOTIFICATION_NEW, payload);
      }
    }

    this.logger.debug(
      `Notification sent to ${members.length} users with access levels ${accessLevels.join(', ')}: ${payload.id}`
    );
  }

  /**
   * Check if a user is currently connected
   */
  isUserConnected(memberUid: string): boolean {
    return this.gateway.isUserConnected(memberUid);
  }

  /**
   * Get count of connected users (for monitoring)
   */
  getConnectedUsersCount(): number {
    return this.gateway.getConnectedUsersCount();
  }
}
