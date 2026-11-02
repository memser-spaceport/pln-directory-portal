import { Module, forwardRef } from '@nestjs/common';
import { MemberController } from './members.controller';
import { MembersService } from './members.service';
import { MembersHooksService } from './members.hooks.service';
import { InvestorProfileService } from './investor-profile.service';
import { OnboardingRemindersJob } from './onboarding-reminders.job';
import { ParticipantsRequestModule } from '../participants-request/participants-request.module';
import { OtpModule } from '../otp/otp.module';
import { SharedModule } from '../shared/shared.module';
import { AuthModule } from '../auth/auth.module';
import { HuskyModule } from '../husky/husky.module';
import { NotificationSettingsModule } from '../notification-settings/notification-settings.module';
import { OfficeHoursModule } from '../office-hours/office-hours.module';
import { TeamsModule } from '../teams/teams.module';
import { OpenSearchModule } from '../opensearch/opensearch.module';
import { MemberApprovalsModule } from '../member-approvals/member-approvals.module';
import { NewsTagVocabularyService } from '../team-news/news-tag-vocabulary.service';

@Module({
  imports: [
    SharedModule,
    AuthModule,
    OtpModule,
    ParticipantsRequestModule,
    HuskyModule,
    OpenSearchModule,
    forwardRef(() => MemberApprovalsModule),
    forwardRef(() => NotificationSettingsModule),
    forwardRef(() => OfficeHoursModule),
    forwardRef(() => TeamsModule),
  ],
  // NewsTagVocabularyService depends only on Prisma, so it is provided here rather
  // than importing TeamNewsModule, which already depends on this module.
  providers: [
    MembersService,
    MembersHooksService,
    InvestorProfileService,
    OnboardingRemindersJob,
    NewsTagVocabularyService,
  ],
  controllers: [MemberController],
  exports: [MembersService, MembersHooksService, InvestorProfileService, OnboardingRemindersJob],
})
export class MembersModule {}
