import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { PrismaService } from '../shared/prisma.service';
import { JobOpeningManagedBy, JobOpeningStatus, Prisma } from '@prisma/client';
import { JobOpeningIngestItem, IngestJobOpeningsResponse } from './dto/ingest-job-openings.dto';
import { JOB_INGEST_COMPLETED, JobIngestCompletedPayload } from '../job-alerts/job-alerts.events';
import { sanitizeJobDescriptionHtml } from './job-description-html.util';
import { HIDDEN_JOB_OPENING_STATUSES } from './job-openings-query.service';

type SkipReason = 'owned-by-integration' | 'owned-by-manual';

type UpsertOutcome = { outcome: 'created' | 'updated' } | { outcome: 'skipped'; reason: SkipReason };

/** A row is visible on the board when its status is outside the hidden set. */
function isVisibleStatus(status: JobOpeningStatus | null | undefined): boolean {
  return status != null && !HIDDEN_JOB_OPENING_STATUSES.includes(status);
}

@Injectable()
export class JobOpeningsService {
  private readonly logger = new Logger(JobOpeningsService.name);

  constructor(private readonly prisma: PrismaService, private readonly eventEmitter: EventEmitter2) {}

  async ingestJobOpenings(
    items: JobOpeningIngestItem[],
    meta?: { runId?: string | null; source?: string | null }
  ): Promise<IngestJobOpeningsResponse> {
    const result: IngestJobOpeningsResponse = {
      received: items.length,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      skippedReasons: [],
    };

    if (items.length === 0) {
      return result;
    }

    for (const item of items) {
      try {
        if (item.managedBy !== undefined && item.managedBy !== JobOpeningManagedBy.ENRICHMENT) {
          throw new Error(
            `managedBy must be ${JobOpeningManagedBy.ENRICHMENT} on this endpoint, got ${item.managedBy}`
          );
        }
        const upserted = await this.upsertJobOpening(item);
        if (upserted.outcome === 'skipped') {
          result.skipped++;
          result.skippedReasons.push(`${upserted.reason}: ${item.dedupKey}`);
        } else {
          result[upserted.outcome]++;
        }
      } catch (error) {
        this.logger.error(
          `Failed to ingest job opening with dedupKey ${item.dedupKey} (canonicalKey: ${item.canonicalKey}): ${error.message}`,
          error.stack
        );
        result.failed++;
        result.errors?.push(`Failed to process ${item.dedupKey}: ${error.message}`);
      }
    }

    const eventPayload: JobIngestCompletedPayload = {
      runId: meta?.runId || randomUUID(),
      source: meta?.source ?? null,
      received: result.received,
      created: result.created,
      updated: result.updated,
      failed: result.failed,
      completedAt: new Date().toISOString(),
    };
    this.eventEmitter.emit(JOB_INGEST_COMPLETED, eventPayload);

    return result;
  }

  private resolveIngestLocations(item: JobOpeningIngestItem): string[] {
    if (item.locations?.length) {
      return item.locations;
    }
    return Array.isArray(item.location) ? item.location : item.location ? [item.location] : [];
  }

  private isClosedStatus(status: JobOpeningStatus, rawStatus: string): boolean {
    if (status.startsWith('CLOSED_')) {
      return true;
    }
    return status === JobOpeningStatus.STALE && rawStatus === 'Closed';
  }

  private resolveClosedAt(
    item: JobOpeningIngestItem,
    status: JobOpeningStatus,
    existing?: { closedAt: Date | null } | null
  ): Date | null | undefined {
    if (item.closedAt) {
      return new Date(item.closedAt);
    }
    if (!this.isClosedStatus(status, item.status)) {
      return undefined;
    }
    if (existing?.closedAt) {
      return existing.closedAt;
    }
    return new Date();
  }

  /**
   * Stamp rule for `publishedAt`: set when a row is created visible, and when an
   * update takes it from hidden to visible. `undefined` means "leave as is".
   */
  private resolvePublishedAt(
    existing: { status: JobOpeningStatus } | null,
    resolvedStatus: JobOpeningStatus,
    now: Date
  ): Date | null | undefined {
    if (!existing) {
      return isVisibleStatus(resolvedStatus) ? now : null;
    }
    if (!isVisibleStatus(existing.status) && isVisibleStatus(resolvedStatus)) {
      return now;
    }
    return undefined;
  }

  private async upsertJobOpening(item: JobOpeningIngestItem): Promise<UpsertOutcome> {
    const existing = await this.prisma.jobOpening.findUnique({
      where: { dedupKey: item.dedupKey },
      select: { status: true, closedAt: true, managedBy: true, publishedAt: true },
    });

    if (existing?.managedBy && existing.managedBy !== JobOpeningManagedBy.ENRICHMENT) {
      return {
        outcome: 'skipped',
        reason: existing.managedBy === JobOpeningManagedBy.INTEGRATION ? 'owned-by-integration' : 'owned-by-manual',
      };
    }

    const mappedStatus = this.mapStatus(item.status);
    const status = mappedStatus ?? JobOpeningStatus.NEW;
    const location = this.resolveIngestLocations(item);
    const closedAt = this.resolveClosedAt(item, status, existing);
    const descriptionHtml = sanitizeJobDescriptionHtml(item.descriptionHtml);
    const now = new Date();
    // An unknown incoming status keeps the stored one on update, so it is never a transition.
    const resolvedStatus = existing ? mappedStatus ?? existing.status : status;
    const publishedAt = this.resolvePublishedAt(existing, resolvedStatus, now);

    const data: Prisma.JobOpeningUncheckedCreateInput = {
      status,
      managedBy: JobOpeningManagedBy.ENRICHMENT,
      publishedAt: publishedAt ?? null,
      companyName: item.companyName,
      signalType: item.signalType,
      roleTitle: item.roleTitle,
      roleCategory: item.roleCategory ?? null,
      department: item.department ?? null,
      seniority: item.seniority ?? null,
      urgency: item.urgency ?? null,
      summary: item.summary ?? null,
      descriptionHtml,
      location,
      workMode: item.workMode ?? null,
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
      dedupKey: item.dedupKey,
      teamUid: item.teamUid ?? null,
      needsReview: item.needsReview ?? null,
      notes: item.notes ?? null,
      portfolio: item.portfolio ?? null,
      closedAt: closedAt ?? null,
    };

    await this.prisma.jobOpening.upsert({
      where: { dedupKey: item.dedupKey },
      create: data,
      update: {
        sourceLink: data.sourceLink,
        canonicalKey: data.canonicalKey,
        location: data.location,
        lastSeenLive: data.lastSeenLive,
        detectionDate: data.detectionDate,
        ...(existing?.managedBy == null ? { managedBy: JobOpeningManagedBy.ENRICHMENT } : {}),
        ...(publishedAt !== undefined ? { publishedAt } : {}),
        ...(mappedStatus ? { status: mappedStatus } : {}),
        ...(item.roleTitle !== undefined ? { roleTitle: data.roleTitle } : {}),
        ...(item.roleCategory !== undefined ? { roleCategory: data.roleCategory } : {}),
        ...(item.seniority !== undefined ? { seniority: data.seniority } : {}),
        ...(item.department !== undefined ? { department: data.department } : {}),
        ...(item.postedDate !== undefined ? { postedDate: data.postedDate } : {}),
        ...(item.teamUid !== undefined ? { teamUid: data.teamUid } : {}),
        ...(item.sourceType !== undefined ? { sourceType: data.sourceType } : {}),
        ...(item.summary !== undefined ? { summary: data.summary } : {}),
        ...(item.workMode !== undefined ? { workMode: data.workMode } : {}),
        ...(descriptionHtml ? { descriptionHtml } : {}),
        ...(closedAt !== undefined ? { closedAt } : {}),
        updatedAt: now,
      },
    });

    return { outcome: existing ? 'updated' : 'created' };
  }

  private mapStatus(status: string): JobOpeningStatus | undefined {
    const statusMap: Record<string, JobOpeningStatus> = {
      New: JobOpeningStatus.NEW,
      NEW: JobOpeningStatus.NEW,
      Confirmed: JobOpeningStatus.CONFIRMED,
      CONFIRMED: JobOpeningStatus.CONFIRMED,
      'Routed to WS4': JobOpeningStatus.ROUTED_TO_WS4,
      ROUTED_TO_WS4: JobOpeningStatus.ROUTED_TO_WS4,
      Stale: JobOpeningStatus.STALE,
      STALE: JobOpeningStatus.STALE,
      Closed: JobOpeningStatus.STALE,
      'Closed - Duplicate': JobOpeningStatus.CLOSED_DUPLICATE,
      CLOSED_DUPLICATE: JobOpeningStatus.CLOSED_DUPLICATE,
      'Closed - Incorrect Signal': JobOpeningStatus.CLOSED_INCORRECT_SIGNAL,
      CLOSED_INCORRECT_SIGNAL: JobOpeningStatus.CLOSED_INCORRECT_SIGNAL,
      'Closed - Not a Hiring Signal': JobOpeningStatus.CLOSED_NOT_HIRING_SIGNAL,
      CLOSED_NOT_HIRING_SIGNAL: JobOpeningStatus.CLOSED_NOT_HIRING_SIGNAL,
      'Closed - Role Filled': JobOpeningStatus.CLOSED_ROLE_FILLED,
      CLOSED_ROLE_FILLED: JobOpeningStatus.CLOSED_ROLE_FILLED,
    };

    return statusMap[status];
  }
}
