import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FeedbackLinearIssue, FeedbackLinearStatus, FeedbackLinearTargetState } from '@prisma/client';
import { AnalyticsService } from '../analytics/service/analytics.service';
import {
  FEEDBACK_LINEAR_DEFAULT_SYNC_CRON,
  FeedbackLinearCredentials,
  getFeedbackLinearCredentials,
} from './feedback-linear.config';
import {
  FeedbackLinearHandlerRegistry,
  FeedbackLinearIssueDraft,
  FeedbackLinearPermanentError,
} from './feedback-linear-handlers';
import { FeedbackLinearOutboxService, FeedbackLinearProgress } from './feedback-linear-outbox.service';
import { LinearApiError, LinearClient, LinearIssueRef } from './linear.client';
import { LinearTeamMeta } from './linear-team-meta';

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
    private readonly teamMeta: LinearTeamMeta,
    private readonly analytics: AnalyticsService
  ) {}

  @Cron(process.env.FEEDBACK_LINEAR_SYNC_CRON || FEEDBACK_LINEAR_DEFAULT_SYNC_CRON, { name: 'feedback-linear-sync' })
  async tick(): Promise<void> {
    const config = getFeedbackLinearCredentials();
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

  private async push(row: FeedbackLinearIssue, config: FeedbackLinearCredentials): Promise<void> {
    try {
      const outcome = await this.apply(row);
      if (outcome === 'skipped') {
        await this.outbox.markSkipped(row);
        return;
      }
      await this.outbox.markSynced(row, outcome.progress);
      if (outcome.linked) {
        await this.track('feedback-linear-pushed', row, row.attempts + 1);
      }
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
   * Brings the row's issue to what LabOS asked for: creates it if needed, moves
   * it to the target state, posts a pending comment. Each step's result is
   * saved as soon as it is done, so a failure later in the row never repeats it.
   */
  private async apply(
    row: FeedbackLinearIssue
  ): Promise<{ linked: boolean; progress: FeedbackLinearProgress } | 'skipped'> {
    const handler = this.handlers.get(row.sourceType);
    if (!handler) {
      throw new FeedbackLinearPermanentError(`No handler for source type ${row.sourceType}`);
    }
    const progress: FeedbackLinearProgress = {};
    let applied = row.appliedState;
    let intakeStateId = row.intakeStateId;
    let linked = false;

    if (!applied) {
      let issue = row.attempts > 0 ? await this.linear.issueById(row.linearIssueId) : null;
      if (!issue && row.targetState === FeedbackLinearTargetState.CANCELED) {
        return 'skipped';
      }
      if (!issue) {
        const draft = await handler.buildIssue(row);
        issue = await this.createOnce(row, draft);
        intakeStateId = draft.stateId;
      }
      applied = FeedbackLinearTargetState.INTAKE;
      linked = true;
      Object.assign(progress, {
        identifier: issue.identifier,
        url: issue.url,
        appliedState: applied,
        ...(intakeStateId ? { intakeStateId } : {}),
      });
      await this.outbox.saveProgress(row, progress);
    }

    if (row.targetState !== applied) {
      const stateId =
        row.targetState === FeedbackLinearTargetState.INTAKE
          ? intakeStateId ?? (await this.teamMeta.intakeStateId(row.teamId))
          : await this.teamMeta.stateIdOfType(
              row.teamId,
              row.targetState === FeedbackLinearTargetState.COMPLETED ? 'completed' : 'canceled'
            );
      await this.linear.issueUpdate(row.linearIssueId, { stateId });
      progress.appliedState = row.targetState;
      await this.outbox.saveProgress(row, { appliedState: row.targetState });
    }

    if (row.pendingCommentUid && row.pendingCommentId) {
      const body = handler.buildComment ? await handler.buildComment(row, row.pendingCommentUid) : null;
      if (body) {
        try {
          await this.linear.commentCreate({ id: row.pendingCommentId, issueId: row.linearIssueId, body });
        } catch (error) {
          if (!(error instanceof LinearApiError && error.isAlreadyExists)) throw error;
        }
      }
      progress.commentDone = true;
    }

    return { linked, progress };
  }

  /** Creates the issue under the row's own id; "already exists" counts as success. */
  private async createOnce(row: FeedbackLinearIssue, draft: FeedbackLinearIssueDraft): Promise<LinearIssueRef> {
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
