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
import { JobOpeningsSavedService } from './job-openings-saved.service';
import { JobOpeningsSignUpService } from './job-openings-sign-up.service';
import { SharedModule } from '../shared/shared.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MembersModule } from '../members/members.module';
import { IntegrationKeysModule } from '../integration-keys/integration-keys.module';
import { JobOpeningsIntegrationController } from './job-openings-integration.controller';
import { JobOpeningsIntegrationService } from './job-openings-integration.service';

@Module({
  imports: [
    SharedModule,
    NotificationsModule,
    forwardRef(() => MembersModule),
    IntegrationKeysModule,
  ],
  controllers: [JobOpeningsController, JobOpeningsServiceController, JobOpeningsIntegrationController],
  providers: [
    JobOpeningsQueryService,
    JobOpeningsForYouService,
    JobOpeningsService,
    JobOpeningsIntegrationService,
    JobOpeningsEnrichmentService,
    JobOpeningsReferralService,
    JobOpeningsApplicationService,
    JobOpeningsSignUpService,
    JobOpeningsInterestService,
    JobOpeningsSavedService,
  ],
  exports: [JobOpeningsQueryService, JobOpeningsService, JobOpeningsEnrichmentService],
})
export class JobOpeningsModule {}
