import { ConflictException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JobOpeningManagedBy, JobOpeningStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { JOB_INGEST_COMPLETED, JobIngestCompletedPayload } from '../job-alerts/job-alerts.events';
import { IntegrationKeyRequestContext, IntegrationKeysService } from '../integration-keys/integration-keys.service';
import { sanitizeJobDescriptionHtml } from './job-description-html.util';
import { resolvePublishedAt } from './job-opening-visibility';
import { toPublicPay } from './job-openings-public-role';
import { jobBoardDetailUrl } from './job-openings-url';
import {
  ExternalIdSchema,
  type IntegrationJobListItem,
  type IntegrationJobResponse,
  type PublishableJob,
  type PublishableJobState,
} from 'libs/contracts/src/schema/publishable-job';

export const INTEGRATION_SIGNAL_TYPE = 'integration';
export const INTEGRATION_SOURCE_TYPE = 'ATS Integration';

const STATE_TO_STATUS: Record<PublishableJobState, JobOpeningStatus> = {
  published: JobOpeningStatus.CONFIRMED,
  paused: JobOpeningStatus.STALE,
  closed: JobOpeningStatus.CLOSED_ROLE_FILLED,
};

/** Identity of a new integration row; claimed rows keep their own dedup key. */
export function integrationDedupKey(keyUid: string, externalId: string): string {
  return `integration:${keyUid}:${externalId}`;
}

/**
 * The status, closedAt and publishedAt patch for a publish-state change. Used by
 * both the upsert body's `state` and the state route so they cannot disagree.
 * Published clears closedAt; paused leaves it; closed sets it once.
 */
export function applyState(
  existing: { status: JobOpeningStatus; closedAt: Date | null } | null,
  state: PublishableJobState,
  now: Date
): { status: JobOpeningStatus; closedAt: Date | null; publishedAt?: Date | null } {
  const status = STATE_TO_STATUS[state];
  const publishedAt = resolvePublishedAt(existing?.status ?? null, status, now);
  const closedAt =
    state === 'closed' ? existing?.closedAt ?? now : state === 'published' ? null : existing?.closedAt ?? null;
  return { status, closedAt, ...(publishedAt !== undefined ? { publishedAt } : {}) };
}

const rowSelect = {
  uid: true,
  status: true,
  closedAt: true,
  publishedAt: true,
  dedupKey: true,
  roleTitle: true,
  teamUid: true,
  managedBy: true,
  integrationKeyUid: true,
  integrationExternalId: true,
  sourceLink: true,
} as const;

type Row = {
  uid: string;
  status: JobOpeningStatus;
  closedAt: Date | null;
  publishedAt: Date | null;
  dedupKey: string;
  roleTitle: string;
  teamUid: string | null;
  managedBy: JobOpeningManagedBy | null;
  integrationKeyUid: string | null;
  integrationExternalId: string | null;
  sourceLink: string | null;
};

function toResponse(row: Row, externalId: string): IntegrationJobResponse {
  return {
    uid: row.uid,
    externalId,
    dedupKey: row.dedupKey,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    boardUrl: jobBoardDetailUrl(row.uid),
  };
}

function parseExternalId(raw: string): string {
  const parsed = ExternalIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new UnprocessableEntityException('externalId must be 1 to 200 characters');
  }
  return parsed.data;
}

/**
 * Job openings written by an integrated system through a team-scoped key. Rows are
 * identified by (key, externalId); the body is the whole public record, so an
 * optional field absent from it is cleared. Every write emits the same
 * ingest-completed event the crawler does, so alert dispatch runs unchanged.
 */
@Injectable()
export class JobOpeningsIntegrationService {
  private readonly logger = new Logger(JobOpeningsIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly integrationKeys: IntegrationKeysService
  ) {}

  async upsertByExternalId(
    key: IntegrationKeyRequestContext,
    externalIdRaw: string,
    body: PublishableJob
  ): Promise<IntegrationJobResponse> {
    const externalId = parseExternalId(externalIdRaw);
    const descriptionHtml = sanitizeJobDescriptionHtml(body.descriptionHtml);
    if (!descriptionHtml) {
      throw new UnprocessableEntityException('descriptionHtml is empty after sanitisation');
    }

    const now = new Date();
    const existing = await this.findOwned(key, externalId);
    const stateFields = applyState(existing, body.state, now);
    const publicFields = {
      roleTitle: body.title,
      department: body.department ?? null,
      roleCategory: body.roleCategory ?? null,
      seniority: body.seniority ?? null,
      workMode: body.workMode ?? null,
      location: body.locations ?? [],
      summary: body.summary ?? null,
      descriptionHtml,
      postedDate: body.postedAt ? new Date(body.postedAt) : existing ? null : now,
      payMin: body.pay?.min ?? null,
      payMax: body.pay?.max ?? null,
      payCurrency: body.pay?.currency ?? null,
      payPeriod: body.pay?.period ?? null,
      equityNote: body.equityNote ?? null,
      lastSeenLive: now,
    };

    let row: Row;
    let created = 0;
    let updated = 0;
    if (existing) {
      row = await this.prisma.jobOpening.update({
        where: { uid: existing.uid },
        data: { ...publicFields, ...stateFields },
        select: rowSelect,
      });
      updated = 1;
    } else {
      const team = await this.prisma.team.findUnique({ where: { uid: key.teamUid }, select: { name: true } });
      if (!team) {
        throw new NotFoundException(`Team ${key.teamUid} not found`);
      }
      const dedupKey = integrationDedupKey(key.uid, externalId);
      row = await this.prisma.jobOpening.create({
        data: {
          ...publicFields,
          ...stateFields,
          publishedAt: stateFields.publishedAt ?? null,
          managedBy: JobOpeningManagedBy.INTEGRATION,
          integrationKeyUid: key.uid,
          integrationExternalId: externalId,
          teamUid: key.teamUid,
          companyName: team.name,
          signalType: INTEGRATION_SIGNAL_TYPE,
          sourceType: INTEGRATION_SOURCE_TYPE,
          sourceLink: null,
          canonicalKey: dedupKey,
          dedupKey,
          detectionDate: now,
          sourceDate: now,
        },
        select: rowSelect,
      });
      created = 1;
    }

    this.emitIngestCompleted(key, now, created, updated);
    return toResponse(row, externalId);
  }

  async setState(
    key: IntegrationKeyRequestContext,
    externalIdRaw: string,
    state: PublishableJobState
  ): Promise<IntegrationJobResponse> {
    const externalId = parseExternalId(externalIdRaw);
    const existing = await this.findOwned(key, externalId);
    if (!existing) {
      throw new NotFoundException(`No job opening with externalId ${externalId} for this integration`);
    }
    const now = new Date();
    const row = await this.prisma.jobOpening.update({
      where: { uid: existing.uid },
      data: { ...applyState(existing, state, now), lastSeenLive: now },
      select: rowSelect,
    });
    this.emitIngestCompleted(key, now, 0, 1);
    return toResponse(row, externalId);
  }

  /**
   * Adopts an existing row for the key's team. Only ownership fields change and the
   * external apply link is dropped; the dedup key, status and content stay as they are.
   */
  async claim(key: IntegrationKeyRequestContext, uid: string, externalIdRaw: string): Promise<IntegrationJobResponse> {
    const externalId = parseExternalId(externalIdRaw);
    const row = await this.prisma.jobOpening.findUnique({ where: { uid }, select: rowSelect });
    if (!row) {
      throw new NotFoundException(`Job opening ${uid} not found`);
    }
    this.integrationKeys.assertKeyOwnsTeam(key, row.teamUid);

    if (row.managedBy === JobOpeningManagedBy.INTEGRATION) {
      if (row.integrationKeyUid === key.uid) {
        return toResponse(row, row.integrationExternalId ?? externalId);
      }
      throw new ConflictException('Job opening is owned by another integration');
    }

    const clash = await this.findOwned(key, externalId);
    if (clash && clash.uid !== row.uid) {
      throw new ConflictException(`externalId ${externalId} is already used by job opening ${clash.uid}`);
    }

    const now = new Date();
    let claimed: Row;
    try {
      claimed = await this.prisma.jobOpening.update({
        where: { uid },
        data: {
          managedBy: JobOpeningManagedBy.INTEGRATION,
          integrationKeyUid: key.uid,
          integrationExternalId: externalId,
          sourceLink: null,
        },
        select: rowSelect,
      });
    } catch (error) {
      // A concurrent claim with the same external id can slip past the findOwned
      // check above and hit the (integrationKeyUid, integrationExternalId) unique
      // constraint; surface it as the same 409 the check would have raised.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`externalId ${externalId} is already used by another job opening of this key`);
      }
      throw error;
    }
    this.emitIngestCompleted(key, now, 0, 1);
    return toResponse(claimed, externalId);
  }

  /**
   * Every row of the key's team with its public fields, so an ATS can import a
   * board row as a draft role (adoption) without a second read.
   */
  async listForTeam(key: IntegrationKeyRequestContext): Promise<IntegrationJobListItem[]> {
    const rows = await this.prisma.jobOpening.findMany({
      where: { teamUid: key.teamUid },
      orderBy: { createdAt: 'desc' },
      select: {
        ...rowSelect,
        department: true,
        roleCategory: true,
        seniority: true,
        workMode: true,
        location: true,
        summary: true,
        descriptionHtml: true,
        postedDate: true,
        payMin: true,
        payMax: true,
        payCurrency: true,
        payPeriod: true,
        equityNote: true,
      },
    });
    return rows.map((row) => {
      const ownedByCaller = row.integrationKeyUid === key.uid;
      return {
        uid: row.uid,
        externalId: ownedByCaller ? row.integrationExternalId : null,
        ownedByCaller,
        managedBy: row.managedBy ?? null,
        status: row.status,
        dedupKey: row.dedupKey,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        closedAt: row.closedAt?.toISOString() ?? null,
        boardUrl: jobBoardDetailUrl(row.uid),
        title: row.roleTitle,
        department: row.department ?? null,
        roleCategory: row.roleCategory ?? null,
        seniority: row.seniority ?? null,
        workMode: row.workMode ?? null,
        locations: row.location ?? [],
        summary: row.summary ?? null,
        descriptionHtml: row.descriptionHtml ?? null,
        postedAt: row.postedDate?.toISOString() ?? null,
        applyUrl: row.sourceLink ?? null,
        pay: toPublicPay(row),
        equityNote: row.equityNote ?? null,
      };
    });
  }

  private findOwned(key: IntegrationKeyRequestContext, externalId: string): Promise<Row | null> {
    return this.prisma.jobOpening.findFirst({
      where: { integrationKeyUid: key.uid, integrationExternalId: externalId },
      select: rowSelect,
    });
  }

  private emitIngestCompleted(key: IntegrationKeyRequestContext, now: Date, created: number, updated: number): void {
    const payload: JobIngestCompletedPayload = {
      runId: `integration:${key.uid}:${now.getTime()}`,
      source: INTEGRATION_SIGNAL_TYPE,
      received: 1,
      created,
      updated,
      failed: 0,
      completedAt: now.toISOString(),
    };
    this.eventEmitter.emit(JOB_INGEST_COMPLETED, payload);
    this.logger.log(`integrationKey=${key.uid} job write created=${created} updated=${updated}`);
  }
}
