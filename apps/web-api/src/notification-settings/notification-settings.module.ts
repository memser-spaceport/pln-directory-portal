import { forwardRef, Module } from '@nestjs/common';
import { NotificationSettingsController } from './notification-settings.controller';
import { NotificationSettingsServiceController } from './notification-settings-service.controller';
import { NotificationSettingsService } from './notification-settings.service';
import { SharedModule } from '../shared/shared.module';
import { MembersModule } from '../members/members.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    SharedModule,
    RecommendationsModule,
    forwardRef(() => MembersModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [NotificationSettingsController, NotificationSettingsServiceController],
  providers: [NotificationSettingsService],
  exports: [NotificationSettingsService],
})
export class NotificationSettingsModule {}
