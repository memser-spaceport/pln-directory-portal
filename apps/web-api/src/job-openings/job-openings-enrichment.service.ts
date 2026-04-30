import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { DataDiscrepancyFlag } from '@prisma/client';
import {
  TeamsWithEnrichmentResponse,
  JobOpeningsPerTeamResponse,
  BatchUpdateEnrichmentResponse,
  UpdateTeamEnrichmentDto,
} from 'libs/contracts/src/schema/team-job-enrichment';

@Injectable()
export class JobOpeningsEnrichmentService {
  private readonly logger = new Logger(JobOpeningsEnrichmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getTeamsWithEnrichment(page = 1, limit = 100, priorityFilter?: number[]): Promise<TeamsWithEnrichmentResponse> {
    const skip = (page - 1) * limit;

    const priorities = priorityFilter?.length ? priorityFilter : [1, 2];
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
          linkedinHandler: true,
          teamFocusAreas: {
            include: {
              focusArea: true,
              ancestorArea: true,
            },
          },
          jobEnrichment: true,
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
          linkedinHandler: team.linkedinHandler ?? null,
          focusAreas: [...new Set(focusAreas)],
          subFocusAreas: [...new Set(subFocusAreas)],
          enrichment: team.jobEnrichment
            ? {
                uid: team.jobEnrichment.uid,
                teamUid: team.jobEnrichment.teamUid,
                careersPageUrl: team.jobEnrichment.careersPageUrl ?? null,
                openRolesCount: team.jobEnrichment.openRolesCount ?? null,
                lastEnrichmentDate: team.jobEnrichment.lastEnrichmentDate?.toISOString() ?? null,
                enrichmentSource: team.jobEnrichment.enrichmentSource ?? null,
                dataDiscrepancyFlag: team.jobEnrichment.dataDiscrepancyFlag ?? null,
                discrepancyDetails: team.jobEnrichment.discrepancyDetails ?? null,
                needsReview: team.jobEnrichment.needsReview,
                createdAt: team.jobEnrichment.createdAt.toISOString(),
                updatedAt: team.jobEnrichment.updatedAt.toISOString(),
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

  async getJobOpeningsByTeam(teamUid: string): Promise<JobOpeningsPerTeamResponse> {
    const team = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: { uid: true, name: true },
    });

    if (!team) {
      throw new NotFoundException(`Team with uid ${teamUid} not found`);
    }

    const jobOpenings = await this.prisma.jobOpening.findMany({
      where: { teamUid },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      teamUid: team.uid,
      teamName: team.name,
      jobOpenings: jobOpenings.map((job) => ({
        uid: job.uid,
        roleTitle: job.roleTitle,
        roleCategory: job.roleCategory ?? null,
        seniority: job.seniority ?? null,
        location: job.location ?? [],
        workMode: job.workMode ?? null,
        sourceLink: job.sourceLink ?? null,
        postedDate: job.postedDate?.toISOString() ?? null,
        status: job.status,
        detectionDate: job.detectionDate.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      })),
    };
  }

  async batchUpdateEnrichment(items: UpdateTeamEnrichmentDto[]): Promise<BatchUpdateEnrichmentResponse> {
    const result: BatchUpdateEnrichmentResponse = {
      received: items.length,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
    };

    for (const item of items) {
      try {
        const existing = await this.prisma.teamJobEnrichment.findUnique({
          where: { teamUid: item.teamUid },
        });

        const needsReview = item.dataDiscrepancyFlag ? true : item.needsReview ?? false;

        const data = {
          careersPageUrl: item.careersPageUrl ?? null,
          openRolesCount: item.openRolesCount ?? null,
          lastEnrichmentDate: item.lastEnrichmentDate ? new Date(item.lastEnrichmentDate) : null,
          enrichmentSource: item.enrichmentSource ?? null,
          dataDiscrepancyFlag: (item.dataDiscrepancyFlag as DataDiscrepancyFlag | null) ?? null,
          discrepancyDetails: item.discrepancyDetails ?? null,
          needsReview,
        };

        if (existing) {
          await this.prisma.teamJobEnrichment.update({
            where: { teamUid: item.teamUid },
            data,
          });
          result.updated++;
        } else {
          await this.prisma.teamJobEnrichment.create({
            data: { ...data, teamUid: item.teamUid },
          });
          result.created++;
        }
      } catch (error) {
        this.logger.error(`Failed to update enrichment for team ${item.teamUid}:`, error);
        result.failed++;
        result.errors?.push(`Failed to process ${item.teamUid}: ${error.message}`);
      }
    }

    return result;
  }
}
