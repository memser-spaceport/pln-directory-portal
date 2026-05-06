import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { IngestTeamNewsDto, IngestTeamNewsResponse, TeamNewsIngestItem } from './dto/ingest-team-news.dto';
import { computeCanonicalKey } from './utils/canonical-key';
import { extractDomain } from './utils/url-normalize';

// The directory's own definition of "recent" for the denormalized
// `TeamNewsEnrichment.recentNewsCount`. Independent of producer policy —
// producers decide what they ingest; the directory decides what it counts.
const RECENT_WINDOW_DAYS = 14;

interface ParseOutcome {
  ok: boolean;
  eventDate?: Date;
  reason?: 'no-source' | 'unparseable-date' | 'unknown-team';
}

@Injectable()
export class TeamNewsService {
  private readonly logger = new Logger(TeamNewsService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    this.logger.log(
      `Team-news ingest complete (runId=${dto.runId ?? 'none'}, source=${dto.source ?? 'none'}): ` +
        `received=${result.received} ingested=${result.ingested} ` +
        `rejectedNoSource=${result.rejectedNoSource} rejectedUnknownTeam=${result.rejectedUnknownTeam} ` +
        `failed=${result.failed}`
    );

    return result;
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
}
