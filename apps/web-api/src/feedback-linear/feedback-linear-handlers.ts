import { Injectable } from '@nestjs/common';
import { FeedbackLinearIssue, FeedbackLinearSource } from '@prisma/client';
import { LinearIssueCreateInput } from './linear.client';

/** What a source handler returns: the issue to create, minus the id the outbox row owns. */
export type FeedbackLinearIssueDraft = Omit<LinearIssueCreateInput, 'id'>;

/** Builds the Linear issue for one kind of feedback source. */
export interface FeedbackLinearSourceHandler {
  readonly sourceType: FeedbackLinearSource;
  buildIssue(row: FeedbackLinearIssue): Promise<FeedbackLinearIssueDraft>;
}

/** A failure that a retry can't fix, such as the source row being gone. The push becomes FAILED at once. */
export class FeedbackLinearPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedbackLinearPermanentError';
  }
}

/** Source handlers by type. Each handler registers itself when its module starts. */
@Injectable()
export class FeedbackLinearHandlerRegistry {
  private readonly handlers = new Map<FeedbackLinearSource, FeedbackLinearSourceHandler>();

  register(handler: FeedbackLinearSourceHandler): void {
    this.handlers.set(handler.sourceType, handler);
  }

  get(sourceType: FeedbackLinearSource): FeedbackLinearSourceHandler | undefined {
    return this.handlers.get(sourceType);
  }
}
