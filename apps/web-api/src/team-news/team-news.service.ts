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
import { extractDomain, normalizeSourceUrl } from './utils/url-normalize';
import { isDuplicateNewsStory } from './utils/news-dedup';

// The directory's own definition of "recent" for the denormalized
// `TeamNewsEnrichment.recentNewsCount`. Independent of producer policy —
// producers decide what they ingest; the directory decides what it counts.
const RECENT_WINDOW_DAYS = 14;

// Where a "News from the network" notification deep-links to. The feed lives on
// the home page; there is no per-item detail route.
const TEAM_NEWS_NOTIFICATION_LINK = '/home';

// Static title for every run notification — the team breakdown lives in the
// description instead (see buildRunCopy).
const TEAM_NEWS_NOTIFICATION_TITLE = 'Latest News from the network';

// How many team names to spell out in the description before collapsing the
// remainder into "+N more".
const TEAM_NEWS_NAMED_TEAMS = 2;

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

const STORY_MATCH_WINDOW_DAYS = 7;

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
    await this.notifyRun(dto, createdByTeam);

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
   * Emit a SINGLE in-app notification summarising an ingest run — e.g. "Fresh
   * news from 20 teams across the network".
   *
   * The producer (pln-data-enrichment) splits one run into several ingest HTTP
   * calls (batches) that share the same `runId`. We key the notification on
   * `metadata.runId`: the first batch with new items creates and broadcasts it;
   * later batches of the same run merge their counts into that one row in place
   * (no re-broadcast). The DB therefore always settles on the run's final
   * totals, which any refetch (reload / new login / opening the bell) shows.
   *
   * Re-ingesting the same items updates rather than inserts (see upsertNewsItem),
   * so replays contribute zero new items and never inflate the counts. When the
   * run has no `runId` (e.g. a manual ingest), each call is treated as its own
   * run and gets its own notification.
   *
   * Failures here never fail the ingest — news is already persisted; the
   * notification is best-effort.
   */
  private async notifyRun(dto: IngestTeamNewsDto, createdByTeam: Map<string, CreatedTeamNews>) {
    if (createdByTeam.size === 0) return;
    const runId = dto.runId ?? null;

    // This batch's contribution: total inserts + each team's most-recent
    // event date (the basis for ordering teams in the copy).
    const batchUpdates = [...createdByTeam.values()].reduce((sum, agg) => sum + agg.count, 0);
    const batchLatestByTeam = new Map<string, number>();
    let batchLatest = { title: '', date: new Date(0) };
    for (const [uid, agg] of createdByTeam) {
      batchLatestByTeam.set(uid, agg.latestEventDate.getTime());
      if (agg.latestEventDate.getTime() >= batchLatest.date.getTime()) {
        batchLatest = { title: agg.latestTitle, date: agg.latestEventDate };
      }
    }

    try {
      // Find an existing notification for this run (same runId), if any.
      const existing = runId
        ? await this.prisma.pushNotification.findFirst({
            where: {
              category: PushNotificationCategory.TEAM_NEWS,
              AND: [{ metadata: { path: ['runId'], equals: runId } }],
            },
          })
        : null;

      // Merge this batch into the run's running totals.
      const prevMeta = (existing?.metadata as Record<string, any>) ?? {};

      // Track each team's latest event date across the whole run so the team
      // list can be ordered most-recent-first — the same order the home feed's
      // "All" tab uses (eventDate DESC). Seed from any teams already on the
      // notification (legacy rows may lack `teamLatest`) so a mid-run deploy
      // never drops earlier teams.
      const teamLatest: Record<string, string> = {};
      for (const uid of prevMeta.teamUids ?? []) {
        teamLatest[uid] = prevMeta.teamLatest?.[uid] ?? new Date(0).toISOString();
      }
      for (const [uid, ms] of batchLatestByTeam) {
        const prev = teamLatest[uid] ? new Date(teamLatest[uid]).getTime() : 0;
        if (ms >= prev) teamLatest[uid] = new Date(ms).toISOString();
      }
      const teamUids = Object.keys(teamLatest).sort(
        (a, b) => new Date(teamLatest[b]).getTime() - new Date(teamLatest[a]).getTime()
      );

      const updateCount: number = (prevMeta.updateCount ?? 0) + batchUpdates;
      const prevLatestDate = prevMeta.latestEventDate ? new Date(prevMeta.latestEventDate) : new Date(0);
      const latest =
        batchLatest.date.getTime() >= prevLatestDate.getTime()
          ? batchLatest
          : { title: prevMeta.latestTitle ?? '', date: prevLatestDate };

      const copy = await this.buildRunCopy(teamUids);
      const metadata = {
        eventType: 'team_news',
        runId,
        teamUids,
        teamCount: teamUids.length,
        updateCount,
        teamLatest,
        latestTitle: latest.title,
        latestEventDate: latest.date.toISOString(),
      };

      if (existing) {
        // Later batch of the same run: update the stored counts in place.
        await this.prisma.pushNotification.update({
          where: { id: existing.id },
          data: { title: copy.title, description: copy.description, image: copy.image ?? null, metadata },
        });
      } else {
        // First batch of the run (or no runId): create + broadcast to all users.
        await this.pushNotifications.create({
          category: PushNotificationCategory.TEAM_NEWS,
          title: copy.title,
          description: copy.description,
          image: copy.image,
          link: TEAM_NEWS_NOTIFICATION_LINK,
          linkText: 'View news',
          isPublic: true,
          metadata,
        });
      }

      this.logger.log(
        `Team-news run notification (runId=${runId ?? 'none'}): teams=${teamUids.length} updates=${updateCount} ${
          existing ? 'updated' : 'created'
        }`
      );
    } catch (error) {
      this.logger.warn(
        `Team-news run notification failed (runId=${runId ?? 'none'}): ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }

  /**
   * Build the notification copy for a run. The title is fixed; the description
   * lists the teams with fresh news, ordered most-recent-first (same order as
   * the home feed's "All" tab) so the first team named matches the first card
   * on /home — e.g.:
   *   many:   title "Latest News from the network"
   *           desc  "New updates from companies like Lido Finance, Lava Network + 40 more"
   *   one:    title "Latest News from the network"
   *           desc  "New updates from Lido Finance"
   * `teamUids` is expected pre-sorted by latest event date (see notifyRun).
   * A team logo is attached only when the whole run is about one team.
   */
  private async buildRunCopy(
    teamUids: string[]
  ): Promise<{ title: string; description: string; image?: string }> {
    // Only the spelled-out names need fetching; the rest collapse into "+N more".
    const sampleUids = teamUids.slice(0, TEAM_NEWS_NAMED_TEAMS);
    const teams = await this.prisma.team.findMany({
      where: { uid: { in: sampleUids } },
      select: { uid: true, name: true, logo: { select: { url: true } } },
    });
    const teamByUid = new Map(teams.map((t) => [t.uid, t]));
    const names = sampleUids.map((uid) => teamByUid.get(uid)?.name ?? 'a team');
    const nameList = names.join(', ');

    const remaining = teamUids.length - names.length;
    const description =
      remaining > 0
        ? `New updates from companies like ${nameList} + ${remaining} more`
        : `New updates from ${nameList}`;

    const image = teamUids.length === 1 ? teamByUid.get(teamUids[0])?.logo?.url ?? undefined : undefined;

    return { title: TEAM_NEWS_NOTIFICATION_TITLE, description, image };
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
  private async upsertNewsItem(
    item: TeamNewsIngestItem,
    eventDate: Date
  ): Promise<boolean> {
    const normalizedIncomingUrl = normalizeSourceUrl(item.sourceUrl);
    const sourceDomain = extractDomain(item.sourceUrl);

    const canonicalKey = computeCanonicalKey(
      item.teamUid,
      item.sourceUrl,
      eventDate
    );

    const data: Prisma.TeamNewsItemUncheckedCreateInput = {
      teamUid: item.teamUid,
      canonicalKey,
      eventType: item.eventType,
      eventDate,
      title: item.title,
      summary: item.summary ?? null,
      contentHtml: item.contentHtml ?? null,
      sourceUrl: item.sourceUrl,
      sourceUrls: [item.sourceUrl],
      sourceDomain,
      tags: item.tags,
      rawPayload:
        (item.rawPayload as Prisma.InputJsonValue) ?? Prisma.JsonNull,
    };

    /*
     * Exact canonical-key match remains the fastest/idempotent path for
     * replaying the same item.
     */
    const exactExisting = await this.prisma.teamNewsItem.findUnique({
      where: { canonicalKey },
      select: {
        id: true,
        sourceUrl: true,
        sourceUrls: true,
        title: true,
        summary: true,
        contentHtml: true,
        tags: true,
      },
    });

    /*
     * Different publishers may report the same event on nearby dates.
     * This is an event-date window, not a restriction relative to today.
     */
    const windowMs =
      STORY_MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    const nearbyItems = exactExisting
      ? []
      : await this.prisma.teamNewsItem.findMany({
        where: {
          teamUid: item.teamUid,
          eventDate: {
            gte: new Date(eventDate.getTime() - windowMs),
            lte: new Date(eventDate.getTime() + windowMs),
          },
        },
        orderBy: [
          { eventDate: 'desc' },
          { createdAt: 'desc' },
        ],
        select: {
          id: true,
          sourceUrl: true,
          sourceUrls: true,
          title: true,
          summary: true,
          contentHtml: true,
          tags: true,
        },
      });

    /*
     * Check all stored source URLs first. This supports both migrated rows
     * and rows that have already accumulated multiple sources.
     */
    const sameSourceExisting = nearbyItems.find((candidate) => {
      const urls =
        candidate.sourceUrls.length > 0
          ? candidate.sourceUrls
          : [candidate.sourceUrl];

      return urls.some(
        (url) =>
          normalizeSourceUrl(url) === normalizedIncomingUrl
      );
    });

    /*
     * If the source is new, check whether it is another article about the
     * same story. The shared develop utility remains the single semantic
     * dedup implementation.
     */
    const semanticExisting =
      sameSourceExisting ??
      nearbyItems.find((candidate) =>
        isDuplicateNewsStory(item, candidate)
      );

    const existing = exactExisting ?? semanticExisting;

    if (existing) {
      const currentUrls =
        existing.sourceUrls.length > 0
          ? existing.sourceUrls
          : [existing.sourceUrl];

      const alreadyStored = currentUrls.some(
        (url) =>
          normalizeSourceUrl(url) === normalizedIncomingUrl
      );

      const sourceUrls = alreadyStored
        ? currentUrls
        : [...currentUrls, item.sourceUrl];

      await this.prisma.teamNewsItem.update({
        where: { id: existing.id },
        data: {
          sourceUrls,
          tags: [...new Set([...existing.tags, ...item.tags])],
          // Do not erase richer HTML when an older producer replays an item.
          contentHtml: item.contentHtml ?? existing.contentHtml,
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
