import { Module, forwardRef } from '@nestjs/common';
import { JobOpeningsController } from './job-openings.controller';
import { JobOpeningsQueryService } from './job-openings-query.service';
import { JobOpeningsForYouService } from './job-openings-for-you.service';
import { JobOpeningsService } from './job-openings.service';
import { JobOpeningsServiceController } from './job-openings-service.controller';
import { JobOpeningsEnrichmentService } from './job-openings-enrichment.service';
import { JobOpeningsReferralService } from './job-openings-referral.service';
import { JobOpeningsApplicationService } from './job-openings-application.service';
import { JobOpeningsInterestService } from './job-openings-interest.service';
import { JobOpeningsSignUpService } from './job-openings-sign-up.service';
import { SharedModule } from '../shared/shared.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MembersModule } from '../members/members.module';
import { TeamNewsModule } from '../team-news/team-news.module';

@Module({
  imports: [
    SharedModule,
    NotificationsModule,
    forwardRef(() => MembersModule),
    // forwardRef: this reaches TeamNewsSuggestionsService for the For You feed's
    // team signal, and team-news reaches members, which reaches back here.
    forwardRef(() => TeamNewsModule),
  ],
  controllers: [JobOpeningsController, JobOpeningsServiceController],
  providers: [
    JobOpeningsQueryService,
    JobOpeningsForYouService,
    JobOpeningsService,
    JobOpeningsEnrichmentService,
    JobOpeningsReferralService,
    JobOpeningsApplicationService,
    JobOpeningsSignUpService,
    JobOpeningsInterestService,
  ],
  exports: [JobOpeningsQueryService, JobOpeningsService, JobOpeningsEnrichmentService],
})
export class JobOpeningsModule {}
