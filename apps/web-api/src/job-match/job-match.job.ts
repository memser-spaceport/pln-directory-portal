import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { jobMatchBlocker } from './job-match.logic';
import { JobMatchRunner } from './job-match-runner.service';

@Injectable()
export class JobMatchJob {
  private readonly logger = new Logger(JobMatchJob.name);

  constructor(private readonly runner: JobMatchRunner) {}

  @Cron(process.env.JOB_MATCH_CRON || '0 6 * * 1', {
    name: 'job-match-suggestions',
    timeZone: 'UTC',
  })
  async run(): Promise<void> {
    const blocker = jobMatchBlocker();
    if (blocker?.code === 'disabled') {
      this.logger.log('Job match is disabled via IS_JOB_MATCH_ENABLED');
      return;
    }
    if (blocker) {
      this.logger.error(blocker.message);
      return;
    }
    const result = await this.runner.start();
    this.logger.log(`job match cron ${result.status} run ${result.runUid ?? 'none'} date ${result.runDate}`);
  }
}
