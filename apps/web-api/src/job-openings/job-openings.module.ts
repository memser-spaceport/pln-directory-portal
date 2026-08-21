import { Module, forwardRef } from '@nestjs/common';
import { JobOpeningsController } from './job-openings.controller';
import { JobOpeningsQueryService } from './job-openings-query.service';
import { JobOpeningsService } from './job-openings.service';
import { JobOpeningsServiceController } from './job-openings-service.controller';
import { JobOpeningsEnrichmentService } from './job-openings-enrichment.service';
import { JobOpeningsReferralService } from './job-openings-referral.service';
import { JobOpeningsApplicationService } from './job-openings-application.service';
import { JobOpeningsSignUpService } from './job-openings-sign-up.service';
import { SharedModule } from '../shared/shared.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MembersModule } from '../members/members.module';

@Module({
  imports: [SharedModule, NotificationsModule, forwardRef(() => MembersModule)],
  controllers: [JobOpeningsController, JobOpeningsServiceController],
  providers: [
    JobOpeningsQueryService,
    JobOpeningsService,
    JobOpeningsEnrichmentService,
    JobOpeningsReferralService,
    JobOpeningsApplicationService,
    JobOpeningsSignUpService,
  ],
  exports: [JobOpeningsQueryService, JobOpeningsService, JobOpeningsEnrichmentService],
})
export class JobOpeningsModule {}
