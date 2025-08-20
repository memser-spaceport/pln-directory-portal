import {forwardRef, Module} from '@nestjs/common';
import {MembersModule} from '../members/members.module';
import {OfficeHoursService} from './office-hours.service';
import {OfficeHoursController} from './office-hours.controller';
import {MemberFollowUpsModule} from '../member-follow-ups/member-follow-ups.module';
import {MemberFeedbacksModule} from '../member-feedbacks/member-feedbacks.module';
import {NotificationsModule} from '../notifications/notifications.module';
import {
  MemberInteractionAdjustmentsModule
} from "../member-interaction-adjustments/member-interaction-adjustments.module";

@Module({
  imports: [forwardRef(() => MembersModule), MemberFollowUpsModule, MemberFeedbacksModule, NotificationsModule, MemberInteractionAdjustmentsModule],
  controllers: [OfficeHoursController],
  providers: [OfficeHoursService],
  exports: [OfficeHoursService],
})
export class OfficeHoursModule {}
