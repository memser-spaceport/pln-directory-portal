import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { JobOpeningStatus, Prisma } from '@prisma/client';
import { JobOpeningIngestItem, IngestJobOpeningsResponse } from './dto/ingest-job-openings.dto';

@Injectable()
export class JobOpeningsService {
  private readonly logger = new Logger(JobOpeningsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingestJobOpenings(items: JobOpeningIngestItem[]): Promise<IngestJobOpeningsResponse> {
    const result: IngestJobOpeningsResponse = {
      received: items.length,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
    };

    if (items.length === 0) {
      return result;
    }

    for (const item of items) {
      try {
        await this.upsertJobOpening(item);
        // Count as created or updated based on whether it existed
        const existing = await this.prisma.jobOpening.findUnique({
          where: { canonicalKey: item.canonicalKey },
          select: { id: true, createdAt: true },
        });

        // If created within last second, consider it newly created
        if (existing && existing.createdAt > new Date(Date.now() - 5000)) {
          result.created++;
        } else {
          result.updated++;
        }
      } catch (error) {
        this.logger.error(
          `Failed to ingest job opening with canonicalKey ${item.canonicalKey}: ${error.message}`,
          error.stack
        );
        result.failed++;
        result.errors?.push(`Failed to process ${item.canonicalKey}: ${error.message}`);
      }
    }

    return result;
  }

  private async upsertJobOpening(item: JobOpeningIngestItem): Promise<void> {
    const status = this.mapStatus(item.status);

    const data: Prisma.JobOpeningUncheckedCreateInput = {
      status,
      companyName: item.companyName,
      signalType: item.signalType,
      roleTitle: item.roleTitle,
      roleCategory: item.roleCategory ?? null,
      department: item.department ?? null,
      seniority: item.seniority ?? null,
      urgency: item.urgency ?? null,
      summary: item.summary ?? null,
      location: item.location ?? null,
      ws4AskId: item.ws4AskId ?? null,
      detectionDate: new Date(item.detectionDate),
      sourceType: item.sourceType ?? null,
      sourceLink: item.sourceLink ?? null,
      detectionMethod: item.detectionMethod ?? null,
      companyPriority: item.companyPriority ?? null,
      focusAreas: item.focusAreas ?? null,
      subFocusAreas: item.subFocusAreas ?? null,
      teamNotified: item.teamNotified ?? null,
      sourceDate: item.sourceDate ? new Date(item.sourceDate) : null,
      postedDate: item.postedDate ? new Date(item.postedDate) : null,
      lastSeenLive: item.lastSeenLive ? new Date(item.lastSeenLive) : null,
      signalId: item.signalId ?? null,
      canonicalKey: item.canonicalKey,
      teamUid: item.teamUid ?? null,
      needsReview: item.needsReview ?? null,
      notes: item.notes ?? null,
      portfolio: item.portfolio ?? null,
    };

    await this.prisma.jobOpening.upsert({
      where: { canonicalKey: item.canonicalKey },
      create: data,
      update: {
        status,
        sourceLink: data.sourceLink,
        summary: data.summary,
        lastSeenLive: data.lastSeenLive,
        detectionDate: data.detectionDate,
        updatedAt: new Date(),
      },
    });
  }

  private mapStatus(status: string): JobOpeningStatus {
    const statusMap: Record<string, JobOpeningStatus> = {
      New: JobOpeningStatus.NEW,
      Confirmed: JobOpeningStatus.CONFIRMED,
      'Routed to WS4': JobOpeningStatus.ROUTED_TO_WS4,
      Stale: JobOpeningStatus.STALE,
      'Closed - Duplicate': JobOpeningStatus.CLOSED_DUPLICATE,
      'Closed - Incorrect Signal': JobOpeningStatus.CLOSED_INCORRECT_SIGNAL,
      'Closed - Not a Hiring Signal': JobOpeningStatus.CLOSED_NOT_HIRING_SIGNAL,
      'Closed - Role Filled': JobOpeningStatus.CLOSED_ROLE_FILLED,
    };

    return statusMap[status] ?? JobOpeningStatus.NEW;
  }
}
