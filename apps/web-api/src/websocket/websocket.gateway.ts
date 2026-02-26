import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import axios from 'axios';
import { PrismaService } from '../shared/prisma.service';
import { AuthenticatedSocketData, getRoomName, WebSocketEvent } from './websocket.types';
import { ALLOWED_CORS_ORIGINS, APP_ENV } from '../utils/constants';

// Extended socket type with authentication data
interface AuthenticatedSocket extends Socket {
  data: AuthenticatedSocketData;
}

@WebSocketGateway({
  cors: {
    origin: ALLOWED_CORS_ORIGINS[process.env.ENVIRONMENT || APP_ENV.DEV],
    credentials: true,
  },
  namespace: '/notifications',
  transports: ['websocket', 'polling'],
})
export class NotificationGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private connectedUsers: Map<string, Set<string>> = new Map(); // memberUid -> Set<socketId>

  constructor(private readonly prisma: PrismaService) {}

  afterInit() {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = client.handshake.auth?.['token'] || client.handshake.query?.['token'];

      if (!token) {
        this.logger.warn(`Connection rejected: No token provided. Socket ID: ${client.id}`);
        client.emit(WebSocketEvent.CONNECTION_ERROR, { message: 'Authentication required' });
        client.disconnect(true);
        return;
      }

      // Validate token and extract user info
      const userInfo = await this.validateToken(token as string);

      if (!userInfo || !userInfo.sub) {
        this.logger.warn(`Connection rejected: Invalid token. Socket ID: ${client.id}`);
        client.emit(WebSocketEvent.CONNECTION_ERROR, { message: 'Invalid token' });
        client.disconnect(true);
        return;
      }

      // Resolve auth sub claim (externalId) to stable member.uid
      const memberUid = await this.resolveMemberUid(userInfo.sub);
      if (!memberUid) {
        this.logger.warn(`Connection rejected: No member found for sub ${userInfo.sub}. Socket ID: ${client.id}`);
        client.emit(WebSocketEvent.CONNECTION_ERROR, { message: 'Member not found' });
        client.disconnect(true);
        return;
      }

      // Store authenticated data on socket
      const authenticatedClient = client as AuthenticatedSocket;
      authenticatedClient.data = {
        memberUid,
        email: userInfo.email,
        authenticatedAt: new Date(),
      };

      // Join user's personal room
      const roomName = getRoomName(memberUid);
      await client.join(roomName);

      // Track connected user
      this.addConnectedUser(memberUid, client.id);

      this.logger.debug(`Client connected: ${client.id}, User: ${memberUid}, Room: ${roomName}`);

      // Emit success event
      client.emit(WebSocketEvent.CONNECTION_SUCCESS, { memberUid });
    } catch (error) {
      this.logger.error(`Connection error: ${error instanceof Error ? error.message : error}`);
      client.emit(WebSocketEvent.CONNECTION_ERROR, { message: 'Connection failed' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const authenticatedClient = client as AuthenticatedSocket;
    const memberUid = authenticatedClient.data?.memberUid;

    if (memberUid) {
      this.removeConnectedUser(memberUid, client.id);
      this.logger.debug(`Client disconnected: ${client.id}, User: ${memberUid}`);
    } else {
      this.logger.debug(`Unauthenticated client disconnected: ${client.id}`);
    }
  }

  @SubscribeMessage(WebSocketEvent.MARK_READ)
  handleMarkRead(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() payload: { id: string }): void {
    const memberUid = client.data?.memberUid;
    if (!memberUid) {
      this.logger.warn('Mark read attempted by unauthenticated client');
      return;
    }

    this.logger.debug(`Mark read: notification ${payload.id} by user ${memberUid}`);
    // Emit to all user's connected devices
    const roomName = getRoomName(memberUid);
    this.server.to(roomName).emit(WebSocketEvent.NOTIFICATION_UPDATE, {
      id: payload.id,
      status: 'read',
    });
  }

  @SubscribeMessage(WebSocketEvent.MARK_ALL_READ)
  handleMarkAllRead(@ConnectedSocket() client: AuthenticatedSocket): void {
    const memberUid = client.data?.memberUid;
    if (!memberUid) {
      this.logger.warn('Mark all read attempted by unauthenticated client');
      return;
    }

    this.logger.debug(`Mark all read by user ${memberUid}`);
    // Emit count update to all user's connected devices
    const roomName = getRoomName(memberUid);
    this.server.to(roomName).emit(WebSocketEvent.NOTIFICATION_COUNT, {
      unreadCount: 0,
    });
  }

  /**
   * Resolve an auth sub claim (externalId) to the stable member.uid.
   * Falls back to checking if the value is already a member.uid.
   */
  private async resolveMemberUid(sub: string): Promise<string | null> {
    // Try externalId first (the normal case — sub comes from auth provider)
    const byExternalId = await this.prisma.member.findFirst({
      where: { externalId: sub },
      select: { uid: true },
    });
    if (byExternalId) return byExternalId.uid;

    // Fallback: check if the value is already a member.uid (dev tokens)
    const byUid = await this.prisma.member.findFirst({
      where: { uid: sub },
      select: { uid: true },
    });
    return byUid?.uid ?? null;
  }

  /**
   * Validate JWT token against auth service
   */
  private async validateToken(token: string): Promise<{ sub: string; email?: string } | null> {
    const authApiUrl = process.env['AUTH_API_URL'];

    // If no auth API configured, try to decode token directly (development mode)
    if (!authApiUrl) {
      this.logger.warn('AUTH_API_URL not configured. Using development mode token parsing.');
      return this.parseTokenDev(token);
    }

    try {
      const response = await axios.post(
        `${authApiUrl}/auth/introspect`,
        { token },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000,
        }
      );

      // Auth introspect returns: { active: boolean, email: string, sub: string }
      if (response.data?.active && response.data?.sub) {
        return {
          sub: response.data.sub,
          email: response.data.email,
        };
      }

      return null;
    } catch (error) {
      this.logger.error(`Token validation failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  /**
   * Development mode: parse token without validation
   * WARNING: Only use in development environments
   */
  private parseTokenDev(token: string): { sub: string; email?: string } | null {
    try {
      // Simple JWT decode (without verification) for development
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));

      if (payload.uid || payload.memberUid || payload.sub) {
        return {
          sub: payload.uid || payload.memberUid || payload.sub,
          email: payload.email,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Track connected users for debugging and monitoring
   */
  private addConnectedUser(memberUid: string, socketId: string): void {
    if (!this.connectedUsers.has(memberUid)) {
      this.connectedUsers.set(memberUid, new Set());
    }
    this.connectedUsers.get(memberUid)?.add(socketId);
  }

  private removeConnectedUser(memberUid: string, socketId: string): void {
    const sockets = this.connectedUsers.get(memberUid);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.connectedUsers.delete(memberUid);
      }
    }
  }

  /**
   * Get count of connected users (for monitoring)
   */
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Check if a user is currently connected
   */
  isUserConnected(memberUid: string): boolean {
    return this.connectedUsers.has(memberUid);
  }
}
