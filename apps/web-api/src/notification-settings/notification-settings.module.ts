import { Module } from '@nestjs/common';
import { NotificationSettingsController } from './notification-settings.controller';
import { NotificationSettingsService } from './notification-settings.service';
import { SharedModule } from '../shared/shared.module';
import { MembersModule } from '../members/members.module';

@Module({
  imports: [SharedModule, MembersModule],
  controllers: [NotificationSettingsController],
  providers: [NotificationSettingsService],
})
export class NotificationSettingsModule {}
