import { Injectable } from '@nestjs/common';
import {
  FeedbackLinearIssue,
  FeedbackLinearSource,
  FeedbackLinearStatus,
  FeedbackLinearTargetState,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../shared/prisma.service';

/** How long a claimed row stays reserved for the worker that claimed it. */
export const FEEDBACK_LINEAR_LEASE_MS = 2 * 60_000;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 60 * 60_000;
const LAST_ERROR_MAX_LENGTH = 1000;

export interface FeedbackLinearEnqueueInput {
  sourceType: FeedbackLinearSource;
  sourceUid: string;
  teamId: string;
  projectId?: string | null;
}

/** What a push has done in Linear so far; saved whether or not the row is then marked synced. */
export interface FeedbackLinearProgress {
  identifier?: string;
  url?: string;
  appliedState?: FeedbackLinearTargetState;
  intakeStateId?: string;
  /** The pending comment was posted (or dropped). */
  commentDone?: boolean;
}

/** Delay before the next attempt after `attempts` failed ones: 30 s doubling, capped at 1 h. */
export function feedbackLinearBackoffMs(attempts: number): number {
  const exponent = Math.max(attempts - 1, 0);
  return Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_CAP_MS);
}

/**
 * The `FeedbackLinearIssue` outbox: one row per feedback item to push to
 * Linear. Rows are claimed with a conditional update plus a lease, so several
 * API instances never work the same row at once.
 */
@Injectable()
export class FeedbackLinearOutboxService {
  constructor(private readonly prisma: PrismaService) {}

  /** Records an item to push. A second enqueue of the same item is a no-op. */
  async enqueue(input: FeedbackLinearEnqueueInput): Promise<void> {
    try {
      await this.prisma.feedbackLinearIssue.create({
        data: {
          sourceType: input.sourceType,
          sourceUid: input.sourceUid,
          teamId: input.teamId,
          projectId: input.projectId ?? null,
          linearIssueId: randomUUID(),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return;
      }
      throw error;
    }
  }

  /** Claims up to `limit` due rows. Rows another worker claimed first are skipped. */
  async claimDue(limit: number, now = new Date()): Promise<FeedbackLinearIssue[]> {
    const due = this.dueWhere(now);
    const candidates = await this.prisma.feedbackLinearIssue.findMany({
      where: due,
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    const leaseUntil = new Date(now.getTime() + FEEDBACK_LINEAR_LEASE_MS);
    const claimed: number[] = [];
    for (const { id } of candidates) {
      const result = await this.prisma.feedbackLinearIssue.updateMany({
        where: { id, ...due },
        data: { leaseUntil },
      });
      if (result.count === 1) claimed.push(id);
    }
    if (claimed.length === 0) return [];
    return this.prisma.feedbackLinearIssue.findMany({ where: { id: { in: claimed } }, orderBy: { id: 'asc' } });
  }

  /**
   * Asks for the item's issue to end up in `targetState`, optionally posting a
   * LabOS comment. Bumps the version and makes the row due now, so the worker
   * applies it next, after creating the issue if needed. No row (the item was
   * never pushed) is a no-op; returns whether a row was found.
   */
  async requestState(
    sourceType: FeedbackLinearSource,
    sourceUid: string,
    targetState: FeedbackLinearTargetState,
    comment?: { uid: string },
    now = new Date()
  ): Promise<boolean> {
    const result = await this.prisma.feedbackLinearIssue.updateMany({
      where: { sourceType, sourceUid, status: { not: FeedbackLinearStatus.SKIPPED } },
      data: {
        targetState,
        version: { increment: 1 },
        status: FeedbackLinearStatus.PENDING,
        attempts: 0,
        nextAttemptAt: now,
        ...(comment ? { pendingCommentUid: comment.uid, pendingCommentId: randomUUID() } : {}),
      },
    });
    return result.count > 0;
  }

  /** Stores what a push has done so far; unconditional, so a newer request never loses the issue reference. */
  async saveProgress(row: FeedbackLinearIssue, progress: FeedbackLinearProgress): Promise<void> {
    const data = this.progressData(progress);
    if (Object.keys(data).length === 0) return;
    await this.prisma.feedbackLinearIssue.update({ where: { id: row.id }, data });
  }

  /**
   * Marks the row SYNCED only if no change was requested since it was claimed
   * (same version); otherwise it stays PENDING for the next tick. The lease is
   * released either way.
   */
  async markSynced(row: FeedbackLinearIssue, progress: FeedbackLinearProgress = {}): Promise<void> {
    await this.prisma.feedbackLinearIssue.updateMany({
      where: { id: row.id, version: row.version },
      data: { status: FeedbackLinearStatus.SYNCED, attempts: row.attempts + 1, lastError: null },
    });
    await this.prisma.feedbackLinearIssue.update({
      where: { id: row.id },
      data: { ...this.progressData(progress), leaseUntil: null },
    });
  }

  /** Ends a row whose item was deleted before its issue was created. */
  async markSkipped(row: FeedbackLinearIssue): Promise<void> {
    await this.prisma.feedbackLinearIssue.updateMany({
      where: { id: row.id, version: row.version },
      data: { status: FeedbackLinearStatus.SKIPPED, leaseUntil: null, lastError: null },
    });
    await this.releaseLease(row);
  }

  /**
   * Records a failed attempt: back to PENDING with backoff, or FAILED once
   * `maxAttempts` is reached. A `retryAfterMs` later than the backoff wins.
   * Returns null, leaving the row alone, when a newer change request arrived
   * meanwhile (it reset the attempts).
   */
  async markFailedAttempt(
    row: FeedbackLinearIssue,
    error: string,
    maxAttempts: number,
    retryAfterMs: number | null = null,
    now = new Date()
  ): Promise<FeedbackLinearStatus | null> {
    const attempts = row.attempts + 1;
    const lastError = error.slice(0, LAST_ERROR_MAX_LENGTH);
    const failed = attempts >= maxAttempts;
    const delay = Math.max(feedbackLinearBackoffMs(attempts), retryAfterMs ?? 0);
    const result = await this.prisma.feedbackLinearIssue.updateMany({
      where: { id: row.id, version: row.version },
      data: failed
        ? { status: FeedbackLinearStatus.FAILED, attempts, lastError, leaseUntil: null }
        : {
            status: FeedbackLinearStatus.PENDING,
            attempts,
            lastError,
            leaseUntil: null,
            nextAttemptAt: new Date(now.getTime() + delay),
          },
    });
    if (result.count === 0) {
      await this.releaseLease(row);
      return null;
    }
    return failed ? FeedbackLinearStatus.FAILED : FeedbackLinearStatus.PENDING;
  }

  private async releaseLease(row: FeedbackLinearIssue): Promise<void> {
    await this.prisma.feedbackLinearIssue.update({ where: { id: row.id }, data: { leaseUntil: null } });
  }

  private progressData(progress: FeedbackLinearProgress): Prisma.FeedbackLinearIssueUpdateInput {
    return {
      ...(progress.identifier !== undefined ? { identifier: progress.identifier } : {}),
      ...(progress.url !== undefined ? { url: progress.url } : {}),
      ...(progress.appliedState !== undefined ? { appliedState: progress.appliedState } : {}),
      ...(progress.intakeStateId !== undefined ? { intakeStateId: progress.intakeStateId } : {}),
      ...(progress.commentDone ? { pendingCommentUid: null, pendingCommentId: null } : {}),
    };
  }

  private dueWhere(now: Date): Prisma.FeedbackLinearIssueWhereInput {
    return {
      status: FeedbackLinearStatus.PENDING,
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    };
  }
}
