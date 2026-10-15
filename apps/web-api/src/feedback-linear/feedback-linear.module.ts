import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ContactSupportLinearHandler } from './contact-support-linear.handler';
import { FeedbackLinearHandlerRegistry } from './feedback-linear-handlers';
import { FeedbackLinearOutboxService } from './feedback-linear-outbox.service';
import { FeedbackLinearWorker } from './feedback-linear.worker';
import { LinearClient } from './linear.client';
import { LinearImageUploader } from './linear-images';
import { LinearTeamMeta } from './linear-team-meta';

/** Pushes LabOS feedback to Linear through the `FeedbackLinearIssue` outbox (docs/FEEDBACK_LINEAR.md). */
@Module({
  imports: [AnalyticsModule],
  providers: [
    LinearClient,
    LinearImageUploader,
    LinearTeamMeta,
    FeedbackLinearOutboxService,
    FeedbackLinearHandlerRegistry,
    FeedbackLinearWorker,
    ContactSupportLinearHandler,
  ],
  exports: [
    LinearClient,
    LinearImageUploader,
    LinearTeamMeta,
    FeedbackLinearOutboxService,
    FeedbackLinearHandlerRegistry,
  ],
})
export class FeedbackLinearModule {}
