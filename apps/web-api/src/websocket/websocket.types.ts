/**
 * WebSocket event types for real-time notifications
 */

// Server -> Client events
export interface NotificationPayload {
  id: string;
  category: string;
  title: string;
  description?: string;
  image?: string;
  link?: string;
  metadata?: Record<string, unknown>;
  isPublic: boolean;
  createdAt: string;
}

export interface NotificationUpdatePayload {
  id: string;
  status: 'read' | 'deleted';
}

export interface NotificationCountPayload {
  unreadCount: number;
}

// Event names
export enum WebSocketEvent {
  // Server -> Client
  NOTIFICATION_NEW = 'notification:new',
  NOTIFICATION_UPDATE = 'notification:update',
  NOTIFICATION_COUNT = 'notification:count',
  CONNECTION_SUCCESS = 'connection:success',
  CONNECTION_ERROR = 'connection:error',

  // Client -> Server
  MARK_READ = 'notification:markRead',
  MARK_ALL_READ = 'notification:markAllRead',
}

// Authenticated socket data
export interface AuthenticatedSocketData {
  memberUid: string;
  email?: string;
  authenticatedAt: Date;
}

// Room naming convention
export const getRoomName = (memberUid: string): string => `user:${memberUid}`;
