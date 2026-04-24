import { Module } from '@nestjs/common';
import { JobOpeningsController } from './job-openings.controller';
import { JobOpeningsQueryService } from './job-openings-query.service';
import { JobOpeningsService } from './job-openings.service';
import { JobOpeningsServiceController } from './job-openings-service.controller';
import { JobOpeningsEnrichmentService } from './job-openings-enrichment.service';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [JobOpeningsController, JobOpeningsServiceController],
  providers: [JobOpeningsQueryService, JobOpeningsService, JobOpeningsEnrichmentService],
  exports: [JobOpeningsQueryService, JobOpeningsService, JobOpeningsEnrichmentService],
})
export class JobOpeningsModule {}
