import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TeamEnrichmentJudgeService } from './team-enrichment-judge.service';

@Injectable()
export class TeamEnrichmentJudgeJob {
  private readonly logger = new Logger(TeamEnrichmentJudgeJob.name);
  private isJudgmentRunning = false;

  constructor(private readonly judgeService: TeamEnrichmentJudgeService) {}

  /** Per-pod in-memory flag — `true` while this pod's judge cron tick is mid-flight. */
  get judgmentRunning(): boolean {
    return this.isJudgmentRunning;
  }

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
      // Delegates to the same throttled batch path the admin bulk-trigger endpoints
      // use (`triggerJudgmentForAllPending` -> `prepareAndRunJudgmentBatch` ->
      // `runJudgmentBatchThrottled`) so the daily cron can't blow past
      // `TEAM_ENRICHMENT_JUDGE_CONCURRENCY` any more than a manual trigger can.
      const { total, started, skipped } = await this.judgeService.triggerJudgmentForAllPending('system-cron');
      this.logger.log(
        `Team enrichment judge job: ${started} started, ${skipped} skipped out of ${total} pending. ` +
          `Per-team token usage + USD cost is logged separately as "Judge usage rollup" lines and persisted on TeamEnrichment.dataEnrichment.usage.`
      );
    } finally {
      this.isJudgmentRunning = false;
    }
  }
}
