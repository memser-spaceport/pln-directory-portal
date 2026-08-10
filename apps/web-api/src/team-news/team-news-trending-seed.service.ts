import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { SeedTeamNewsTrendingDto, SeedTeamNewsTrendingResponse } from 'libs/contracts/src/schema/team-news';
import { PrismaService } from '../shared/prisma.service';
import { AiProviderService } from '../shared/ai-provider.service';
import { PROTOCOL_LABS_TEAM_UID, TEAM_NEWS_EXCLUDED_TEAM_NAMES } from './team-news-public-list.config';
import {
  clampTrendingLimit,
  EDITORIAL_RANK_LIMIT,
  enforceDisjoint,
  forceIncludeProtocolLabs,
  likesForRank,
  TRENDING_LIKED_LIMIT,
  TRENDING_SEED_BOT_COUNT,
  TRENDING_SEED_EXTERNAL_ID_PREFIX,
} from './team-news-trending-seed.util';

const POPULAR_WINDOW_DAYS = 14;
const PROVIDER_ENV_VAR = 'TEAM_NEWS_TRENDING_AI_PROVIDER';

const LlmRankingSchema = z.object({
  likedUids: z.array(z.string()).max(TRENDING_LIKED_LIMIT),
  editorialUids: z.array(z.string()).max(EDITORIAL_RANK_LIMIT),
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

type LlmPickResult = {
  likedUids: string[];
  editorialUids: string[];
};

@Injectable()
export class TeamNewsTrendingSeedService {
  private readonly logger = new Logger(TeamNewsTrendingSeedService.name);

  constructor(private readonly prisma: PrismaService, private readonly aiProvider: AiProviderService) {}

  async seedTrending(dto: SeedTeamNewsTrendingDto): Promise<SeedTeamNewsTrendingResponse> {
    const createdAfter = new Date(dto.createdAfter);
    if (Number.isNaN(createdAfter.getTime())) {
      throw new BadRequestException('createdAfter must be a valid ISO datetime');
    }
    const likedLimit = clampTrendingLimit(dto.limit);

    const candidates = await this.loadCandidates(createdAfter);
    if (candidates.length === 0) {
      this.logger.log(`seed-trending: no candidates after ${dto.createdAfter}; skipping`);
      return { ranked: [], editorial: [], protocolLabsIncluded: false, candidateCount: 0 };
    }

    const plCandidate =
      candidates.find((c) => c.teamUid === PROTOCOL_LABS_TEAM_UID) ??
      (await this.loadNewestProtocolLabsInPopularWindow());

    const pool = [...candidates];
    if (plCandidate && !pool.some((c) => c.uid === plCandidate.uid)) {
      pool.push(plCandidate);
    }

    const { likedUids: llmLiked, editorialUids: llmEditorial } = await this.rankWithLlm(
      pool,
      likedLimit,
      EDITORIAL_RANK_LIMIT
    );

    const known = new Set(pool.map((c) => c.uid));
    let editorialUids = this.sanitizeUids(llmEditorial, known, EDITORIAL_RANK_LIMIT);
    let likedUids = enforceDisjoint(this.sanitizeUids(llmLiked, known, likedLimit), editorialUids);

    editorialUids = this.padFromPool(editorialUids, pool, EDITORIAL_RANK_LIMIT, new Set(likedUids));
    likedUids = this.padFromPool(likedUids, pool, likedLimit, new Set(editorialUids));

    const plUidInPool = plCandidate?.uid ?? null;
    // Force-include PL on the liked list only when it is not already editorial.
    const plForLiked = plUidInPool && !editorialUids.includes(plUidInPool) ? plUidInPool : null;
    likedUids = forceIncludeProtocolLabs(likedUids, plForLiked, likedLimit);
    likedUids = enforceDisjoint(likedUids, editorialUids);
    likedUids = this.padFromPool(likedUids, pool, likedLimit, new Set(editorialUids));

    const botMemberUids = await this.ensureSeedBotMembers();
    await this.clearSeedUpvotes(botMemberUids);
    await this.clearEditorialRanks();
    const editorial = await this.applyEditorialRanks(editorialUids);
    const ranked = await this.applySeedUpvotes(likedUids, botMemberUids);

    const protocolLabsIncluded = likedUids.some((uid) => {
      const row = pool.find((c) => c.uid === uid);
      return row?.teamUid === PROTOCOL_LABS_TEAM_UID;
    });

    this.logger.log(
      `seed-trending: candidates=${pool.length} liked=${ranked.length} editorial=${editorial.length} protocolLabsIncluded=${protocolLabsIncluded}`
    );

    return { ranked, editorial, protocolLabsIncluded, candidateCount: pool.length };
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

  private async rankWithLlm(
    candidates: CandidateRow[],
    likedLimit: number,
    editorialLimit: number
  ): Promise<LlmPickResult> {
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

    const editorialTarget = Math.min(editorialLimit, candidates.length);
    const likedTarget = Math.min(likedLimit, Math.max(0, candidates.length - editorialTarget));

    try {
      const { object } = await generateObject({
        model: this.aiProvider.getResponsesModel(PROVIDER_ENV_VAR, { useSearchGrounding: false }),
        schema: LlmRankingSchema,
        system: `You curate team news for a Protocol Labs Network home page with two distinct surfaces.

1) editorialUids (${editorialTarget}): the most important / newsworthy items for the "Top stories" band — editorial significance, not popularity. Ordered best-first (rank 1 = lead story).

2) likedUids (${likedTarget}): items for "Popular this week" — interesting / engaging stories that deserve synthetic community interest. Prefer diversity of teams and event types. When a Protocol Labs item is present and not already in editorialUids, include it somewhere in likedUids (not necessarily #1).

HARD RULE: likedUids and editorialUids must be disjoint — no UID in both lists. Editorial importance ≠ popularity; do not put the same story on both lists.
Return only UIDs from the provided catalog.`,
        prompt: `Catalog (JSON):\n${JSON.stringify(
          catalog,
          null,
          2
        )}\n\nReturn editorialUids with up to ${editorialTarget} UIDs and likedUids with up to ${likedTarget} UIDs. Sets must be disjoint.`,
        temperature: 0.4,
      });

      return {
        likedUids: object.likedUids ?? [],
        editorialUids: object.editorialUids ?? [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`seed-trending: LLM ranking failed: ${message}`);
      return { likedUids: [], editorialUids: [] };
    }
  }

  private sanitizeUids(uids: string[], known: Set<string>, limit: number): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const uid of uids) {
      if (!known.has(uid) || seen.has(uid)) continue;
      seen.add(uid);
      out.push(uid);
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Pad short lists from pool by eventDate desc, skipping reserved UIDs. */
  private padFromPool(uids: string[], pool: CandidateRow[], limit: number, reserved: Set<string>): string[] {
    if (uids.length >= limit) return uids.slice(0, limit);
    const used = new Set([...uids, ...reserved]);
    const sorted = pool.slice().sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime());
    const next = [...uids];
    for (const c of sorted) {
      if (used.has(c.uid)) continue;
      next.push(c.uid);
      used.add(c.uid);
      if (next.length >= limit) break;
    }
    return next.slice(0, limit);
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

  /** Clear all editorial ranks so each seed run fully replaces Top Stories. */
  private async clearEditorialRanks(): Promise<void> {
    await this.prisma.teamNewsItem.updateMany({
      where: { editorialRank: { not: null } },
      data: { editorialRank: null },
    });
  }

  private async applyEditorialRanks(editorialUids: string[]): Promise<SeedTeamNewsTrendingResponse['editorial']> {
    const editorial: SeedTeamNewsTrendingResponse['editorial'] = [];
    for (let i = 0; i < editorialUids.length; i++) {
      const rank = i + 1;
      const uid = editorialUids[i];
      await this.prisma.teamNewsItem.update({
        where: { uid },
        data: { editorialRank: rank },
      });
      editorial.push({ uid, rank });
    }
    return editorial;
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
