import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NewsDiscoveryOutcome } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import {
  BatchUpdateTeamNewsEnrichmentResponse,
  TeamNewsPerTeamResponse,
  TeamsWithNewsEnrichmentResponse,
  UpdateTeamNewsEnrichmentDto,
} from 'libs/contracts/src/schema/team-news';

@Injectable()
export class TeamNewsEnrichmentService {
  private readonly logger = new Logger(TeamNewsEnrichmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getTeamsWithEnrichment(
    page = 1,
    limit = 100,
    priorityFilter?: number[]
  ): Promise<TeamsWithNewsEnrichmentResponse> {
    const skip = (page - 1) * limit;
    const priorities = priorityFilter?.length ? priorityFilter : [1, 2, 3, 4, 5];
    const where = { priority: { in: priorities } };

    const [teams, total] = await Promise.all([
      this.prisma.team.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          uid: true,
          name: true,
          priority: true,
          website: true,
          twitterHandler: true,
          linkedinHandler: true,
          teamFocusAreas: { include: { focusArea: true, ancestorArea: true } },
          newsEnrichment: true,
        },
      }),
      this.prisma.team.count({ where }),
    ]);

    return {
      teams: teams.map((team) => {
        const focusAreas: string[] = [];
        const subFocusAreas: string[] = [];
        for (const tfa of team.teamFocusAreas) {
          if (tfa.focusArea.parentUid) {
            subFocusAreas.push(tfa.focusArea.title);
          } else {
            focusAreas.push(tfa.ancestorArea.title);
          }
        }

        return {
          uid: team.uid,
          name: team.name,
          priority: team.priority === 99 ? null : team.priority,
          website: team.website ?? null,
          twitterHandler: team.twitterHandler ?? null,
          linkedinHandler: team.linkedinHandler ?? null,
          focusAreas: [...new Set(focusAreas)],
          subFocusAreas: [...new Set(subFocusAreas)],
          enrichment: team.newsEnrichment
            ? {
                uid: team.newsEnrichment.uid,
                teamUid: team.newsEnrichment.teamUid,
                lastDiscoveryAt: team.newsEnrichment.lastDiscoveryAt?.toISOString() ?? null,
                lastDiscoveryOutcome: team.newsEnrichment.lastDiscoveryOutcome ?? null,
                recentNewsCount: team.newsEnrichment.recentNewsCount,
                enrichmentSource: team.newsEnrichment.enrichmentSource ?? null,
                createdAt: team.newsEnrichment.createdAt.toISOString(),
                updatedAt: team.newsEnrichment.updatedAt.toISOString(),
              }
            : null,
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getTeamNewsByTeam(teamUid: string): Promise<TeamNewsPerTeamResponse> {
    const team = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: { uid: true, name: true },
    });

    if (!team) {
      throw new NotFoundException(`Team with uid ${teamUid} not found`);
    }

    const items = await this.prisma.teamNewsItem.findMany({
      where: { teamUid },
      orderBy: { eventDate: 'desc' },
      include: {
        team: {
          select: {
            name: true,
            logo: { select: { url: true } },
            teamFocusAreas: { include: { focusArea: true, ancestorArea: true } },
          },
        },
      },
    });

    return {
      teamUid: team.uid,
      teamName: team.name,
      items: items.map((item) => {
        const focusAreas: string[] = [];
        const subFocusAreas: string[] = [];
        for (const tfa of item.team.teamFocusAreas) {
          if (tfa.focusArea.parentUid) {
            subFocusAreas.push(tfa.focusArea.title);
          } else {
            focusAreas.push(tfa.ancestorArea.title);
          }
        }
        return {
          uid: item.uid,
          teamUid: item.teamUid,
          teamName: item.team.name,
          teamLogoUrl: item.team.logo?.url ?? null,
          eventType: item.eventType,
          eventDate: item.eventDate.toISOString(),
          title: item.title,
          summary: item.summary,
          sourceUrl: item.sourceUrl,
          sourceDomain: item.sourceDomain,
          tags: item.tags,
          focusAreas: [...new Set(focusAreas)],
          subFocusAreas: [...new Set(subFocusAreas)],
          createdAt: item.createdAt.toISOString(),
          // The service-side per-team endpoint does not surface forum-link
          // counts; consumers that need them should use the public list APIs.
          discussion: { count: 0, latestTopicUrl: null },
          // Service-to-service endpoint: no member context, so never "followed".
          isFollowed: false,
          upvoteCount: 0,
          viewerHasUpvoted: false,
        };
      }),
    };
  }

  async batchUpdateEnrichment(items: UpdateTeamNewsEnrichmentDto[]): Promise<BatchUpdateTeamNewsEnrichmentResponse> {
    const result: BatchUpdateTeamNewsEnrichmentResponse = {
      received: items.length,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
    };

    for (const item of items) {
      try {
        const existing = await this.prisma.teamNewsEnrichment.findUnique({
          where: { teamUid: item.teamUid },
        });

        const data = {
          lastDiscoveryAt: item.lastDiscoveryAt ? new Date(item.lastDiscoveryAt) : null,
          lastDiscoveryOutcome: (item.lastDiscoveryOutcome as NewsDiscoveryOutcome | null) ?? null,
          enrichmentSource: item.enrichmentSource ?? null,
        };

        if (existing) {
          await this.prisma.teamNewsEnrichment.update({
            where: { teamUid: item.teamUid },
            data,
          });
          result.updated++;
        } else {
          await this.prisma.teamNewsEnrichment.create({
            data: { ...data, teamUid: item.teamUid },
          });
          result.created++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to update enrichment for team ${item.teamUid}: ${message}`);
        result.failed++;
        result.errors?.push(`teamUid=${item.teamUid}: ${message}`);
      }
    }

    return result;
  }
}
