import { Module } from '@nestjs/common';
import { MemberFeedbacksService } from './member-feedbacks.service'
import { MemberFollowUpsModule } from '../member-follow-ups/member-follow-ups.module';
import { MemberInteractionAdjustmentsModule } from '../member-interaction-adjustments/member-interaction-adjustments.module';

@Module({
  imports: [
    MemberFollowUpsModule,
    MemberInteractionAdjustmentsModule
  ],
  controllers: [],
  providers: [
    MemberFeedbacksService
  ],
  exports: [
    MemberFeedbacksService
  ]
})
export class MemberFeedbacksModule {}
