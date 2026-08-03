import { Module } from '@nestjs/common';
import { JobOpeningsController } from './job-openings.controller';
import { JobOpeningsQueryService } from './job-openings-query.service';
import { JobOpeningsService } from './job-openings.service';
import { JobOpeningsServiceController } from './job-openings-service.controller';
import { JobOpeningsEnrichmentService } from './job-openings-enrichment.service';
import { JobOpeningsReferralService } from './job-openings-referral.service';
import { SharedModule } from '../shared/shared.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [SharedModule, NotificationsModule],
  controllers: [JobOpeningsController, JobOpeningsServiceController],
  providers: [JobOpeningsQueryService, JobOpeningsService, JobOpeningsEnrichmentService, JobOpeningsReferralService],
  exports: [JobOpeningsQueryService, JobOpeningsService, JobOpeningsEnrichmentService],
})
export class JobOpeningsModule {}
