import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TeamEnrichmentService } from './team-enrichment.service';

@Injectable()
export class TeamEnrichmentJob {
  private readonly logger = new Logger(TeamEnrichmentJob.name);

  constructor(private readonly teamEnrichmentService: TeamEnrichmentService) { }

  // By default, every minute
  @Cron(process.env.TEAM_ENRICHMENT_CRON || '* * * * *', {
    name: 'daily-team-enrichment',
    timeZone: 'UTC',
  })
  async runEnrichment(): Promise<void> {
    const isEnabled = (process.env.IS_TEAM_ENRICHMENT_ENABLED?.toLowerCase() ?? 'false') === 'true';
    if (!isEnabled) {
      this.logger.log('Team enrichment is disabled via IS_TEAM_ENRICHMENT_ENABLED');
      return;
    }

    this.logger.log('Starting daily team enrichment job');

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
  }
}
