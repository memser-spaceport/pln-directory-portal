/**
 * Team names excluded from public team-news list, grouped feed, and filter facets.
 * Compared case-insensitively to `Team.name`. Does not affect per-team endpoints.
 */
export const TEAM_NEWS_EXCLUDED_TEAM_NAMES = ['Nvidia', 'Anthropic', 'Red Hat', 'California Forever'] as const;

/** Items with a linked forum thread remain visible this long; other news uses `windowDays` (default 14). */
export const TEAM_NEWS_DISCUSSION_WINDOW_DAYS = 30;
