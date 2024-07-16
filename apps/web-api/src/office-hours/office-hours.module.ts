import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { OfficeHoursService } from './office-hours.service';
import { OfficeHoursController } from './office-hours.controller';
import { MemberFollowUpsModule } from '../member-follow-ups/member-follow-ups.module';
import { MemberFeedbacksModule } from '../member-feedbacks/member-feedbacks.module';

@Module({
  imports: [
    MembersModule,
    MemberFollowUpsModule,
    MemberFeedbacksModule
  ],
  controllers: [OfficeHoursController],
  providers: [
    OfficeHoursService 
  ],
  exports: [
    OfficeHoursService
  ]
})
export class OfficeHoursModule {}