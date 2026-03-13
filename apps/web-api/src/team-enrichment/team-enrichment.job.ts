import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TeamEnrichmentService } from './team-enrichment.service';

@Injectable()
export class TeamEnrichmentJob {
  private readonly logger = new Logger(TeamEnrichmentJob.name);
  private isRunning = false;

  constructor(private readonly teamEnrichmentService: TeamEnrichmentService) { }

  // Default: every 5 minutes
  @Cron(process.env.TEAM_ENRICHMENT_CRON || '*/5 * * * *', {
    name: 'team-enrichment',
    timeZone: 'UTC',
  })
  async runEnrichment(): Promise<void> {
    if (this.isRunning) {
      this.logger.log('Team enrichment job already in progress, skipping this run');
      return;
    }

    const isEnabled = (process.env.IS_TEAM_ENRICHMENT_ENABLED?.toLowerCase() ?? 'false') === 'true';
    if (!isEnabled) {
      this.logger.log('Team enrichment is disabled via IS_TEAM_ENRICHMENT_ENABLED');
      return;
    }

    this.isRunning = true;
    this.logger.log('Starting team enrichment job');

    try {
      const teams = await this.teamEnrichmentService.findTeamsPendingEnrichment();
      this.logger.log(`Found ${teams.length} teams pending enrichment`);

      if (teams.length === 0) return;

      let enriched = 0;
      let failed = 0;

      for (const team of teams) {
        try {
          await this.teamEnrichmentService.enrichTeam(team.uid);
          enriched++;
        } catch (error) {
          this.logger.error(`Failed to enrich team ${team.uid} (${team.name}): ${error.message}`, error.stack);
          failed++;
        }
      }

      this.logger.log(
        `Team enrichment job completed: ${enriched} enriched, ${failed} failed out of ${teams.length} total`
      );
    } finally {
      this.isRunning = false;
    }
  }
}
