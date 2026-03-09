import { Module, forwardRef } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { TeamsModule } from '../teams/teams.module';
import { TeamEnrichmentService } from './team-enrichment.service';
import { TeamEnrichmentAiService } from './team-enrichment-ai.service';
import { TeamEnrichmentJob } from './team-enrichment.job';

@Module({
  imports: [SharedModule, forwardRef(() => TeamsModule)],
  providers: [TeamEnrichmentService, TeamEnrichmentAiService, TeamEnrichmentJob],
  exports: [TeamEnrichmentService],
})
export class TeamEnrichmentModule {}
