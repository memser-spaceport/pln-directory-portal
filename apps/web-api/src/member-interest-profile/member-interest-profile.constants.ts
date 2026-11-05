import type { MemberSignalAction } from '../member-signals/member-signals.constants';

/**
 * Every tunable of the member interest profile (LAB-3122) lives here so the
 * LAB-3124 pilot can change them in one place. Base weights are a first draft.
 */

/** An action's weight halves every this many days. No action is dropped for age. */
export const DEFAULT_HALF_LIFE_DAYS = 90;

export function halfLifeDays(): number {
  const raw = Number(process.env.MEMBER_INTEREST_HALF_LIFE_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_HALF_LIFE_DAYS;
}

/** The n-th repeat of the same action on the same item adds REPEAT_FACTOR^n of the first. */
export const REPEAT_FACTOR = 0.5;

/** Base weight of each recorded action. Removal actions have none; they cancel. */
export const SIGNAL_WEIGHTS: Readonly<Partial<Record<MemberSignalAction, number>>> = {
  'office-hours-booking-intent': 6,
  'team-interest': 6,
  follow: 5,
  'contact-copy': 5,
  'job-interest': 4,
  'contact-click': 4,
  'team-contact-click': 4,
  'job-saved': 3,
  'news-comment': 3,
  'news-upvote': 2,
  'news-like': 2,
  'search-result-click': 2,
  'project-link-click': 2,
  'github-project-click': 2,
  view: 1,
};

/** Weights of the stored (not logged) sources. */
export const SOURCE_WEIGHTS = {
  heldOfficeHoursMeeting: 8,
  savedNewsTag: 4,
  declaredInterest: 3,
  irlEventTopic: 3,
  jobReferral: 3,
  pastTeam: 2,
  /** The member's own current team: its focus areas only, never the team itself. */
  currentTeamTopic: 1,
  /** Own news posts, as expertise. */
  ownPostExpertise: 3,
  /** Own comments on own-team news, as expertise. */
  ownCommentExpertise: 1,
} as const;

/** Share of a contribution that reaches indirect targets. */
export const INDIRECT_FACTORS = {
  /** News item → its team as an entity. */
  newsTeamEntity: 0.5,
  /** Member entity → the focus areas of that member's teams. */
  memberTeamTopics: 0.5,
} as const;

/** Scores below this are not stored. */
export const MIN_STORED_SCORE = 0.0001;

export const PROFILE_BATCH_SIZE = 500;

export const PROFILE_CRON = process.env.MEMBER_INTEREST_PROFILE_CRON || '0 4 * * *';

/** A RUNNING rebuild older than this is treated as crashed and may be replaced. */
export const STALE_RUN_MS = 3 * 60 * 60 * 1000;

export const PROFILE_RUN_LOCK_KEY = 'member-interest-profile';

export const PROFILE_ANALYTICS_DISTINCT_ID = 'system:member-interest-profile';

export type ProfileKind = 'TOPIC' | 'ENTITY' | 'EXPERTISE';
export type ProfileEntityType = 'TEAM' | 'MEMBER' | 'PROJECT';
