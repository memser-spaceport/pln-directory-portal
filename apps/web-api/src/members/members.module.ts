import { Module } from '@nestjs/common';
import { MemberController } from './members.controller';
import { MembersService } from './members.service';
import { MembersHooksService } from './members.hooks.service';
import { OnboardingRemindersJob } from './onboarding-reminders.job';
import { ParticipantsRequestModule } from '../participants-request/participants-request.module';
import { OtpModule } from '../otp/otp.module';
import { SharedModule } from '../shared/shared.module';
import { AuthModule } from '../auth/auth.module';
import { HuskyModule } from '../husky/husky.module';
import { NotificationSettingsModule } from '../notification-settings/notification-settings.module';

@Module({
  imports: [SharedModule, AuthModule, OtpModule, ParticipantsRequestModule, HuskyModule, NotificationSettingsModule],
  providers: [MembersService, MembersHooksService, OnboardingRemindersJob],
  controllers: [MemberController],
  exports: [MembersService, MembersHooksService, OnboardingRemindersJob],
})
export class MembersModule {}
