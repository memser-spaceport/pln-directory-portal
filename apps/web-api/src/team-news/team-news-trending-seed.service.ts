import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { generateObject } from 'ai';
import { z } from 'zod';
import type {
  SeedTeamNewsTrendingDto,
  SeedTeamNewsTrendingResponse,
} from 'libs/contracts/src/schema/team-news';
import { PrismaService } from '../shared/prisma.service';
import { AiProviderService } from '../shared/ai-provider.service';
import {
  PROTOCOL_LABS_TEAM_UID,
  TEAM_NEWS_EXCLUDED_TEAM_NAMES,
} from './team-news-public-list.config';
import {
  clampTrendingLimit,
  forceIncludeProtocolLabs,
  likesForRank,
  TRENDING_SEED_BOT_COUNT,
  TRENDING_SEED_EXTERNAL_ID_PREFIX,
} from './team-news-trending-seed.util';

const POPULAR_WINDOW_DAYS = 14;
const PROVIDER_ENV_VAR = 'TEAM_NEWS_TRENDING_AI_PROVIDER';

const LlmRankingSchema = z.object({
  rankedUids: z.array(z.string()).min(1).max(7),
});

type CandidateRow = {
  uid: string;
  teamUid: string;
  title: string;
  summary: string | null;
  eventType: string;
  eventDate: Date;
  team: { name: string };
};

@Injectable()
export class TeamNewsTrendingSeedService {
  private readonly logger = new Logger(TeamNewsTrendingSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService
  ) {}

  async seedTrending(dto: SeedTeamNewsTrendingDto): Promise<SeedTeamNewsTrendingResponse> {
    const createdAfter = new Date(dto.createdAfter);
    if (Number.isNaN(createdAfter.getTime())) {
      throw new BadRequestException('createdAfter must be a valid ISO datetime');
    }
    const limit = clampTrendingLimit(dto.limit);

    const candidates = await this.loadCandidates(createdAfter);
    if (candidates.length === 0) {
      this.logger.log(`seed-trending: no candidates after ${dto.createdAfter}; skipping`);
      return { ranked: [], protocolLabsIncluded: false, candidateCount: 0 };
    }

    const plCandidate =
      candidates.find((c) => c.teamUid === PROTOCOL_LABS_TEAM_UID) ??
      (await this.loadNewestProtocolLabsInPopularWindow());

    const pool = [...candidates];
    if (plCandidate && !pool.some((c) => c.uid === plCandidate.uid)) {
      pool.push(plCandidate);
    }

    const llmRanked = await this.rankWithLlm(pool, limit);
    const plUidInPool = plCandidate?.uid ?? null;
    const finalUids = forceIncludeProtocolLabs(llmRanked, plUidInPool, limit);

    const botMemberUids = await this.ensureSeedBotMembers();
    await this.clearSeedUpvotes(botMemberUids);
    const ranked = await this.applySeedUpvotes(finalUids, botMemberUids);

    const protocolLabsIncluded = finalUids.some((uid) => {
      const row = pool.find((c) => c.uid === uid);
      return row?.teamUid === PROTOCOL_LABS_TEAM_UID;
    });

    this.logger.log(
      `seed-trending: candidates=${pool.length} ranked=${ranked.length} protocolLabsIncluded=${protocolLabsIncluded}`
    );

    return { ranked, protocolLabsIncluded, candidateCount: pool.length };
  }

  private excludedTeamWhere() {
    return {
      OR: TEAM_NEWS_EXCLUDED_TEAM_NAMES.map((name) => ({
        team: { name: { equals: name, mode: 'insensitive' as const } },
      })),
    };
  }

  private async loadCandidates(createdAfter: Date): Promise<CandidateRow[]> {
    return this.prisma.teamNewsItem.findMany({
      where: {
        createdAt: { gte: createdAfter },
        NOT: this.excludedTeamWhere(),
      },
      select: {
        uid: true,
        teamUid: true,
        title: true,
        summary: true,
        eventType: true,
        eventDate: true,
        team: { select: { name: true } },
      },
      orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  private async loadNewestProtocolLabsInPopularWindow(): Promise<CandidateRow | null> {
    const since = new Date(Date.now() - POPULAR_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return this.prisma.teamNewsItem.findFirst({
      where: {
        teamUid: PROTOCOL_LABS_TEAM_UID,
        eventDate: { gte: since },
      },
      select: {
        uid: true,
        teamUid: true,
        title: true,
        summary: true,
        eventType: true,
        eventDate: true,
        team: { select: { name: true } },
      },
      orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async rankWithLlm(candidates: CandidateRow[], limit: number): Promise<string[]> {
    const catalog = candidates.map((c) => ({
      uid: c.uid,
      teamName: c.team.name,
      teamUid: c.teamUid,
      title: c.title,
      summary: c.summary,
      eventType: c.eventType,
      eventDate: c.eventDate.toISOString(),
      isProtocolLabs: c.teamUid === PROTOCOL_LABS_TEAM_UID,
    }));

    const known = new Set(candidates.map((c) => c.uid));
    const targetCount = Math.min(limit, candidates.length);

    try {
      const { object } = await generateObject({
        model: this.aiProvider.getResponsesModel(PROVIDER_ENV_VAR, { useSearchGrounding: false }),
        schema: LlmRankingSchema,
        system: `You rank team news for a Protocol Labs Network home-page "Popular / trending" rail.
Pick the ${targetCount} most newsworthy and interesting items (between 5 and 7 when enough candidates exist).
Prefer diversity of teams and event types. When a Protocol Labs item is present, include it somewhere in the list (not necessarily #1).
Return only UIDs from the provided catalog, ordered best-first.`,
        prompt: `Catalog (JSON):\n${JSON.stringify(catalog, null, 2)}\n\nReturn rankedUids with exactly ${targetCount} UIDs when possible.`,
        temperature: 0.4,
      });

      const filtered = object.rankedUids.filter((uid) => known.has(uid));
      if (filtered.length > 0) {
        return filtered.slice(0, limit);
      }
      this.logger.warn('seed-trending: LLM returned no valid UIDs; falling back to eventDate order');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`seed-trending: LLM ranking failed: ${message}`);
    }

    return candidates
      .slice()
      .sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime())
      .map((c) => c.uid)
      .slice(0, limit);
  }

  /** Idempotently ensure a pool of internal bot members for synthetic upvotes. */
  private async ensureSeedBotMembers(): Promise<string[]> {
    const uids: string[] = [];
    for (let i = 1; i <= TRENDING_SEED_BOT_COUNT; i++) {
      const externalId = `${TRENDING_SEED_EXTERNAL_ID_PREFIX}${i}`;
      const email = `${externalId}@internal.plnetwork.local`;
      const existing = await this.prisma.member.findUnique({
        where: { externalId },
        select: { uid: true },
      });
      if (existing) {
        uids.push(existing.uid);
        continue;
      }
      const created = await this.prisma.member.create({
        data: {
          name: `Trending Seed ${i}`,
          email,
          externalId,
          signUpSource: 'system-trending-seed',
          plnFriend: false,
          isVerified: false,
          approveOnLogin: false,
        },
        select: { uid: true },
      });
      uids.push(created.uid);
    }
    return uids;
  }

  /** Remove prior synthetic likes so re-seeds replace the default trending set. */
  private async clearSeedUpvotes(botMemberUids: string[]): Promise<void> {
    if (botMemberUids.length === 0) return;
    await this.prisma.teamNewsUpvote.deleteMany({
      where: { memberUid: { in: botMemberUids } },
    });
  }

  private async applySeedUpvotes(
    rankedUids: string[],
    botMemberUids: string[]
  ): Promise<SeedTeamNewsTrendingResponse['ranked']> {
    const ranked: SeedTeamNewsTrendingResponse['ranked'] = [];
    for (let i = 0; i < rankedUids.length; i++) {
      const rank = i + 1;
      const newsItemUid = rankedUids[i];
      const likeCount = likesForRank(rank);
      const members = botMemberUids.slice(0, likeCount);
      await this.prisma.teamNewsUpvote.createMany({
        data: members.map((memberUid) => ({ newsItemUid, memberUid })),
        skipDuplicates: true,
      });
      ranked.push({ uid: newsItemUid, rank, upvoteCount: likeCount });
    }
    return ranked;
  }
}
