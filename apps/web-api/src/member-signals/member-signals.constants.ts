/**
 * Member signal log vocabulary (LAB-3121, LAB-3123). Stored as text so a new
 * action needs no migration; every write is checked against these lists.
 */
export const MEMBER_SIGNAL_ENTITY_TYPES = ['TEAM', 'MEMBER', 'PROJECT', 'NEWS_ITEM', 'JOB_OPENING'] as const;
export type MemberSignalEntityType = typeof MEMBER_SIGNAL_ENTITY_TYPES[number];

export const MEMBER_SIGNAL_ACTIONS = [
  // Stored actions, recorded by the services that own them.
  'follow',
  'unfollow',
  'news-upvote',
  'news-upvote-removed',
  'news-like',
  'news-like-removed',
  'news-comment',
  'job-interest',
  'job-interest-removed',
  'job-saved',
  'job-unsaved',
  'team-interest',
  'office-hours-booking-intent',
  // Views and clicks, sent by the frontend to POST /v1/member-signals.
  'view',
  'contact-click',
  'contact-copy',
  'team-contact-click',
  'project-link-click',
  'github-project-click',
  'search-result-click',
] as const;
export type MemberSignalAction = typeof MEMBER_SIGNAL_ACTIONS[number];

/**
 * Removal action → the action it cancels. The profile build clears earlier
 * rows of the cancelled action on the same entity when it meets a removal.
 */
export const MEMBER_SIGNAL_REMOVALS: Readonly<Partial<Record<MemberSignalAction, MemberSignalAction>>> = {
  unfollow: 'follow',
  'news-upvote-removed': 'news-upvote',
  'news-like-removed': 'news-like',
  'job-interest-removed': 'job-interest',
  'job-unsaved': 'job-saved',
};

/** Actions deduplicated to one row per member, entity and UTC day. */
export const MEMBER_SIGNAL_DAILY_DEDUPE_ACTIONS: ReadonlySet<MemberSignalAction> = new Set(['view']);

export const isMemberSignalAction = (value: string): value is MemberSignalAction =>
  (MEMBER_SIGNAL_ACTIONS as readonly string[]).includes(value);

export const isMemberSignalEntityType = (value: string): value is MemberSignalEntityType =>
  (MEMBER_SIGNAL_ENTITY_TYPES as readonly string[]).includes(value);
