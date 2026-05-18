/**
 * Team names excluded from public team-news list, grouped feed, and filter facets.
 * Compared case-insensitively to `Team.name`. Does not affect per-team endpoints.
 */
export const TEAM_NEWS_EXCLUDED_TEAM_NAMES = ['Nvidia', 'Anthropic', 'Red Hat', 'California Forever'] as const;
