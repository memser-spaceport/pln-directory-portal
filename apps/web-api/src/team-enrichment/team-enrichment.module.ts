import { Module } from '@nestjs/common';
import { TeamEnrichmentService } from './team-enrichment.service';
import { TeamEnrichmentAiService } from './team-enrichment-ai.service';
import { TeamEnrichmentJob } from './team-enrichment.job';
import { TeamEnrichmentScrapingDogService } from './team-enrichment-scrapingdog.service';
import { LogoVerificationService } from './logo-verification.service';
import { LogoVerificationController } from './logo-verification.controller';
import { LogoVerificationPersistenceService } from './logo-verification-persistence.service';
import { LogoVerificationJobService } from './logo-verification-job.service';

@Module({
  controllers: [LogoVerificationController],
  providers: [
    TeamEnrichmentService,
    TeamEnrichmentAiService,
    TeamEnrichmentJob,
    TeamEnrichmentScrapingDogService,
    LogoVerificationService,
    LogoVerificationPersistenceService,
    LogoVerificationJobService,
  ],
  exports: [
    TeamEnrichmentService,
    LogoVerificationService,
    LogoVerificationPersistenceService,
  ],
})
export class TeamEnrichmentModule {}
