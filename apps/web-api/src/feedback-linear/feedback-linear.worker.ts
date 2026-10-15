import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FeedbackLinearIssue, FeedbackLinearStatus } from '@prisma/client';
import { AnalyticsService } from '../analytics/service/analytics.service';
import {
  FEEDBACK_LINEAR_DEFAULT_SYNC_CRON,
  FeedbackLinearConfig,
  getFeedbackLinearConfig,
} from './feedback-linear.config';
import { FeedbackLinearHandlerRegistry, FeedbackLinearPermanentError } from './feedback-linear-handlers';
import { FeedbackLinearOutboxService } from './feedback-linear-outbox.service';
import { LinearApiError, LinearClient, LinearIssueRef } from './linear.client';

/** Rows pushed per tick; a busy backlog drains over a few ticks. */
const BATCH_SIZE = 10;
const ANALYTICS_DISTINCT_ID = 'feedback-linear-worker';

/** Pushes due `FeedbackLinearIssue` rows to Linear. Does nothing when Linear is not configured. */
@Injectable()
export class FeedbackLinearWorker {
  private readonly logger = new Logger(FeedbackLinearWorker.name);
  private running = false;

  constructor(
    private readonly outbox: FeedbackLinearOutboxService,
    private readonly handlers: FeedbackLinearHandlerRegistry,
    private readonly linear: LinearClient,
    private readonly analytics: AnalyticsService
  ) {}

  @Cron(process.env.FEEDBACK_LINEAR_SYNC_CRON || FEEDBACK_LINEAR_DEFAULT_SYNC_CRON, { name: 'feedback-linear-sync' })
  async tick(): Promise<void> {
    const config = getFeedbackLinearConfig();
    if (!config || this.running) return;
    this.running = true;
    try {
      const rows = await this.outbox.claimDue(BATCH_SIZE);
      for (const row of rows) {
        await this.push(row, config);
      }
    } catch (error) {
      this.logger.error(`Feedback → Linear tick failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async push(row: FeedbackLinearIssue, config: FeedbackLinearConfig): Promise<void> {
    try {
      const issue = await this.createOnce(row);
      await this.outbox.markSynced(row, issue);
      await this.track('feedback-linear-pushed', row, row.attempts + 1);
    } catch (error) {
      const permanent = error instanceof FeedbackLinearPermanentError;
      const retryAfterMs = error instanceof LinearApiError ? error.retryAfterMs : null;
      const message = (error as Error).message || 'Unknown error';
      const maxAttempts = permanent ? row.attempts + 1 : config.maxAttempts;
      const status = await this.outbox.markFailedAttempt(row, message, maxAttempts, retryAfterMs);
      this.logger.warn(`Feedback → Linear push ${row.uid} (${row.sourceType}) failed: ${message}`);
      if (status === FeedbackLinearStatus.FAILED) {
        await this.track('feedback-linear-failed', row, row.attempts + 1);
      }
    }
  }

  /**
   * Creates the issue under the row's own id. A retry first looks the id up,
   * and "already exists" counts as success, so one row never makes two issues.
   */
  private async createOnce(row: FeedbackLinearIssue): Promise<LinearIssueRef> {
    if (row.attempts > 0) {
      const existing = await this.linear.issueById(row.linearIssueId);
      if (existing) return existing;
    }
    const handler = this.handlers.get(row.sourceType);
    if (!handler) {
      throw new FeedbackLinearPermanentError(`No handler for source type ${row.sourceType}`);
    }
    const draft = await handler.buildIssue(row);
    try {
      return await this.linear.issueCreate({ ...draft, id: row.linearIssueId });
    } catch (error) {
      if (error instanceof LinearApiError && error.isAlreadyExists) {
        const existing = await this.linear.issueById(row.linearIssueId);
        if (existing) return existing;
      }
      throw error;
    }
  }

  private async track(name: string, row: FeedbackLinearIssue, attempts: number): Promise<void> {
    await this.analytics.trackEvent({
      name,
      distinctId: ANALYTICS_DISTINCT_ID,
      properties: { sourceType: row.sourceType, attempts, teamId: row.teamId },
    });
  }
}
