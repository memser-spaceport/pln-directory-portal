import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, NewsEventType } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import type {
  TeamNewsByTeamQuery,
  TeamNewsByTeamResponse,
  TeamNewsCountsResponse,
  TeamNewsDiscussion,
  TeamNewsFiltersResponse,
  TeamNewsGroupedResponse,
  TeamNewsItemDto,
  TeamNewsListQuery,
  TeamNewsListResponse,
  TeamNewsPopularQuery,
  TeamNewsLatestResponse,
  TeamNewsPopularResponse,
  TeamNewsRecentResponse,
} from 'libs/contracts/src/schema/team-news';
import { buildTeamNewsEventDateWhere } from './team-news-event-date.where';
import {
  TEAM_NEWS_ALWAYS_INCLUDE_IN_ALL_TAB_TEAM_UIDS,
  TEAM_NEWS_EXCLUDED_TEAM_NAMES,
} from './team-news-public-list.config';
import { TeamNewsSuggestionsService } from './team-news-suggestions.service';

const EMPTY_DISCUSSION: TeamNewsDiscussion = { count: 0, latestTopicUrl: null };
const POPULAR_WINDOW_DAYS = 14;
const POPULAR_MIN_UPVOTES = 2;

/**
 * The window behind the "N new posts" chip on the teams grid and the job board.
 *
 * Deliberately NOT `buildTeamNewsEventDateWhere`, which is the reuse this looks
 * like it wants. That helper answers "what does the feed still show" — including
 * its escape hatch for items up to TEAM_NEWS_DISCUSSION_WINDOW_DAYS old that
 * carry a forum link. This answers "what did the team publish recently", which
 * is a different question. Wire them together and the next change to the feed's
 * visibility rules silently moves a number the feed does not own.
 */
const TEAM_NEWS_COUNT_WINDOW_DAYS = 7;

type UpvoteStamp = {
  counts: Map<string, number>;
  viewerUpvoted: Set<string>;
};

const TOP_LEVEL_FOCUS_AREAS = [
  'Digital Human Rights',
  'Economies & Governance',
  'AI & Robotics',
  'Neurotech',
  'Build Innovation Network',
];

@Injectable()
export class TeamNewsQueryService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly suggestionsService?: TeamNewsSuggestionsService
  ) {}

  /**
   * The excluded-team rule, in one place.
   *
   * It was spelled out separately in buildWhere and getRecentNews, and now has a
   * third caller in getLatestCreatedAt — which is exactly where drift starts to
   * hurt. The "new news" dot on the app header is driven by getLatestCreatedAt,
   * so if it ever disagrees with what the feed actually lists, an excluded
   * team's item lights the dot, the member opens /home, and finds nothing new.
   * A couple of those and the indicator is dead to them.
   */
  private excludedTeamsWhere(): Prisma.TeamNewsItemWhereInput | null {
    // `> 0` rather than `=== 0`: the list is `as const`, so its length is the
    // literal 4 and TS rejects an equality check against 0 outright.
    if (TEAM_NEWS_EXCLUDED_TEAM_NAMES.length > 0) {
      return {
        NOT: {
          OR: TEAM_NEWS_EXCLUDED_TEAM_NAMES.map((name) => ({
            team: { name: { equals: name, mode: 'insensitive' } },
          })),
        },
      };
    }
    return null;
  }

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

    const excluded = this.excludedTeamsWhere();
    if (excluded) {
      and.push(excluded);
    }

    return and.length > 0 ? { AND: and } : {};
  }

  /**
   * Ingestion time of the newest news item the public feed would show.
   *
   * Powers the "new news" dot on the app header's Home button: the client holds
   * the last time it recorded a /home visit and compares.
   *
   * Deliberately NOT windowed. buildWhere applies `windowDays` (default 14),
   * which answers "what should the feed LIST" — a different question from "is
   * there anything newer than your last visit". Only the visibility rule
   * (excluded teams) carries over, because the dot has to agree with the feed
   * about what exists.
   *
   * `aggregate(_max)` rather than findFirst+orderBy: one value, no row
   * materialised, and it is what the createdAt index is there for. This is
   * called from the app header, so it runs on effectively every page load by
   * every user — it has to stay cheap.
   */
  async getLatestCreatedAt(): Promise<TeamNewsLatestResponse> {
    const excluded = this.excludedTeamsWhere();
    const result = await this.prisma.teamNewsItem.aggregate({
      _max: { createdAt: true },
      ...(excluded ? { where: excluded } : {}),
    });

    return { latestAt: result._max.createdAt?.toISOString() ?? null };
  }

  async listTeamNews(
    query: TeamNewsListQuery,
    followedTeamUids: Set<string> = new Set(),
    viewerMemberUid?: string
  ): Promise<TeamNewsListResponse> {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;
    const orderBy: Prisma.TeamNewsItemOrderByWithRelationInput[] = [{ eventDate: 'desc' }, { createdAt: 'desc' }];
    const include = {
      team: {
        select: {
          uid: true,
          name: true,
          logo: { select: { url: true } },
          teamFocusAreas: { include: { focusArea: true, ancestorArea: true } },
        },
      },
    } as const;

    const followed = [...followedTeamUids];

    // Anonymous caller (or follows nothing): single ordered+paginated query.
    if (followed.length === 0) {
      const [rows, total] = await Promise.all([
        this.prisma.teamNewsItem.findMany({ where, orderBy, skip, take: query.limit, include }),
        this.prisma.teamNewsItem.count({ where }),
      ]);
      const itemUids = rows.map((r) => r.uid);
      const [discussions, upvotes] = await Promise.all([
        this.loadDiscussions(itemUids),
        this.loadUpvotes(itemUids, viewerMemberUid),
      ]);
      return {
        page: query.page,
        limit: query.limit,
        total,
        items: rows.map((row) => this.toDto(row, discussions.get(row.uid), followedTeamUids, upvotes)),
      };
    }

    // Followed-first: paginate across two ordered segments (followed teams,
    // then everyone else) so the global ordering stays stable across pages.
    const followedWhere: Prisma.TeamNewsItemWhereInput = { AND: [where, { teamUid: { in: followed } }] };
    const unfollowedWhere: Prisma.TeamNewsItemWhereInput = { AND: [where, { teamUid: { notIn: followed } }] };

    const [followedTotal, total] = await Promise.all([
      this.prisma.teamNewsItem.count({ where: followedWhere }),
      this.prisma.teamNewsItem.count({ where }),
    ]);

    const rows: Prisma.TeamNewsItemGetPayload<{ include: typeof include }>[] = [];
    const followedTake = Math.min(query.limit, Math.max(0, followedTotal - skip));
    if (followedTake > 0) {
      rows.push(
        ...(await this.prisma.teamNewsItem.findMany({
          where: followedWhere,
          orderBy,
          skip: Math.min(skip, followedTotal),
          take: followedTake,
          include,
        }))
      );
    }
    const remaining = query.limit - followedTake;
    if (remaining > 0) {
      rows.push(
        ...(await this.prisma.teamNewsItem.findMany({
          where: unfollowedWhere,
          orderBy,
          skip: Math.max(0, skip - followedTotal),
          take: remaining,
          include,
        }))
      );
    }

    const itemUids = rows.map((r) => r.uid);
    const [discussions, upvotes] = await Promise.all([
      this.loadDiscussions(itemUids),
      this.loadUpvotes(itemUids, viewerMemberUid),
    ]);
    return {
      page: query.page,
      limit: query.limit,
      total,
      items: rows.map((row) => this.toDto(row, discussions.get(row.uid), followedTeamUids, upvotes)),
    };
  }

  /**
   * Recent post counts for a batch of teams — what the "N new posts" chip reads.
   *
   * Sits beside `listTeamNewsByTeam` on purpose: that method is what the chip
   * OPENS, so the two have to be read together. Note they do not match, and are
   * not meant to. The archive below applies no date window at all, so this count
   * is always a strict subset of what the reader lands on — the chip promises 3
   * and the modal shows those 3 at the top of everything the team ever published
   * (it orders by eventDate desc). Promising less than you deliver is the safe
   * direction; the reverse would be a lie on every card.
   *
   * The exclusion list IS applied here while the archive ignores it, which is the
   * one deliberate asymmetry: the grid and the job board are public discovery
   * surfaces of exactly the kind TEAM_NEWS_EXCLUDED_TEAM_NAMES governs, whereas
   * a team's own profile is not. An excluded team gets no chip and keeps its
   * profile news.
   *
   * Teams with nothing recent are absent from the map rather than zero — see
   * TeamNewsCountsResponseSchema.
   */
  async getRecentCountsByTeam(teamUids: string[]): Promise<TeamNewsCountsResponse> {
    if (teamUids.length === 0) {
      return { counts: {} };
    }

    const cutoff = new Date(Date.now() - TEAM_NEWS_COUNT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const and: Prisma.TeamNewsItemWhereInput[] = [{ teamUid: { in: teamUids } }, { eventDate: { gte: cutoff } }];

    const excluded = this.excludedTeamsWhere();
    if (excluded) {
      and.push(excluded);
    }

    // Covered by @@index([teamUid, eventDate(sort: Desc)]).
    const grouped = await this.prisma.teamNewsItem.groupBy({
      by: ['teamUid'],
      where: { AND: and },
      _count: { _all: true },
    });

    return { counts: Object.fromEntries(grouped.map((row) => [row.teamUid, row._count._all])) };
  }

  async listTeamNewsByTeam(
    teamUid: string,
    query: TeamNewsByTeamQuery,
    followedTeamUids: Set<string> = new Set(),
    viewerMemberUid?: string
  ): Promise<TeamNewsByTeamResponse> {
    const team = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: { uid: true, name: true },
    });

    if (!team) {
      throw new NotFoundException(`Team with uid ${teamUid} not found`);
    }

    const and: Prisma.TeamNewsItemWhereInput[] = [{ teamUid }];
    if (query.q?.trim()) {
      const search = query.q.trim();
      and.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { summary: { contains: search, mode: 'insensitive' } },
          { sourceDomain: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.TeamNewsItemWhereInput = { AND: and };
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

    const itemUids = rows.map((r) => r.uid);
    const [discussions, upvotes] = await Promise.all([
      this.loadDiscussions(itemUids),
      this.loadUpvotes(itemUids, viewerMemberUid),
    ]);

    return {
      teamUid: team.uid,
      teamName: team.name,
      page: query.page,
      limit: query.limit,
      total,
      items: rows.map((row) => this.toDto(row, discussions.get(row.uid), followedTeamUids, upvotes)),
    };
  }

  async listGroupedByFocusArea(
    query: TeamNewsListQuery,
    followedTeamUids: Set<string> = new Set(),
    viewerMemberUid?: string
  ): Promise<TeamNewsGroupedResponse> {
    const forYouPromise =
      viewerMemberUid && this.suggestionsService
        ? this.suggestionsService.getForYouTeamUids(viewerMemberUid)
        : Promise.resolve([] as string[]);

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

    const itemUids = rows.map((r) => r.uid);
    const [focusAreas, discussions, upvotes, forYouTeamUids] = await Promise.all([
      this.prisma.focusArea.findMany({
        where: { parentUid: null },
        select: { uid: true, title: true },
      }),
      this.loadDiscussions(itemUids),
      this.loadUpvotes(itemUids, viewerMemberUid),
      forYouPromise,
    ]);
    const focusByTitle = new Map(focusAreas.map((fa) => [fa.title, fa]));

    const alwaysIncludeInAllTab = new Set<string>(TEAM_NEWS_ALWAYS_INCLUDE_IN_ALL_TAB_TEAM_UIDS);
    const groups = new Map<string, TeamNewsItemDto[]>();
    const allTabExtraItems: TeamNewsItemDto[] = [];
    for (const row of rows) {
      const dto = this.toDto(row, discussions.get(row.uid), followedTeamUids, upvotes);
      let addedToGroup = false;
      for (const title of dto.focusAreas) {
        if (!focusByTitle.has(title)) continue;
        if (!groups.has(title)) groups.set(title, []);
        groups.get(title)!.push(dto);
        addedToGroup = true;
      }
      // Untagged teams are dropped from every tab unless allowlisted (Protocol
      // Labs) or editorially ranked — Top Stories is computed client-side from
      // the All-tab corpus, so a pick with no focus area would otherwise vanish.
      if (!addedToGroup && (alwaysIncludeInAllTab.has(dto.teamUid) || dto.editorialRank != null)) {
        allTabExtraItems.push(dto);
      }
    }

    // Within each focus-area group, surface followed-team news first while
    // preserving the eventDate-desc order the rows arrived in (stable sort).
    if (followedTeamUids.size > 0) {
      for (const items of groups.values()) {
        items.sort((a, b) => Number(b.isFollowed) - Number(a.isFollowed));
      }
      allTabExtraItems.sort((a, b) => Number(b.isFollowed) - Number(a.isFollowed));
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
      allTabExtraItems,
      forYouTeamUids,
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

    const excluded = this.excludedTeamsWhere();
    const where: Prisma.TeamNewsItemWhereInput = {
      createdAt: { gt: since, lte: until },
      ...(excluded ?? {}),
    };

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

    const itemUids = rows.map((r) => r.uid);
    const [discussions, upvotes] = await Promise.all([this.loadDiscussions(itemUids), this.loadUpvotes(itemUids)]);

    return {
      generatedAt: new Date().toISOString(),
      since: since.toISOString(),
      until: until.toISOString(),
      items: rows.map((row) => this.toDto(row, discussions.get(row.uid), new Set(), upvotes)),
    };
  }

  /**
   * "Popular this week" rail: news with eventDate in the last 14 days and at
   * least 2 upvotes, ranked by upvote count. Empty when nothing qualifies.
   */
  async getPopular(query: TeamNewsPopularQuery): Promise<TeamNewsPopularResponse> {
    const since = new Date(Date.now() - POPULAR_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const where: Prisma.TeamNewsItemWhereInput = { eventDate: { gte: since } };
    if (TEAM_NEWS_EXCLUDED_TEAM_NAMES.length > 0) {
      where.NOT = {
        OR: TEAM_NEWS_EXCLUDED_TEAM_NAMES.map((name) => ({
          team: { name: { equals: name, mode: 'insensitive' } },
        })),
      };
    }

    const rows = await this.prisma.teamNewsItem.findMany({
      where,
      select: {
        uid: true,
        title: true,
        teamUid: true,
        sourceUrl: true,
        eventDate: true,
        team: { select: { name: true } },
        _count: { select: { upvotes: true } },
      },
    });

    const items = rows
      .filter((row) => row._count.upvotes >= POPULAR_MIN_UPVOTES)
      .sort((a, b) => {
        const byCount = b._count.upvotes - a._count.upvotes;
        if (byCount !== 0) return byCount;
        return b.eventDate.getTime() - a.eventDate.getTime();
      })
      .slice(0, query.limit)
      .map((row) => ({
        uid: row.uid,
        title: row.title,
        teamUid: row.teamUid,
        teamName: row.team.name,
        sourceUrl: row.sourceUrl,
        upvoteCount: row._count.upvotes,
      }));

    return { items };
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

  private async loadUpvotes(itemUids: string[], viewerMemberUid?: string): Promise<UpvoteStamp> {
    if (itemUids.length === 0) {
      return { counts: new Map(), viewerUpvoted: new Set() };
    }

    const [grouped, viewerRows] = await Promise.all([
      this.prisma.teamNewsUpvote.groupBy({
        by: ['newsItemUid'],
        where: { newsItemUid: { in: itemUids } },
        _count: { _all: true },
      }),
      viewerMemberUid
        ? this.prisma.teamNewsUpvote.findMany({
            where: { newsItemUid: { in: itemUids }, memberUid: viewerMemberUid },
            select: { newsItemUid: true },
          })
        : Promise.resolve([] as Array<{ newsItemUid: string }>),
    ]);

    return {
      counts: new Map(grouped.map((g) => [g.newsItemUid, g._count._all])),
      viewerUpvoted: new Set(viewerRows.map((r) => r.newsItemUid)),
    };
  }

  private toDto(
    row: {
      uid: string;
      teamUid: string;
      eventType: NewsEventType;
      eventDate: Date;
      title: string;
      summary: string | null;
      contentHtml: string | null;
      sourceUrl: string;
      sourceUrls: string[];
      sourceDomain: string | null;
      tags: string[];
      editorialRank: number | null;
      viewCount: number;
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
    discussion: TeamNewsDiscussion | undefined,
    followedTeamUids: Set<string> = new Set(),
    upvotes: UpvoteStamp = { counts: new Map(), viewerUpvoted: new Set() }
  ): TeamNewsItemDto & {
    sourceUrls: string[];
    sources: Array<{ url: string; domain: string | null }>;
  } {
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
      contentHtml: row.contentHtml,
      sourceUrl: row.sourceUrl,
      sourceUrls: row.sourceUrls.length > 0 ? row.sourceUrls : [row.sourceUrl],
      sources: (row.sourceUrls.length > 0 ? row.sourceUrls : [row.sourceUrl]).map((url) => ({
        url,
        domain: (() => {
          try {
            return new URL(url).hostname.replace(/^www\./, '');
          } catch {
            return null;
          }
        })(),
      })),
      sourceDomain: row.sourceDomain,
      tags: row.tags,
      focusAreas: [...new Set(focusAreas)],
      subFocusAreas: [...new Set(subFocusAreas)],
      createdAt: row.createdAt.toISOString(),
      discussion: discussion ?? EMPTY_DISCUSSION,
      isFollowed: followedTeamUids.has(row.teamUid),
      upvoteCount: upvotes.counts.get(row.uid) ?? 0,
      viewerHasUpvoted: upvotes.viewerUpvoted.has(row.uid),
      editorialRank: row.editorialRank ?? null,
      viewCount: row.viewCount,
    };
  }
}
