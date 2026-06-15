import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, PushNotificationCategory } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { IngestTeamNewsDto, IngestTeamNewsResponse, TeamNewsIngestItem } from './dto/ingest-team-news.dto';
import type {
  CreateTeamNewsDiscussionRequest,
  CreateTeamNewsDiscussionResponse,
  TeamNewsForumLinkDto,
} from 'libs/contracts/src/schema/team-news';
import { computeCanonicalKey } from './utils/canonical-key';
import { extractDomain } from './utils/url-normalize';

// The directory's own definition of "recent" for the denormalized
// `TeamNewsEnrichment.recentNewsCount`. Independent of producer policy —
// producers decide what they ingest; the directory decides what it counts.
const RECENT_WINDOW_DAYS = 14;

// Where a "News from the network" notification deep-links to. The feed lives on
// the home page; there is no per-item detail route.
const TEAM_NEWS_NOTIFICATION_LINK = '/home';

interface ParseOutcome {
  ok: boolean;
  eventDate?: Date;
  reason?: 'no-source' | 'unparseable-date' | 'unknown-team';
}

// Per-team running tally of the newly-created items in a single ingest run.
// Drives one broadcast notification per team (see notifyTeamsWithNews).
interface CreatedTeamNews {
  count: number;
  latestTitle: string;
  latestEventDate: Date;
}

@Injectable()
export class TeamNewsService {
  private readonly logger = new Logger(TeamNewsService.name);

  constructor(private readonly prisma: PrismaService, private readonly pushNotifications: PushNotificationsService) {}

  async ingestTeamNews(dto: IngestTeamNewsDto): Promise<IngestTeamNewsResponse> {
    const result: IngestTeamNewsResponse = {
      received: dto.items.length,
      ingested: 0,
      created: 0,
      updated: 0,
      rejectedNoSource: 0,
      rejectedUnknownTeam: 0,
      failed: 0,
      errors: [],
    };

    if (dto.items.length === 0) {
      return result;
    }

    const teamUids = [...new Set(dto.items.map((i) => i.teamUid))];
    const validTeams = await this.prisma.team.findMany({
      where: { uid: { in: teamUids } },
      select: { uid: true },
    });
    const validTeamUids = new Set(validTeams.map((t) => t.uid));

    const teamsTouched = new Set<string>();
    // Only items that were genuinely inserted (not re-ingested updates) should
    // trigger a notification, so we track creations per team here.
    const createdByTeam = new Map<string, CreatedTeamNews>();

    for (const item of dto.items) {
      try {
        const parsed = this.parseAndValidate(item, validTeamUids);
        if (!parsed.ok) {
          this.bumpRejectionCounter(result, parsed.reason);
          continue;
        }
        if (!parsed.eventDate) {
          result.failed++;
          continue;
        }

        const created = await this.upsertNewsItem(item, parsed.eventDate);
        if (created) {
          result.created++;
          this.trackCreatedItem(createdByTeam, item, parsed.eventDate);
        } else {
          result.updated++;
        }
        result.ingested++;
        teamsTouched.add(item.teamUid);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to ingest news item for team ${item.teamUid}: ${message}`);
        result.failed++;
        result.errors?.push(`teamUid=${item.teamUid} title="${item.title.slice(0, 60)}": ${message}`);
      }
    }

    await this.recomputeRecentNewsCounts(teamsTouched);
    await this.notifyTeamsWithNews(createdByTeam);

    this.logger.log(
      `Team-news ingest complete (runId=${dto.runId ?? 'none'}, source=${dto.source ?? 'none'}): ` +
        `received=${result.received} ingested=${result.ingested} ` +
        `rejectedNoSource=${result.rejectedNoSource} rejectedUnknownTeam=${result.rejectedUnknownTeam} ` +
        `failed=${result.failed}`
    );

    return result;
  }

  private trackCreatedItem(createdByTeam: Map<string, CreatedTeamNews>, item: TeamNewsIngestItem, eventDate: Date) {
    const agg = createdByTeam.get(item.teamUid);
    if (!agg) {
      createdByTeam.set(item.teamUid, { count: 1, latestTitle: item.title, latestEventDate: eventDate });
      return;
    }
    agg.count++;
    // Keep the most recent item's title as the notification preview.
    if (eventDate.getTime() >= agg.latestEventDate.getTime()) {
      agg.latestTitle = item.title;
      agg.latestEventDate = eventDate;
    }
  }

  /**
   * Broadcast one in-app notification per team that received new news in this
   * ingest run. Re-ingesting the same items updates rather than inserts (see
   * upsertNewsItem), so replays do not re-notify. Each notification is public
   * (broadcast to all users) and links to the home-page news feed.
   *
   * Failures here never fail the ingest — news is already persisted; the
   * notification is best-effort.
   */
  private async notifyTeamsWithNews(createdByTeam: Map<string, CreatedTeamNews>) {
    if (createdByTeam.size === 0) return;

    const teamUids = [...createdByTeam.keys()];
    const teams = await this.prisma.team.findMany({
      where: { uid: { in: teamUids } },
      select: { uid: true, name: true, logo: { select: { url: true } } },
    });
    const teamByUid = new Map(teams.map((t) => [t.uid, t]));

    for (const [teamUid, agg] of createdByTeam) {
      const team = teamByUid.get(teamUid);
      const teamName = team?.name ?? 'A team';
      const title = agg.count === 1 ? `${teamName} shared an update` : `${teamName} shared ${agg.count} updates`;

      try {
        await this.pushNotifications.create({
          category: PushNotificationCategory.TEAM_NEWS,
          title,
          description: agg.latestTitle,
          image: team?.logo?.url ?? undefined,
          link: TEAM_NEWS_NOTIFICATION_LINK,
          linkText: 'View news',
          isPublic: true,
          metadata: {
            eventType: 'team_news',
            teamUid,
            itemCount: agg.count,
          },
        });
      } catch (error) {
        this.logger.warn(
          `Team-news notification failed for team ${teamUid}: ${error instanceof Error ? error.message : error}`
        );
      }
    }

    this.logger.log(`Team-news notifications broadcast for ${createdByTeam.size} team(s)`);
  }

  private bumpRejectionCounter(result: IngestTeamNewsResponse, reason: ParseOutcome['reason']) {
    switch (reason) {
      case 'no-source':
      case 'unparseable-date':
        result.rejectedNoSource++;
        return;
      case 'unknown-team':
        result.rejectedUnknownTeam++;
        return;
      default:
        result.failed++;
        return;
    }
  }

  private parseAndValidate(item: TeamNewsIngestItem, validTeamUids: Set<string>): ParseOutcome {
    if (!item.sourceUrl || !/^https?:\/\//i.test(item.sourceUrl)) {
      return { ok: false, reason: 'no-source' };
    }
    if (!validTeamUids.has(item.teamUid)) {
      return { ok: false, reason: 'unknown-team' };
    }

    const eventDate = new Date(item.eventDate);
    if (Number.isNaN(eventDate.getTime())) {
      return { ok: false, reason: 'unparseable-date' };
    }

    return { ok: true, eventDate };
  }

  /**
   * Returns true if a new row was inserted, false if an existing row was updated.
   */
  private async upsertNewsItem(item: TeamNewsIngestItem, eventDate: Date): Promise<boolean> {
    const canonicalKey = computeCanonicalKey(item.teamUid, item.sourceUrl, eventDate);
    const sourceDomain = extractDomain(item.sourceUrl);

    const data: Prisma.TeamNewsItemUncheckedCreateInput = {
      teamUid: item.teamUid,
      canonicalKey,
      eventType: item.eventType,
      eventDate,
      title: item.title,
      summary: item.summary ?? null,
      sourceUrl: item.sourceUrl,
      sourceDomain,
      tags: item.tags,
      rawPayload: (item.rawPayload as Prisma.InputJsonValue) ?? Prisma.JsonNull,
    };

    const existing = await this.prisma.teamNewsItem.findUnique({
      where: { canonicalKey },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.teamNewsItem.update({
        where: { canonicalKey },
        data: {
          eventType: data.eventType,
          eventDate,
          title: data.title,
          summary: data.summary,
          sourceUrl: data.sourceUrl,
          sourceDomain: data.sourceDomain,
          tags: data.tags,
          rawPayload: data.rawPayload,
        },
      });
      return false;
    }

    await this.prisma.teamNewsItem.create({ data });
    return true;
  }

  private async recomputeRecentNewsCounts(teamUids: Set<string>) {
    if (teamUids.size === 0) return;
    const cutoff = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    for (const teamUid of teamUids) {
      const recentNewsCount = await this.prisma.teamNewsItem.count({
        where: { teamUid, eventDate: { gte: cutoff } },
      });

      await this.prisma.teamNewsEnrichment.upsert({
        where: { teamUid },
        create: { teamUid, recentNewsCount },
        update: { recentNewsCount },
      });
    }
  }

  /**
   * Record that a forum topic was created in response to a news item.
   * Idempotent on (newsItemUid, forumTopicId) — replaying the same call
   * returns the existing link with `created: false`. Used by the home-page
   * "Discuss" flow, called by the frontend after a successful topic create.
   *
   * Throws NotFound when the news item does not exist (e.g. stale link
   * attempt against a deleted item).
   */
  async createForumLink(
    newsItemUid: string,
    body: CreateTeamNewsDiscussionRequest,
    actorUid: string | null
  ): Promise<CreateTeamNewsDiscussionResponse> {
    const item = await this.prisma.teamNewsItem.findUnique({
      where: { uid: newsItemUid },
      select: { uid: true },
    });
    if (!item) {
      throw new NotFoundException(`TeamNewsItem ${newsItemUid} not found`);
    }

    // Upsert keeps the call idempotent under concurrent submits (two clients
    // racing to link the same news item to the same topic would otherwise
    // produce a 500 from the unique-constraint violation on the second
    // caller). `created` is inferred from whether the existing row's
    // createdAt was just stamped — we treat any pre-existing link as "not
    // created by this call".
    const before = await this.prisma.teamNewsForumLink.findUnique({
      where: { newsItemUid_forumTopicId: { newsItemUid, forumTopicId: body.forumTopicId } },
      select: { id: true },
    });
    const row = await this.prisma.teamNewsForumLink.upsert({
      where: { newsItemUid_forumTopicId: { newsItemUid, forumTopicId: body.forumTopicId } },
      create: {
        newsItemUid,
        forumTopicId: body.forumTopicId,
        forumTopicSlug: body.forumTopicSlug,
        forumTopicUrl: body.forumTopicUrl,
        createdByUid: actorUid,
      },
      update: {},
    });
    return { link: this.toForumLinkDto(row), created: !before };
  }

  private toForumLinkDto(row: {
    uid: string;
    newsItemUid: string;
    forumTopicId: number;
    forumTopicSlug: string;
    forumTopicUrl: string;
    createdByUid: string | null;
    createdAt: Date;
  }): TeamNewsForumLinkDto {
    return {
      uid: row.uid,
      newsItemUid: row.newsItemUid,
      forumTopicId: row.forumTopicId,
      forumTopicSlug: row.forumTopicSlug,
      forumTopicUrl: row.forumTopicUrl,
      createdByUid: row.createdByUid,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
