import { Injectable } from '@nestjs/common';
import { Prisma, NewsEventType } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import type {
  TeamNewsDiscussion,
  TeamNewsFiltersResponse,
  TeamNewsGroupedResponse,
  TeamNewsItemDto,
  TeamNewsListQuery,
  TeamNewsListResponse,
  TeamNewsRecentResponse,
} from 'libs/contracts/src/schema/team-news';
import { buildTeamNewsEventDateWhere } from './team-news-event-date.where';
import { TEAM_NEWS_EXCLUDED_TEAM_NAMES } from './team-news-public-list.config';

const EMPTY_DISCUSSION: TeamNewsDiscussion = { count: 0, latestTopicUrl: null };

const TOP_LEVEL_FOCUS_AREAS = [
  'Digital Human Rights',
  'Economies & Governance',
  'AI & Robotics',
  'Neurotech',
  'Build Innovation Network',
];

@Injectable()
export class TeamNewsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(
    query: TeamNewsListQuery,
    overrides: { dropFocus?: boolean; dropEventType?: boolean } = {}
  ): Prisma.TeamNewsItemWhereInput {
    const and: Prisma.TeamNewsItemWhereInput[] = [];

    const eventDateWhere = buildTeamNewsEventDateWhere(query);
    if (eventDateWhere) {
      and.push(eventDateWhere);
    }

    if (query.q) {
      and.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { summary: { contains: query.q, mode: 'insensitive' } },
          { team: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      });
    }

    if (!overrides.dropEventType && query.eventType.length > 0) {
      const validEventTypes = query.eventType.filter((t): t is NewsEventType =>
        Object.values(NewsEventType).includes(t as NewsEventType)
      );
      if (validEventTypes.length > 0) {
        and.push({ eventType: { in: validEventTypes } });
      }
    }

    if (!overrides.dropFocus && query.focus.length > 0) {
      and.push({
        team: {
          teamFocusAreas: {
            some: {
              OR: [{ ancestorArea: { title: { in: query.focus } } }, { focusArea: { title: { in: query.focus } } }],
            },
          },
        },
      });
    }

    if (TEAM_NEWS_EXCLUDED_TEAM_NAMES.length > 0) {
      and.push({
        NOT: {
          OR: TEAM_NEWS_EXCLUDED_TEAM_NAMES.map((name) => ({
            team: { name: { equals: name, mode: 'insensitive' } },
          })),
        },
      });
    }

    return and.length > 0 ? { AND: and } : {};
  }

  async listTeamNews(query: TeamNewsListQuery): Promise<TeamNewsListResponse> {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await Promise.all([
      this.prisma.teamNewsItem.findMany({
        where,
        orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: query.limit,
        include: {
          team: {
            select: {
              uid: true,
              name: true,
              logo: { select: { url: true } },
              teamFocusAreas: { include: { focusArea: true, ancestorArea: true } },
            },
          },
        },
      }),
      this.prisma.teamNewsItem.count({ where }),
    ]);

    const discussions = await this.loadDiscussions(rows.map((r) => r.uid));

    return {
      page: query.page,
      limit: query.limit,
      total,
      items: rows.map((row) => this.toDto(row, discussions.get(row.uid))),
    };
  }

  async listGroupedByFocusArea(query: TeamNewsListQuery): Promise<TeamNewsGroupedResponse> {
    const where = this.buildWhere(query);
    const rows = await this.prisma.teamNewsItem.findMany({
      where,
      orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        team: {
          select: {
            uid: true,
            name: true,
            logo: { select: { url: true } },
            teamFocusAreas: { include: { focusArea: true, ancestorArea: true } },
          },
        },
      },
    });

    const [focusAreas, discussions] = await Promise.all([
      this.prisma.focusArea.findMany({
        where: { parentUid: null },
        select: { uid: true, title: true },
      }),
      this.loadDiscussions(rows.map((r) => r.uid)),
    ]);
    const focusByTitle = new Map(focusAreas.map((fa) => [fa.title, fa]));

    const groups = new Map<string, TeamNewsItemDto[]>();
    for (const row of rows) {
      const dto = this.toDto(row, discussions.get(row.uid));
      if (dto.focusAreas.length === 0) continue;
      for (const title of dto.focusAreas) {
        if (!focusByTitle.has(title)) continue;
        if (!groups.has(title)) groups.set(title, []);
        groups.get(title)!.push(dto);
      }
    }

    const orderedTitles = [
      ...TOP_LEVEL_FOCUS_AREAS.filter((t) => groups.has(t)),
      ...[...groups.keys()].filter((t) => !TOP_LEVEL_FOCUS_AREAS.includes(t)).sort((a, b) => a.localeCompare(b)),
    ];

    return {
      windowDays: query.windowDays,
      generatedAt: new Date().toISOString(),
      groups: orderedTitles.map((title) => {
        const fa = focusByTitle.get(title)!;
        const items = groups.get(title)!;
        return {
          focusArea: { uid: fa.uid, title: fa.title },
          total: items.length,
          items,
        };
      }),
    };
  }

  /**
   * Recent network news across all teams for the combined daily digest email's
   * "Latest Network News" section. Consumed by the notification service.
   *
   * Selection is by ingestion time (`createdAt`) over the half-open watermark
   * window `(sinceCreatedAt, untilCreatedAt]`. The notification service passes
   * sinceCreatedAt = the start of the previous successful digest run and
   * untilCreatedAt = the start of the current run, so each item is delivered in
   * exactly one digest — no gaps, no duplicates — even though `eventDate` can
   * trail ingestion by days. Items are still ordered/displayed by `eventDate`,
   * matching the public feed. Applies the same excluded-team filter as the feed.
   *
   * Defaults (used only if the caller omits a bound, e.g. the very first run):
   * untilCreatedAt = now, sinceCreatedAt = until − 1 day.
   */
  async getRecentNews(opts: {
    sinceCreatedAt?: Date;
    untilCreatedAt?: Date;
    limit?: number;
  }): Promise<TeamNewsRecentResponse> {
    const until = opts.untilCreatedAt ?? new Date();
    const since = opts.sinceCreatedAt ?? new Date(until.getTime() - 24 * 60 * 60 * 1000);
    const limit = opts.limit ?? 50;

    const where: Prisma.TeamNewsItemWhereInput = { createdAt: { gt: since, lte: until } };
    if (TEAM_NEWS_EXCLUDED_TEAM_NAMES.length > 0) {
      where.NOT = {
        OR: TEAM_NEWS_EXCLUDED_TEAM_NAMES.map((name) => ({
          team: { name: { equals: name, mode: 'insensitive' } },
        })),
      };
    }

    const rows = await this.prisma.teamNewsItem.findMany({
      where,
      orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: {
        team: {
          select: {
            uid: true,
            name: true,
            logo: { select: { url: true } },
            teamFocusAreas: { include: { focusArea: true, ancestorArea: true } },
          },
        },
      },
    });

    const discussions = await this.loadDiscussions(rows.map((r) => r.uid));

    return {
      generatedAt: new Date().toISOString(),
      since: since.toISOString(),
      until: until.toISOString(),
      items: rows.map((row) => this.toDto(row, discussions.get(row.uid))),
    };
  }

  async getFilters(query: TeamNewsListQuery): Promise<TeamNewsFiltersResponse> {
    const eventTypeWhere = this.buildWhere(query, { dropEventType: true });
    const focusWhere = this.buildWhere(query, { dropFocus: true });

    const [eventTypeRows, focusRows] = await Promise.all([
      this.prisma.teamNewsItem.groupBy({
        by: ['eventType'],
        where: eventTypeWhere,
        _count: { _all: true },
      }),
      this.countFocusFacets(focusWhere),
    ]);

    return {
      eventType: eventTypeRows
        .map((r) => ({ value: r.eventType, count: r._count._all }))
        .sort((a, b) => a.value.localeCompare(b.value)),
      focus: focusRows,
    };
  }

  private async countFocusFacets(where: Prisma.TeamNewsItemWhereInput): Promise<TeamNewsFiltersResponse['focus']> {
    const teamRows = await this.prisma.teamNewsItem.groupBy({
      by: ['teamUid'],
      where,
      _count: { _all: true },
    });

    if (teamRows.length === 0) return [];

    const teamUids = teamRows.map((r) => r.teamUid);
    const countsByTeam = new Map(teamRows.map((r) => [r.teamUid, r._count._all]));

    const teamFocus = await this.prisma.teamFocusArea.findMany({
      where: { teamUid: { in: teamUids } },
      select: {
        teamUid: true,
        ancestorArea: { select: { title: true } },
      },
    });

    const totalsByFocus = new Map<string, number>();
    const seen = new Set<string>();
    for (const tf of teamFocus) {
      const key = `${tf.teamUid}::${tf.ancestorArea.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const delta = countsByTeam.get(tf.teamUid) ?? 0;
      totalsByFocus.set(tf.ancestorArea.title, (totalsByFocus.get(tf.ancestorArea.title) ?? 0) + delta);
    }

    return [...totalsByFocus.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }

  /**
   * Batch-load forum discussion summaries for a set of news items.
   * Returns a map keyed by news-item UID. Items absent from the map have
   * zero linked discussions.
   */
  private async loadDiscussions(itemUids: string[]): Promise<Map<string, TeamNewsDiscussion>> {
    if (itemUids.length === 0) return new Map();
    const links = await this.prisma.teamNewsForumLink.findMany({
      where: { newsItemUid: { in: itemUids } },
      orderBy: { createdAt: 'desc' },
      select: { newsItemUid: true, forumTopicUrl: true },
    });

    const out = new Map<string, TeamNewsDiscussion>();
    for (const link of links) {
      const current = out.get(link.newsItemUid);
      if (current) {
        current.count += 1;
      } else {
        out.set(link.newsItemUid, { count: 1, latestTopicUrl: link.forumTopicUrl });
      }
    }
    return out;
  }

  private toDto(
    row: {
      uid: string;
      teamUid: string;
      eventType: NewsEventType;
      eventDate: Date;
      title: string;
      summary: string | null;
      sourceUrl: string;
      sourceDomain: string | null;
      tags: string[];
      createdAt: Date;
      team: {
        uid: string;
        name: string;
        logo: { url: string } | null;
        teamFocusAreas: Array<{
          focusArea: { title: string; parentUid: string | null };
          ancestorArea: { title: string };
        }>;
      };
    },
    discussion: TeamNewsDiscussion | undefined
  ): TeamNewsItemDto {
    const focusAreas: string[] = [];
    const subFocusAreas: string[] = [];
    for (const tfa of row.team.teamFocusAreas) {
      focusAreas.push(tfa.ancestorArea.title);
      if (tfa.focusArea.parentUid) {
        subFocusAreas.push(tfa.focusArea.title);
      }
    }

    return {
      uid: row.uid,
      teamUid: row.teamUid,
      teamName: row.team.name,
      teamLogoUrl: row.team.logo?.url ?? null,
      eventType: row.eventType,
      eventDate: row.eventDate.toISOString(),
      title: row.title,
      summary: row.summary,
      sourceUrl: row.sourceUrl,
      sourceDomain: row.sourceDomain,
      tags: row.tags,
      focusAreas: [...new Set(focusAreas)],
      subFocusAreas: [...new Set(subFocusAreas)],
      createdAt: row.createdAt.toISOString(),
      discussion: discussion ?? EMPTY_DISCUSSION,
    };
  }
}
