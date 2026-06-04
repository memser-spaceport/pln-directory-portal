import { buildTeamNewsEventDateWhere } from './team-news-event-date.where';
import { TEAM_NEWS_DISCUSSION_WINDOW_DAYS } from './team-news-public-list.config';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-06-04T12:00:00.000Z').getTime();

describe('buildTeamNewsEventDateWhere', () => {
  it('uses a single cutoff when since is provided', () => {
    const since = '2026-05-01T00:00:00.000Z';
    const where = buildTeamNewsEventDateWhere({ since, windowDays: 14 }, NOW);
    expect(where).toEqual({ eventDate: { gte: new Date(since) } });
  });

  it('returns OR with standard and discussion windows when windowDays is set', () => {
    const where = buildTeamNewsEventDateWhere({ windowDays: 14 }, NOW);
    const standardCutoff = new Date(NOW - 14 * MS_PER_DAY);
    const discussionCutoff = new Date(NOW - TEAM_NEWS_DISCUSSION_WINDOW_DAYS * MS_PER_DAY);

    expect(where).toEqual({
      OR: [
        { eventDate: { gte: standardCutoff } },
        {
          AND: [{ eventDate: { gte: discussionCutoff } }, { forumLinks: { some: {} } }],
        },
      ],
    });
  });

  it('includes forum-linked items between 14 and 30 days old in the discussion branch', () => {
    const where = buildTeamNewsEventDateWhere({ windowDays: 14 }, NOW);
    const discussionCutoff = new Date(NOW - TEAM_NEWS_DISCUSSION_WINDOW_DAYS * MS_PER_DAY);
    const day20 = new Date(NOW - 20 * MS_PER_DAY);

    expect(day20.getTime()).toBeGreaterThanOrEqual(discussionCutoff.getTime());
    expect(day20.getTime()).toBeLessThan(new Date(NOW - 14 * MS_PER_DAY).getTime());

    const discussionBranch = (where as { OR: unknown[] }).OR[1] as {
      AND: Array<{ eventDate?: { gte: Date }; forumLinks?: unknown }>;
    };
    expect(discussionBranch.AND[0].eventDate?.gte).toEqual(discussionCutoff);
    expect(discussionBranch.AND[1]).toEqual({ forumLinks: { some: {} } });
  });

  it('returns null when windowDays is zero and since is absent', () => {
    expect(buildTeamNewsEventDateWhere({ windowDays: 0 }, NOW)).toBeNull();
  });
});
