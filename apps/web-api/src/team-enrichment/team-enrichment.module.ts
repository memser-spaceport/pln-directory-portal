import { Module, forwardRef } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { TeamsModule } from '../teams/teams.module';
import { TeamEnrichmentService } from './team-enrichment.service';
import { TeamEnrichmentAiService } from './team-enrichment-ai.service';
import { TeamEnrichmentJob } from './team-enrichment.job';
import { LogoVerificationService } from './logo-verification.service';
import { LogoVerificationController } from './logo-verification.controller';

@Module({
  imports: [SharedModule, forwardRef(() => TeamsModule)],
  controllers: [LogoVerificationController],
  providers: [
    TeamEnrichmentService,
    TeamEnrichmentAiService,
    TeamEnrichmentJob,
    LogoVerificationService,
  ],
  exports: [TeamEnrichmentService, LogoVerificationService],
})
export class TeamEnrichmentModule {}
