import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NetworkOverviewStatus, Prisma } from '@prisma/client';
import { generateObject } from 'ai';
import { z } from 'zod';
import type {
  GenerateNetworkOverviewDto,
  GenerateNetworkOverviewResponse,
  NetworkOverviewDto,
  NetworkOverviewStory,
} from 'libs/contracts/src/schema/network-overview';
import { PrismaService } from '../shared/prisma.service';
import { AiProviderService } from '../shared/ai-provider.service';
import { JobOpeningsQueryService } from '../job-openings/job-openings-query.service';
import { TEAM_NEWS_EXCLUDED_TEAM_NAMES } from '../team-news/team-news-public-list.config';
import { fetchOgImageUrl } from './og-image';

const PROVIDER_ENV_VAR = 'NETWORK_OVERVIEW_AI_PROVIDER';
const NEWS_CANDIDATE_LIMIT = 40;
const DEFAULT_WINDOW_DAYS = 14;

const LlmStorySchema = z.object({
  headline: z.string().min(1),
  detail: z.string().min(1),
  sourceTag: z.string().min(1),
  newsItemUid: z.string().optional(),
});

const LlmOverviewSchema = z.object({
  featuredNewsItemUid: z.string().min(1),
  leadParagraph: z.string().min(1),
  topStories: z.array(LlmStorySchema).min(1).max(4),
  generalUpdates: z.array(LlmStorySchema).min(1).max(4),
});

type NewsCandidate = {
  uid: string;
  title: string;
  summary: string | null;
  sourceUrl: string;
  sourceDomain: string | null;
  eventDate: Date;
  teamUid: string;
  team: {
    name: string;
    logo: { url: string } | null;
  };
};

@Injectable()
export class NetworkOverviewService {
  private readonly logger = new Logger(NetworkOverviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService,
    private readonly jobOpeningsQuery: JobOpeningsQueryService
  ) {}

  async getLatest(): Promise<NetworkOverviewDto> {
    const row = await this.prisma.networkOverview.findFirst({
      where: { status: NetworkOverviewStatus.READY },
      orderBy: { generatedAt: 'desc' },
    });

    if (!row) {
      throw new NotFoundException('No network overview available');
    }

    return this.toDto(row);
  }

  async generate(dto: GenerateNetworkOverviewDto): Promise<GenerateNetworkOverviewResponse> {
    const windowDays = dto.windowDays ?? DEFAULT_WINDOW_DAYS;
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const modelName = this.aiProvider.getModelName(PROVIDER_ENV_VAR);

    const news = await this.loadNewsCandidates(periodStart);
    if (news.length === 0) {
      this.logger.log(`network-overview: no news in windowDays=${windowDays}; skipping (prior READY kept)`);
      return {
        uid: null,
        generatedAt: periodEnd.toISOString(),
        status: 'SKIPPED',
      };
    }

    const jobsCatalog = await this.loadJobsCatalog(windowDays);
    const knownUids = new Set(news.map((n) => n.uid));

    try {
      const object = await this.generateWithLlm(news, jobsCatalog, windowDays);
      const featuredUid = knownUids.has(object.featuredNewsItemUid) ? object.featuredNewsItemUid : news[0].uid;
      const featured = news.find((n) => n.uid === featuredUid) ?? news[0];

      const topStories = this.sanitizeStories(object.topStories, knownUids);
      const generalUpdates = this.sanitizeStories(object.generalUpdates, knownUids);

      const ogImage = await fetchOgImageUrl(featured.sourceUrl);
      const featuredImageUrl = ogImage || featured.team.logo?.url || null;

      const row = await this.prisma.networkOverview.create({
        data: {
          windowDays,
          periodStart,
          periodEnd,
          featuredNewsItemUid: featured.uid,
          featuredTitle: featured.title,
          featuredSummary: featured.summary,
          featuredImageUrl,
          featuredSourceUrl: featured.sourceUrl,
          featuredTeamName: featured.team.name,
          leadParagraph: object.leadParagraph.trim(),
          topStories: topStories as unknown as Prisma.InputJsonValue,
          generalUpdates: generalUpdates as unknown as Prisma.InputJsonValue,
          model: modelName,
          sourceRunId: dto.runId ?? null,
          rawPayload: object as unknown as Prisma.InputJsonValue,
          status: NetworkOverviewStatus.READY,
        },
      });

      this.logger.log(
        `network-overview: READY uid=${row.uid} featured=${featured.uid} news=${news.length} jobs=${jobsCatalog.length}`
      );

      return {
        uid: row.uid,
        generatedAt: row.generatedAt.toISOString(),
        status: 'READY',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`network-overview: generation failed: ${message}`);

      const failed = await this.prisma.networkOverview.create({
        data: {
          windowDays,
          periodStart,
          periodEnd,
          leadParagraph: '',
          topStories: [],
          generalUpdates: [],
          model: modelName,
          sourceRunId: dto.runId ?? null,
          status: NetworkOverviewStatus.FAILED,
          errorMessage: message.slice(0, 2000),
        },
      });

      return {
        uid: failed.uid,
        generatedAt: failed.generatedAt.toISOString(),
        status: 'FAILED',
      };
    }
  }

  private excludedTeamWhere() {
    return {
      OR: TEAM_NEWS_EXCLUDED_TEAM_NAMES.map((name) => ({
        team: { name: { equals: name, mode: 'insensitive' as const } },
      })),
    };
  }

  private async loadNewsCandidates(periodStart: Date): Promise<NewsCandidate[]> {
    return this.prisma.teamNewsItem.findMany({
      where: {
        eventDate: { gte: periodStart },
        NOT: this.excludedTeamWhere(),
      },
      select: {
        uid: true,
        title: true,
        summary: true,
        sourceUrl: true,
        sourceDomain: true,
        eventDate: true,
        teamUid: true,
        team: {
          select: {
            name: true,
            logo: { select: { url: true } },
          },
        },
      },
      orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
      take: NEWS_CANDIDATE_LIMIT,
    });
  }

  private async loadJobsCatalog(
    windowDays: number
  ): Promise<Array<{ teamName: string; roleTitle: string; location: string[]; workMode: string | null }>> {
    try {
      const list = await this.jobOpeningsQuery.listJobOpenings({
        roleCategory: [],
        seniority: [],
        focus: [],
        location: [],
        workMode: [],
        sort: 'newest',
        windowDays,
        page: 1,
        limit: 50,
      });

      const rows: Array<{
        teamName: string;
        roleTitle: string;
        location: string[];
        workMode: string | null;
      }> = [];

      for (const group of list.groups) {
        for (const role of group.roles) {
          rows.push({
            teamName: group.team.name,
            roleTitle: role.roleTitle,
            location: role.location,
            workMode: role.workMode,
          });
        }
      }
      return rows.slice(0, 40);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`network-overview: jobs load failed (continuing without jobs): ${message}`);
      return [];
    }
  }

  private async generateWithLlm(
    news: NewsCandidate[],
    jobs: Array<{ teamName: string; roleTitle: string; location: string[]; workMode: string | null }>,
    windowDays: number
  ) {
    const newsCatalog = news.map((n) => ({
      uid: n.uid,
      teamName: n.team.name,
      title: n.title,
      summary: n.summary,
      sourceDomain: n.sourceDomain,
      eventDate: n.eventDate.toISOString(),
    }));

    const { object } = await generateObject({
      model: this.aiProvider.getResponsesModel(PROVIDER_ENV_VAR, {
        useSearchGrounding: false,
      }),
      schema: LlmOverviewSchema,
      system: `You write a Protocol Labs Network home-feed overview in a Perplexity digest style for the last ${windowDays} days.

Rules:
- Pick exactly one featuredNewsItemUid from the news catalog (most important / interesting story).
- leadParagraph: one short synthesis paragraph (2–4 sentences). Start with a clear bottom-line takeaway.
- topStories: 3 or 4 items when enough news exists (at least 1). Each has a bold-style headline (short sentence), a detail sentence, and sourceTag (short domain-like label, e.g. "filecoin", "protocol").
- generalUpdates: 3 or 4 items when enough material exists (at least 1), same shape. You may weave in hiring/job signals from the jobs catalog when relevant.
- Prefer diversity of teams. Only use newsItemUid values from the catalog when referencing a story.
- Be factual and concise. No marketing fluff.`,
      prompt: `News catalog (JSON):\n${JSON.stringify(
        newsCatalog,
        null,
        2
      )}\n\nRecent job openings (JSON):\n${JSON.stringify(jobs, null, 2)}\n\nProduce the overview object.`,
      temperature: 0.4,
    });

    return object;
  }

  private sanitizeStories(stories: z.infer<typeof LlmStorySchema>[], knownUids: Set<string>): NetworkOverviewStory[] {
    return stories.slice(0, 4).map((story) => ({
      headline: story.headline.trim(),
      detail: story.detail.trim(),
      sourceTag: story.sourceTag.trim().slice(0, 40),
      ...(story.newsItemUid && knownUids.has(story.newsItemUid) ? { newsItemUid: story.newsItemUid } : {}),
    }));
  }

  private toDto(row: {
    uid: string;
    generatedAt: Date;
    windowDays: number;
    periodStart: Date;
    periodEnd: Date;
    featuredNewsItemUid: string | null;
    featuredTitle: string | null;
    featuredSummary: string | null;
    featuredImageUrl: string | null;
    featuredSourceUrl: string | null;
    featuredTeamName: string | null;
    leadParagraph: string;
    topStories: Prisma.JsonValue;
    generalUpdates: Prisma.JsonValue;
  }): NetworkOverviewDto {
    return {
      uid: row.uid,
      generatedAt: row.generatedAt.toISOString(),
      windowDays: row.windowDays,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      featured: {
        newsItemUid: row.featuredNewsItemUid,
        title: row.featuredTitle,
        summary: row.featuredSummary,
        imageUrl: row.featuredImageUrl,
        sourceUrl: row.featuredSourceUrl,
        teamName: row.featuredTeamName,
      },
      leadParagraph: row.leadParagraph,
      topStories: this.parseStories(row.topStories),
      generalUpdates: this.parseStories(row.generalUpdates),
    };
  }

  private parseStories(value: Prisma.JsonValue): NetworkOverviewStory[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        if (typeof row.headline !== 'string' || typeof row.detail !== 'string' || typeof row.sourceTag !== 'string') {
          return null;
        }
        return {
          headline: row.headline,
          detail: row.detail,
          sourceTag: row.sourceTag,
          ...(typeof row.newsItemUid === 'string' ? { newsItemUid: row.newsItemUid } : {}),
        };
      })
      .filter((item): item is NetworkOverviewStory => item !== null);
  }
}
