# Push Notifications & WebSocket System

This document describes the real-time push notification system using WebSocket (Socket.io) for the PLN Directory Portal.

## Overview

The system provides real-time notifications to users through:
1. **WebSocket Gateway** - Handles real-time bidirectional communication
2. **Push Notifications Service** - Manages notification storage and delivery
3. **REST API** - Endpoints for retrieving and managing notifications

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Client App    │◄────┤  WebSocket GW    │◄────┤   Any Service   │
│  (Socket.io)    │     │  /notifications  │     │  (via WsService)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  Push Notif DB   │
                        │   (PostgreSQL)   │
                        └──────────────────┘
```

## Configuration

### Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ALLOWED_CORS_ORIGINS` | Allowed origins (comma-separated) | `https://app.example.com,https://admin.example.com` |
| `AUTH_API_URL` | Auth service URL for token validation | `https://auth.example.com` |

## WebSocket Gateway

### Connection Details

- **Namespace**: `/notifications`
- **Transports**: `websocket`, `polling`
- **Authentication**: JWT token (required)

### Connecting from Client

```typescript
import { io } from 'socket.io-client';

const socket = io('wss://api.example.com/notifications', {
  auth: {
    token: 'your-jwt-token'
  },
  transports: ['websocket', 'polling']
});

// Handle connection success
socket.on('connection:success', (data) => {
  console.log('Connected as:', data.memberUid);
});

// Handle connection error
socket.on('connection:error', (data) => {
  console.error('Connection failed:', data.message);
});
```

### Events

#### Server to Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `notification:new` | `NotificationPayload` | New notification received |
| `notification:update` | `NotificationUpdatePayload` | Notification status changed (read/deleted) |
| `notification:count` | `NotificationCountPayload` | Unread count updated |
| `connection:success` | `{ memberUid: string }` | Successfully authenticated |
| `connection:error` | `{ message: string }` | Authentication/connection failed |

#### Client to Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `notification:markRead` | `{ id: string }` | Mark a notification as read |
| `notification:markAllRead` | - | Mark all notifications as read |

### Payload Types

```typescript
interface NotificationPayload {
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

interface NotificationUpdatePayload {
  id: string;
  status: 'read' | 'deleted';
}

interface NotificationCountPayload {
  unreadCount: number;
}
```

## REST API Endpoints

All endpoints require authentication via the `UserTokenValidation` guard.

### Get Notifications

```
GET /v1/push-notifications
```

**Query Parameters:**
- `limit` (number, default: 50) - Number of notifications to return
- `offset` (number, default: 0) - Pagination offset
- `unreadOnly` (boolean, default: false) - Only return unread notifications

**Response:**
```json
{
  "notifications": [...],
  "total": 100,
  "unreadCount": 5
}
```

### Get Unread Count

```
GET /v1/push-notifications/unread-count
```

**Response:**
```json
{
  "unreadCount": 5
}
```

### Mark as Read

```
PATCH /v1/push-notifications/:uid/read
```

**Response:**
```json
{
  "success": true,
  "notification": {...}
}
```

### Mark All as Read

```
POST /v1/push-notifications/mark-all-read
```

**Response:**
```json
{
  "success": true
}
```

### Delete Notification

```
DELETE /v1/push-notifications/:uid
```

**Response:**
```json
{
  "success": true
}
```

## Admin API Endpoints

Admin endpoints require authentication via the `AdminAuthGuard`.

### Broadcast Notification (to all users)

```
POST /v1/admin/push-notifications/broadcast
```

**Request Body:**
```json
{
  "category": "SYSTEM",
  "title": "System Announcement",
  "description": "Optional description",
  "image": "https://example.com/image.png",
  "link": "/announcements/123",
  "metadata": {}
}
```

**Response:**
```json
{
  "success": true,
  "notification": {
    "uid": "cuid...",
    "title": "System Announcement",
    "category": "SYSTEM",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Send Notification to Specific User

```
POST /v1/admin/push-notifications/send
```

**Request Body:**
```json
{
  "recipientUid": "member-uid-here",
  "category": "SYSTEM",
  "title": "Personal Notification",
  "description": "Optional description"
}
```

**Response:**
```json
{
  "success": true,
  "notification": {
    "uid": "cuid...",
    "title": "Personal Notification",
    "category": "SYSTEM",
    "recipientUid": "member-uid-here",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

## Notification Categories

| Category | Description |
|----------|-------------|
| `DEMO_DAY_LIKE` | Someone liked a demo day presentation |
| `DEMO_DAY_CONNECT` | Connection request from demo day |
| `DEMO_DAY_INVEST` | Investment interest from demo day |
| `DEMO_DAY_REFERRAL` | Referral from demo day |
| `DEMO_DAY_FEEDBACK` | Feedback received on demo day |
| `FORUM_POST` | New forum post notification |
| `FORUM_REPLY` | Reply to a forum post |
| `EVENT` | Event-related notification |
| `SYSTEM` | System notification |

## Database Schema

```prisma
model PushNotification {
  id           Int                      @id @default(autoincrement())
  uid          String                   @unique @default(cuid())
  category     PushNotificationCategory
  title        String
  description  String?
  image        String?                  // URL to image
  link         String?                  // URL or route to navigate to
  metadata     Json?                    @default("{}")
  isPublic     Boolean                  @default(false)
  recipientUid String?                  // Optional: specific user (null = broadcast)
  isRead       Boolean                  @default(false)  // For private notifications
  isSent       Boolean                  @default(false)
  sentAt       DateTime?
  createdAt    DateTime                 @default(now())
  updatedAt    DateTime                 @updatedAt

  readStatuses PushNotificationReadStatus[]  // For public notifications
}

// Tracks read status per user for public notifications
model PushNotificationReadStatus {
  id             Int              @id @default(autoincrement())
  notificationId Int
  notification   PushNotification @relation(fields: [notificationId], references: [id], onDelete: Cascade)
  memberUid      String
  member         Member           @relation(fields: [memberUid], references: [uid], onDelete: Cascade)
  readAt         DateTime         @default(now())

  @@unique([notificationId, memberUid])
  @@index([memberUid])
  @@index([notificationId])
}
```

### Read Status Handling

The system handles read status differently for public and private notifications:

- **Private notifications** (`isPublic: false`): Use the `isRead` field directly on the `PushNotification` model. When marked as read, the field is updated to `true`.

- **Public notifications** (`isPublic: true`): Use the `PushNotificationReadStatus` junction table to track read status per user. This allows each user to have their own read status for broadcast notifications.

## Sending Notifications from Backend Services

### Import and Inject

```typescript
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

@Injectable()
export class YourService {
  constructor(
    private readonly pushNotificationsService: PushNotificationsService
  ) {}
}
```

### Send to Specific User

```typescript
await this.pushNotificationsService.create({
  category: PushNotificationCategory.DEMO_DAY_LIKE,
  title: 'New Like!',
  description: 'John Doe liked your presentation',
  link: '/demo-days/123',
  recipientUid: 'user-uid-here',
});
```

### Broadcast to All Users

```typescript
await this.pushNotificationsService.create({
  category: PushNotificationCategory.SYSTEM,
  title: 'System Maintenance',
  description: 'Scheduled maintenance at 2:00 AM UTC',
  isPublic: true,
});
```

### Using WebSocket Service Directly

For sending real-time events without database persistence:

```typescript
import { WebSocketService } from '../websocket/websocket.service';

@Injectable()
export class YourService {
  constructor(private readonly wsService: WebSocketService) {}

  async sendUpdate() {
    // Send to specific user
    await this.wsService.notifyUser('member-uid', payload);

    // Broadcast to all connected users
    await this.wsService.broadcast(payload);

    // Check if user is online
    const isOnline = this.wsService.isUserConnected('member-uid');
  }
}
```

## Client Integration Example

### React Example

```typescript
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useNotifications(token: string) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const newSocket = io(`${API_URL}/notifications`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connection:success', () => {
      console.log('Connected to notifications');
    });

    newSocket.on('notification:new', (notification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
    });

    newSocket.on('notification:update', ({ id, status }) => {
      if (status === 'read') {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
      } else if (status === 'deleted') {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }
    });

    newSocket.on('notification:count', ({ unreadCount }) => {
      setUnreadCount(unreadCount);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token]);

  const markAsRead = (id: string) => {
    socket?.emit('notification:markRead', { id });
  };

  const markAllAsRead = () => {
    socket?.emit('notification:markAllRead');
  };

  return { notifications, unreadCount, markAsRead, markAllAsRead };
}
```

## Room-Based Architecture

Each authenticated user is automatically joined to a personal room named `user:{memberUid}`. This ensures:

- Notifications are delivered only to the intended recipient
- Users can be connected from multiple devices/tabs simultaneously
- All connected sessions receive the same notifications in real-time

## Development Mode

When `AUTH_API_URL` is not configured, the gateway operates in development mode:
- JWT tokens are decoded but not validated against the auth service
- Useful for local development and testing

**Warning**: Never use development mode in production.

## Monitoring

The WebSocket service provides methods for monitoring:

```typescript
// Get count of connected users
const count = this.wsService.getConnectedUsersCount();

// Check if specific user is online
const isOnline = this.wsService.isUserConnected('member-uid');
```

## File Structure

```
apps/web-api/src/
├── websocket/
│   ├── websocket.gateway.ts    # Socket.io gateway with auth
│   ├── websocket.service.ts    # Service for emitting events
│   ├── websocket.module.ts     # Module configuration (Global)
│   └── websocket.types.ts      # TypeScript types and enums
├── push-notifications/
│   ├── push-notifications.controller.ts       # User REST API endpoints
│   ├── admin-push-notifications.controller.ts # Admin REST API endpoints
│   ├── push-notifications.service.ts          # Business logic
│   └── push-notifications.module.ts           # Module configuration
```
