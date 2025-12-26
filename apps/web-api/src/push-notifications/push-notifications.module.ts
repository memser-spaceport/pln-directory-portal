import { Module, forwardRef } from '@nestjs/common';
import { PushNotificationsController } from './push-notifications.controller';
import { AdminPushNotificationsController } from './admin-push-notifications.controller';
import { PushNotificationsService } from './push-notifications.service';
import { SharedModule } from '../shared/shared.module';
import { MembersModule } from '../members/members.module';
import { JwtService } from '../utils/jwt/jwt.service';

/**
 * Module for push notifications (WebSocket-based real-time notifications).
 * Uses the local WebSocketModule for delivery.
 */
@Module({
  imports: [SharedModule, forwardRef(() => MembersModule)],
  controllers: [PushNotificationsController, AdminPushNotificationsController],
  providers: [PushNotificationsService, JwtService],
  exports: [PushNotificationsService],
})
export class PushNotificationsModule {}
