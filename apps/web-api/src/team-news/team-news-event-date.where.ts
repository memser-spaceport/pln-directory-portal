import { Prisma } from '@prisma/client';
import type { TeamNewsListQuery } from 'libs/contracts/src/schema/team-news';
import { TEAM_NEWS_DISCUSSION_WINDOW_DAYS } from './team-news-public-list.config';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function buildTeamNewsEventDateWhere(
  query: Pick<TeamNewsListQuery, 'since' | 'windowDays'>,
  nowMs: number = Date.now()
): Prisma.TeamNewsItemWhereInput | null {
  if (query.since) {
    const explicit = new Date(query.since);
    if (!Number.isNaN(explicit.getTime())) {
      return { eventDate: { gte: explicit } };
    }
  }

  if (query.windowDays > 0) {
    const standardCutoff = new Date(nowMs - query.windowDays * MS_PER_DAY);
    const discussionCutoff = new Date(nowMs - TEAM_NEWS_DISCUSSION_WINDOW_DAYS * MS_PER_DAY);
    return {
      OR: [
        { eventDate: { gte: standardCutoff } },
        {
          AND: [{ eventDate: { gte: discussionCutoff } }, { forumLinks: { some: {} } }],
        },
      ],
    };
  }

  return null;
}
