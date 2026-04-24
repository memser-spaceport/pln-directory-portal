import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TeamEnrichmentJudgeService } from './team-enrichment-judge.service';

@Injectable()
export class TeamEnrichmentJudgeJob {
  private readonly logger = new Logger(TeamEnrichmentJudgeJob.name);
  private isJudgmentRunning = false;

  constructor(private readonly judgeService: TeamEnrichmentJudgeService) {}

  // Default: daily at 4 AM UTC (one hour after the default 3 AM enrichment cron).
  @Cron(process.env.TEAM_ENRICHMENT_JUDGE_CRON || '0 4 * * *', {
    name: 'team-enrichment-judge',
    timeZone: 'UTC',
  })
  async runJudgment(): Promise<void> {
    if (this.isJudgmentRunning) {
      this.logger.log('Team enrichment judge job already in progress, skipping this run');
      return;
    }

    const isEnabled = (process.env.IS_TEAM_ENRICHMENT_ENABLED?.toLowerCase() ?? 'false') === 'true';
    if (!isEnabled) {
      this.logger.log('Team enrichment is disabled via IS_TEAM_ENRICHMENT_ENABLED, skipping judge run');
      return;
    }

    this.isJudgmentRunning = true;
    this.logger.log('Starting team enrichment judge job');

    try {
      const teams = await this.judgeService.findTeamsPendingJudgment();
      this.logger.log(`Found ${teams.length} teams pending judgment`);

      if (teams.length === 0) return;

      let started = 0;
      let skipped = 0;
      let failed = 0;

      for (const team of teams) {
        try {
          const { status } = await this.judgeService.judgeTeam(team.uid);
          if (status === 'started') started++;
          else skipped++;
        } catch (error) {
          this.logger.error(
            `Failed to judge team ${team.uid} (${team.name}): ${error.message}`,
            error.stack
          );
          failed++;
        }
      }

      this.logger.log(
        `Team enrichment judge job completed: ${started} started, ${skipped} skipped, ${failed} errored out of ${teams.length} total`
      );
    } finally {
      this.isJudgmentRunning = false;
    }
  }
}
