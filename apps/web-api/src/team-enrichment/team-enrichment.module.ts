import { Module, forwardRef } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { TeamsModule } from '../teams/teams.module';
import { TeamEnrichmentService } from './team-enrichment.service';
import { TeamEnrichmentAiService } from './team-enrichment-ai.service';
import { TeamEnrichmentScrapingDogService } from './team-enrichment-scrapingdog.service';
import { TeamEnrichmentJob } from './team-enrichment.job';

@Module({
  imports: [SharedModule, forwardRef(() => TeamsModule)],
  providers: [TeamEnrichmentService, TeamEnrichmentAiService, TeamEnrichmentScrapingDogService, TeamEnrichmentJob],
  exports: [TeamEnrichmentService],
})
export class TeamEnrichmentModule {}
