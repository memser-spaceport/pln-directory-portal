import { JobOpeningStatus } from '@prisma/client';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { ANALYTICS_EVENTS } from '../utils/constants';

export type JobBoardOrigin = 'in-app-apply' | 'job-interest' | 'team-interest' | 'ats';

type BaseProps = {
  team_uid: string;
  origin: JobBoardOrigin;
  job_uid?: string;
};

function compact(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined));
}

export function trackJobApplicationRecorded(
  analytics: AnalyticsService,
  args: { applicationUid: string; jobUid: string; teamUid: string }
): void {
  void analytics.trackEvent({
    name: ANALYTICS_EVENTS.JOB_BOARD.APPLICATION_RECORDED,
    distinctId: `application:${args.applicationUid}`,
    properties: compact({
      application_uid: args.applicationUid,
      job_uid: args.jobUid,
      team_uid: args.teamUid,
      origin: 'in-app-apply',
    }),
  });
}

export function trackJobInterestRecorded(
  analytics: AnalyticsService,
  args: { interestUid: string; jobUid: string; teamUid: string }
): void {
  void analytics.trackEvent({
    name: ANALYTICS_EVENTS.JOB_BOARD.INTEREST_RECORDED,
    distinctId: `interest:${args.interestUid}`,
    properties: compact({
      interest_uid: args.interestUid,
      job_uid: args.jobUid,
      team_uid: args.teamUid,
      origin: 'job-interest',
    }),
  });
}

export function trackTeamInterestRecorded(
  analytics: AnalyticsService,
  args: { interestUid: string; teamUid: string }
): void {
  void analytics.trackEvent({
    name: ANALYTICS_EVENTS.JOB_BOARD.TEAM_INTEREST_RECORDED,
    distinctId: `interest:${args.interestUid}`,
    properties: {
      interest_uid: args.interestUid,
      team_uid: args.teamUid,
      origin: 'team-interest',
    },
  });
}

export function trackJobInterestPushedToAts(
  analytics: AnalyticsService,
  args: { interestUid: string; teamUid: string; jobUid?: string | null; origin: 'job-interest' | 'team-interest' }
): void {
  void analytics.trackEvent({
    name: ANALYTICS_EVENTS.JOB_BOARD.INTEREST_PUSHED_TO_ATS,
    distinctId: `interest:${args.interestUid}`,
    properties: compact({
      interest_uid: args.interestUid,
      job_uid: args.jobUid ?? undefined,
      team_uid: args.teamUid,
      origin: args.origin,
    }),
  });
}

export function trackJobPublishedViaIntegration(
  analytics: AnalyticsService,
  args: { jobUid: string; teamUid: string; externalId: string }
): void {
  void analytics.trackEvent({
    name: ANALYTICS_EVENTS.JOB_BOARD.PUBLISHED_VIA_INTEGRATION,
    distinctId: `job:${args.jobUid}`,
    properties: {
      job_uid: args.jobUid,
      team_uid: args.teamUid,
      external_id: args.externalId,
      origin: 'ats',
    },
  });
}

export function trackJobClosedViaIntegration(
  analytics: AnalyticsService,
  args: { jobUid: string; teamUid: string; externalId: string }
): void {
  void analytics.trackEvent({
    name: ANALYTICS_EVENTS.JOB_BOARD.CLOSED_VIA_INTEGRATION,
    distinctId: `job:${args.jobUid}`,
    properties: {
      job_uid: args.jobUid,
      team_uid: args.teamUid,
      external_id: args.externalId,
      origin: 'ats',
    },
  });
}

export function trackJobClaimed(
  analytics: AnalyticsService,
  args: { jobUid: string; teamUid: string; externalId: string }
): void {
  void analytics.trackEvent({
    name: ANALYTICS_EVENTS.JOB_BOARD.CLAIMED,
    distinctId: `job:${args.jobUid}`,
    properties: {
      job_uid: args.jobUid,
      team_uid: args.teamUid,
      external_id: args.externalId,
      origin: 'ats',
    },
  });
}

export function trackIntegrationStatusTransitions(
  analytics: AnalyticsService,
  args: {
    previousStatus: JobOpeningStatus | null;
    nextStatus: JobOpeningStatus;
    jobUid: string;
    teamUid: string;
    externalId: string;
  }
): void {
  if (args.nextStatus === JobOpeningStatus.CONFIRMED && args.previousStatus !== JobOpeningStatus.CONFIRMED) {
    trackJobPublishedViaIntegration(analytics, {
      jobUid: args.jobUid,
      teamUid: args.teamUid,
      externalId: args.externalId,
    });
  }
  if (
    args.nextStatus === JobOpeningStatus.CLOSED_ROLE_FILLED &&
    args.previousStatus !== JobOpeningStatus.CLOSED_ROLE_FILLED
  ) {
    trackJobClosedViaIntegration(analytics, {
      jobUid: args.jobUid,
      teamUid: args.teamUid,
      externalId: args.externalId,
    });
  }
}
