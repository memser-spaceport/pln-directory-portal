import { Injectable } from '@nestjs/common';
import { Prisma, NewsEventType } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import type {
  TeamNewsFiltersResponse,
  TeamNewsGroupedResponse,
  TeamNewsItemDto,
  TeamNewsListQuery,
  TeamNewsListResponse,
} from 'libs/contracts/src/schema/team-news';

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

    const since = this.resolveSinceCutoff(query);
    if (since) {
      and.push({ eventDate: { gte: since } });
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

    return and.length > 0 ? { AND: and } : {};
  }

  private resolveSinceCutoff(query: TeamNewsListQuery): Date | null {
    if (query.since) {
      const explicit = new Date(query.since);
      if (!Number.isNaN(explicit.getTime())) return explicit;
    }
    if (query.windowDays > 0) {
      return new Date(Date.now() - query.windowDays * 24 * 60 * 60 * 1000);
    }
    return null;
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

    return {
      page: query.page,
      limit: query.limit,
      total,
      items: rows.map((row) => this.toDto(row)),
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

    const focusAreas = await this.prisma.focusArea.findMany({
      where: { parentUid: null },
      select: { uid: true, title: true },
    });
    const focusByTitle = new Map(focusAreas.map((fa) => [fa.title, fa]));

    const groups = new Map<string, TeamNewsItemDto[]>();
    for (const row of rows) {
      const dto = this.toDto(row);
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

  private toDto(row: {
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
  }): TeamNewsItemDto {
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
    };
  }
}
