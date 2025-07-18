import { forwardRef, Module } from '@nestjs/common';
import { NotificationSettingsController } from './notification-settings.controller';
import { NotificationSettingsService } from './notification-settings.service';
import { SharedModule } from '../shared/shared.module';
import { MembersModule } from '../members/members.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';

@Module({
  imports: [SharedModule, RecommendationsModule, forwardRef(() => MembersModule)],
  controllers: [NotificationSettingsController],
  providers: [NotificationSettingsService],
  exports: [NotificationSettingsService],
})
export class NotificationSettingsModule {}
