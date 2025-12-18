import { Module, forwardRef } from '@nestjs/common';
import { DemoDaysService } from './demo-days.service';
import { DemoDayParticipantsService } from './demo-day-participants.service';
import { DemoDayFundraisingProfilesService } from './demo-day-fundraising-profiles.service';
import { DemoDaysController } from './demo-days.controller';
import { DemoDaySubscriptionsController } from './demo-day-subscriptions.controller';
import { SharedModule } from '../shared/shared.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { DemoDayEngagementService } from './demo-day-engagement.service';
import { MembersModule } from '../members/members.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TeamsModule } from '../teams/teams.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [
    SharedModule,
    UploadsModule,
    AnalyticsModule,
    forwardRef(() => MembersModule),
    forwardRef(() => TeamsModule),
    NotificationsModule,
    PushNotificationsModule,
  ],
  controllers: [DemoDaysController, DemoDaySubscriptionsController],
  providers: [DemoDaysService, DemoDayParticipantsService, DemoDayFundraisingProfilesService, DemoDayEngagementService],
  exports: [DemoDaysService, DemoDayParticipantsService, DemoDayFundraisingProfilesService],
})
export class DemoDaysModule {}
