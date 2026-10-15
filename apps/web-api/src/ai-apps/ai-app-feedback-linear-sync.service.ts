import { Injectable, Logger } from '@nestjs/common';
import {
  AiApp,
  AiAppFeedback,
  AiAppFeedbackStatus,
  FeedbackLinearSource,
  FeedbackLinearStatus,
  FeedbackLinearTargetState,
} from '@prisma/client';
import { getFeedbackLinearCredentials } from '../feedback-linear/feedback-linear.config';
import { FeedbackLinearOutboxService } from '../feedback-linear/feedback-linear-outbox.service';
import { PrismaService } from '../shared/prisma.service';

/** What managers see about a feedback item's Linear issue. */
export interface AiAppFeedbackLinearIssue {
  status: FeedbackLinearStatus;
  identifier: string | null;
  url: string | null;
  lastError: string | null;
}

/**
 * Feeds AI App feedback events into the Linear outbox (docs/FEEDBACK_LINEAR.md).
 * Every method swallows and logs its own errors, so Linear never changes what a
 * LabOS request returns.
 */
@Injectable()
export class AiAppFeedbackLinearSync {
  private readonly logger = new Logger(AiAppFeedbackLinearSync.name);

  constructor(private readonly outbox: FeedbackLinearOutboxService, private readonly prisma: PrismaService) {}

  /** Queues a push for private feedback created after the app's Linear target was set. */
  async onSubmitted(
    app: Pick<AiApp, 'uid' | 'linearTeamId' | 'linearProjectId' | 'linearTargetSetAt'>,
    feedback: Pick<AiAppFeedback, 'uid' | 'kind' | 'createdAt'>
  ): Promise<void> {
    try {
      if (feedback.kind !== 'FEEDBACK' || !app.linearTeamId || !app.linearTargetSetAt) return;
      if (feedback.createdAt < app.linearTargetSetAt) return;
      if (!getFeedbackLinearCredentials()) return;
      await this.outbox.enqueue({
        sourceType: FeedbackLinearSource.AI_APP_FEEDBACK,
        sourceUid: feedback.uid,
        teamId: app.linearTeamId,
        projectId: app.linearProjectId,
      });
    } catch (error) {
      this.logger.error(`Failed to queue AI App feedback ${feedback.uid} for Linear: ${(error as Error).message}`);
    }
  }

  /** IMPLEMENTED completes the issue; leaving IMPLEMENTED returns it to intake; NEW ↔ VIEWED changes nothing. */
  async onStatusChanged(feedbackUid: string, from: AiAppFeedbackStatus, to: AiAppFeedbackStatus): Promise<void> {
    const target =
      from === to
        ? null
        : to === 'IMPLEMENTED'
        ? FeedbackLinearTargetState.COMPLETED
        : from === 'IMPLEMENTED'
        ? FeedbackLinearTargetState.INTAKE
        : null;
    if (target) {
      await this.request(feedbackUid, target);
    }
  }

  /** Posts the closing note on the issue (and keeps it completed). */
  async onClosingNote(feedbackUid: string, commentUid: string): Promise<void> {
    await this.request(feedbackUid, FeedbackLinearTargetState.COMPLETED, { uid: commentUid });
  }

  /** Cancels the issue, or skips the push if it was never created. */
  async onDeleted(feedbackUid: string): Promise<void> {
    await this.request(feedbackUid, FeedbackLinearTargetState.CANCELED);
  }

  /** Adds `linearIssue` (null when the item has no push) to feedback rows for managers. */
  async attach<T extends { uid: string }>(
    rows: T[]
  ): Promise<Array<T & { linearIssue: AiAppFeedbackLinearIssue | null }>> {
    let byUid = new Map<string, AiAppFeedbackLinearIssue>();
    if (rows.length > 0) {
      try {
        const pushes = await this.prisma.feedbackLinearIssue.findMany({
          where: { sourceType: FeedbackLinearSource.AI_APP_FEEDBACK, sourceUid: { in: rows.map((row) => row.uid) } },
          select: { sourceUid: true, status: true, identifier: true, url: true, lastError: true },
        });
        byUid = new Map(pushes.map(({ sourceUid, ...issue }) => [sourceUid, issue]));
      } catch (error) {
        this.logger.error(`Failed to read Linear issues for feedback: ${(error as Error).message}`);
      }
    }
    return rows.map((row) => ({ ...row, linearIssue: byUid.get(row.uid) ?? null }));
  }

  private async request(
    feedbackUid: string,
    target: FeedbackLinearTargetState,
    comment?: { uid: string }
  ): Promise<void> {
    try {
      await this.outbox.requestState(FeedbackLinearSource.AI_APP_FEEDBACK, feedbackUid, target, comment);
    } catch (error) {
      this.logger.error(`Failed to sync AI App feedback ${feedbackUid} to Linear: ${(error as Error).message}`);
    }
  }
}
