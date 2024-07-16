import { Module } from '@nestjs/common';
import { MemberFeedbacksService } from './member-feedbacks.service'
import { MemberFollowUpsModule } from '../member-follow-ups/member-follow-ups.module';

@Module({
  imports: [
    MemberFollowUpsModule
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