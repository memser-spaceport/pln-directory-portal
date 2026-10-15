import { Injectable } from '@nestjs/common';
import { FeedbackLinearIssue, FeedbackLinearSource, FeedbackLinearStatus, Prisma } from '@prisma/client';
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

  async markSynced(row: FeedbackLinearIssue, issue: { identifier: string; url: string }): Promise<void> {
    await this.prisma.feedbackLinearIssue.update({
      where: { id: row.id },
      data: {
        status: FeedbackLinearStatus.SYNCED,
        attempts: row.attempts + 1,
        identifier: issue.identifier,
        url: issue.url,
        leaseUntil: null,
        lastError: null,
      },
    });
  }

  /**
   * Records a failed attempt: back to PENDING with backoff, or FAILED once
   * `maxAttempts` is reached. A `retryAfterMs` later than the backoff wins.
   */
  async markFailedAttempt(
    row: FeedbackLinearIssue,
    error: string,
    maxAttempts: number,
    retryAfterMs: number | null = null,
    now = new Date()
  ): Promise<FeedbackLinearStatus> {
    const attempts = row.attempts + 1;
    const lastError = error.slice(0, LAST_ERROR_MAX_LENGTH);
    if (attempts >= maxAttempts) {
      await this.prisma.feedbackLinearIssue.update({
        where: { id: row.id },
        data: { status: FeedbackLinearStatus.FAILED, attempts, lastError, leaseUntil: null },
      });
      return FeedbackLinearStatus.FAILED;
    }
    const delay = Math.max(feedbackLinearBackoffMs(attempts), retryAfterMs ?? 0);
    await this.prisma.feedbackLinearIssue.update({
      where: { id: row.id },
      data: {
        status: FeedbackLinearStatus.PENDING,
        attempts,
        lastError,
        leaseUntil: null,
        nextAttemptAt: new Date(now.getTime() + delay),
      },
    });
    return FeedbackLinearStatus.PENDING;
  }

  private dueWhere(now: Date): Prisma.FeedbackLinearIssueWhereInput {
    return {
      status: FeedbackLinearStatus.PENDING,
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    };
  }
}
