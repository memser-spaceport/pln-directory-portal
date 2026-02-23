import { CacheModule, forwardRef, Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtService } from '../utils/jwt/jwt.service';
import { SharedModule } from '../shared/shared.module';
import { AdminAuthController } from './auth.controller';
import { MemberController } from './member.controller';
import { MembersModule } from '../members/members.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { MemberService } from './member.service';
import { AuthModule } from '../auth/auth.module';
import { OtpModule } from '../otp/otp.module';
import { HuskyModule } from '../husky/husky.module';
import { NotificationSettingsModule } from '../notification-settings/notification-settings.module';
import { AdminDemoDaysController } from './demo-day.controller';
import { DemoDaysModule } from '../demo-days/demo-days.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AdminTeamsController } from './admin-teams.controller';
import { AdminTeamsService } from './admin-teams.service';
import { ParticipantsRequestModule } from '../participants-request/participants-request.module';
import { TeamsModule } from '../teams/teams.module';
import { AskModule } from '../asks/asks.module';

@Module({
  imports: [
    CacheModule.register(),
    SharedModule,
    RecommendationsModule,
    AuthModule,
    AskModule,
    OtpModule,
    forwardRef(() => ParticipantsRequestModule),
    forwardRef(() => TeamsModule),
    HuskyModule,
    NotificationSettingsModule,
    NotificationsModule,
    forwardRef(() => MembersModule),
    DemoDaysModule,
    AnalyticsModule,
  ],
  controllers: [
    AdminAuthController,
    MemberController,
    RecommendationsController,
    AdminDemoDaysController,
    AdminTeamsController,
  ],
  exports: [MemberService],
  providers: [AdminService, MemberService, JwtService, AdminTeamsService],
})
export class AdminModule {}
