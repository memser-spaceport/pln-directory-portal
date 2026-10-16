import type { Logger } from '@nestjs/common';
import type { IAnalyticsEvent } from '../analytics/analytics.interface';
import type { AnalyticsService } from '../analytics/service/analytics.service';
import { ANALYTICS_EVENTS } from '../utils/constants';

/**
 * Server-side PostHog events for the suggested-candidates email (LAB-2853), sent through the global
 * `AnalyticsService`. Fire-and-forget: a tracking failure, thrown or rejected, is logged and never reaches the
 * send or the unsubscribe.
 */

export function trackSuggestedCandidatesEmailSent(
  analytics: AnalyticsService,
  logger: Logger,
  args: {
    recipientUid: string;
    roleUid: string;
    teamUid: string;
    runUid: string;
    /** first | new | reminder (LAB-2837 feedback). */
    kind: string;
    candidateCount: number;
  }
): void {
  trackSafely(analytics, logger, {
    name: ANALYTICS_EVENTS.JOB_BOARD.SUGGESTED_CANDIDATES_EMAIL_SENT,
    distinctId: args.recipientUid,
    properties: {
      role_uid: args.roleUid,
      team_uid: args.teamUid,
      run_uid: args.runUid,
      email_kind: args.kind,
      candidate_count: args.candidateCount,
    },
  });
}

export function trackSuggestedCandidatesEmailUnsubscribed(
  analytics: AnalyticsService,
  logger: Logger,
  args: { memberUid: string }
): void {
  trackSafely(analytics, logger, {
    name: ANALYTICS_EVENTS.JOB_BOARD.SUGGESTED_CANDIDATES_EMAIL_UNSUBSCRIBED,
    distinctId: args.memberUid,
    properties: { source: 'link' },
  });
}

function trackSafely(analytics: AnalyticsService, logger: Logger, event: IAnalyticsEvent): void {
  const fail = (error: unknown) =>
    logger.error(`analytics event ${event.name} failed: ${error instanceof Error ? error.message : String(error)}`);
  try {
    Promise.resolve(analytics.trackEvent(event)).catch(fail);
  } catch (error) {
    fail(error);
  }
}
