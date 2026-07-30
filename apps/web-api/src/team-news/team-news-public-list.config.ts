/**
 * Team names excluded from public team-news list, grouped feed, and filter facets.
 * Compared case-insensitively to `Team.name`. Does not affect per-team endpoints.
 */
export const TEAM_NEWS_EXCLUDED_TEAM_NAMES = ['Nvidia', 'Anthropic', 'Red Hat', 'California Forever'] as const;

/**
 * Team UIDs whose news is included on the home feed "All" tab even when the team
 * has no (matching) focus areas. Not added to focus-area tabs.
 */
export const TEAM_NEWS_ALWAYS_INCLUDE_IN_ALL_TAB_TEAM_UIDS = [
  'cldvnyxaf01ynu21k62uopjvg', // Protocol Labs
] as const;

/** Items with a linked forum thread remain visible this long; other news uses `windowDays` (default 14). */
export const TEAM_NEWS_DISCUSSION_WINDOW_DAYS = 30;
