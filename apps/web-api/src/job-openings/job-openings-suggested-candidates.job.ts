import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JobOpeningsSuggestedCandidatesComputeService } from './job-openings-suggested-candidates-compute.service';

/**
 * Hourly sweep for suggested candidates (LAB-2770). Each run recomputes only
 * the live roles that are new, whose text changed, or whose suggestions are a
 * day old, so a role that goes live is covered within the hour and every live
 * role is refreshed daily. Roles that left the board lose their suggestions.
 */
@Injectable()
export class JobOpeningsSuggestedCandidatesJob {
  private readonly logger = new Logger(JobOpeningsSuggestedCandidatesJob.name);
  private isRunning = false;

  constructor(private readonly computeService: JobOpeningsSuggestedCandidatesComputeService) {}

  @Cron('20 * * * *', {
    name: 'job-opening-suggested-candidates',
    timeZone: 'UTC',
  })
  async run(): Promise<void> {
    if (this.isRunning) {
      this.logger.log('Suggested candidates job already in progress, skipping this run');
      return;
    }
    this.isRunning = true;
    try {
      const summary = await this.computeService.refreshDue();
      this.logger.log(
        `Suggested candidates: ${summary.computed} computed, ${summary.skipped} up to date, ${summary.failed} failed ` +
          `of ${summary.roles} live roles; ${summary.embedded} profiles embedded; ${summary.cleared} non-live roles cleared`
      );
    } catch (error) {
      this.logger.error(`Suggested candidates job failed: ${(error as Error)?.message}`);
    } finally {
      this.isRunning = false;
    }
  }
}
