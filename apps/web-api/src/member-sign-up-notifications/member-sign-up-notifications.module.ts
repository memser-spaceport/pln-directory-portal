import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { MemberSignUpNotificationsService } from './member-sign-up-notifications.service';

@Module({
  imports: [SharedModule],
  providers: [MemberSignUpNotificationsService, NotificationServiceClient],
  exports: [MemberSignUpNotificationsService],
})
export class MemberSignUpNotificationsModule {}
