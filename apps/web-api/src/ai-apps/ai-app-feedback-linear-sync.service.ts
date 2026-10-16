import { Injectable, Logger } from '@nestjs/common';
import { AiAppFeedback, AiAppFeedbackStatus, FeedbackLinearSource, FeedbackLinearTargetState } from '@prisma/client';
import {
  getFeedbackLinearCredentials,
  getFeedbackLinearMemberAppsTarget,
} from '../feedback-linear/feedback-linear.config';
import { FeedbackLinearOutboxService } from '../feedback-linear/feedback-linear-outbox.service';

/**
 * Feeds AI App feedback events into the Linear outbox (docs/FEEDBACK_LINEAR.md).
 * Nothing about it is visible in LabOS: every method swallows and logs its own
 * errors, so Linear never changes what a LabOS request returns.
 */
@Injectable()
export class AiAppFeedbackLinearSync {
  private readonly logger = new Logger(AiAppFeedbackLinearSync.name);

  constructor(private readonly outbox: FeedbackLinearOutboxService) {}

  /** Queues a push of private feedback to the member-apps Linear team, when one is configured. */
  async onSubmitted(feedback: Pick<AiAppFeedback, 'uid' | 'kind'>): Promise<void> {
    try {
      if (feedback.kind !== 'FEEDBACK') return;
      const target = getFeedbackLinearMemberAppsTarget();
      if (!target || !getFeedbackLinearCredentials()) return;
      await this.outbox.enqueue({
        sourceType: FeedbackLinearSource.AI_APP_FEEDBACK,
        sourceUid: feedback.uid,
        teamId: target.teamId,
        projectId: target.projectId,
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
