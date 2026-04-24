import { Module } from '@nestjs/common';
import { TeamEnrichmentService } from './team-enrichment.service';
import { TeamEnrichmentAiService } from './team-enrichment-ai.service';
import { TeamEnrichmentJob } from './team-enrichment.job';
import { TeamEnrichmentScrapingDogService } from './team-enrichment-scrapingdog.service';
import { TeamEnrichmentJudgeAiService } from './team-enrichment-judge-ai.service';
import { TeamEnrichmentJudgeService } from './team-enrichment-judge.service';
import { TeamEnrichmentJudgeJob } from './team-enrichment-judge.job';
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
    TeamEnrichmentJudgeAiService,
    TeamEnrichmentJudgeService,
    TeamEnrichmentJudgeJob,
    LogoVerificationService,
    LogoVerificationPersistenceService,
    LogoVerificationJobService,
  ],
  exports: [
    TeamEnrichmentService,
    TeamEnrichmentJudgeService,
    LogoVerificationService,
    LogoVerificationPersistenceService,
  ],
})
export class TeamEnrichmentModule {}
