import { forwardRef, Module } from '@nestjs/common';
import { NotificationSettingsController } from './notification-settings.controller';
import { NotificationSettingsServiceController } from './notification-settings-service.controller';
import { NotificationSettingsService } from './notification-settings.service';
import { SharedModule } from '../shared/shared.module';
import { MembersModule } from '../members/members.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';

@Module({
  imports: [
    SharedModule,
    AccessControlV2Module,
    RecommendationsModule,
    forwardRef(() => MembersModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [NotificationSettingsController, NotificationSettingsServiceController],
  providers: [NotificationSettingsService],
  exports: [NotificationSettingsService],
})
export class NotificationSettingsModule {}
