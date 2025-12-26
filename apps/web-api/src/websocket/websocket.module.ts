import { Module, Global } from '@nestjs/common';
import { NotificationGateway } from './websocket.gateway';
import { WebSocketService } from './websocket.service';

/**
 * WebSocket module for real-time notifications.
 *
 * Features:
 * - Socket.io WebSocket Gateway with JWT authentication
 * - Room-based architecture for user-specific notifications
 * - Automatic reconnection handling
 *
 * Usage:
 * 1. Import WebSocketModule in your app module
 * 2. Configure variables:
 *    - ALLOWED_CORS_ORIGINS: Allowed origins (comma-separated)
 *    - AUTH_API_URL: Auth service URL for token validation
 * 3. Inject WebSocketService to emit notifications:
 *    ```
 *    constructor(private wsService: WebSocketService) {}
 *    await this.wsService.notifyUser(memberUid, payload);
 *    ```
 */
@Global()
@Module({
  providers: [NotificationGateway, WebSocketService],
  exports: [WebSocketService],
})
export class WebSocketModule {}
