import { FeedbackLinearIssue, FeedbackLinearStatus, Prisma } from '@prisma/client';
import {
  FEEDBACK_LINEAR_LEASE_MS,
  FeedbackLinearOutboxService,
  feedbackLinearBackoffMs,
} from './feedback-linear-outbox.service';

describe('FeedbackLinearOutboxService', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  let prisma: {
    feedbackLinearIssue: {
      create: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: FeedbackLinearOutboxService;

  function row(overrides: Partial<FeedbackLinearIssue> = {}): FeedbackLinearIssue {
    return {
      id: 1,
      uid: 'u1',
      sourceType: 'CONTACT_SUPPORT',
      sourceUid: 's1',
      teamId: 't1',
      projectId: null,
      linearIssueId: 'lid',
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: now,
      leaseUntil: null,
      identifier: null,
      url: null,
      lastError: null,
      targetState: 'INTAKE',
      appliedState: null,
      intakeStateId: null,
      pendingCommentUid: null,
      pendingCommentId: null,
      version: 0,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      feedbackLinearIssue: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    service = new FeedbackLinearOutboxService(prisma as never);
  });

  describe('backoff', () => {
    it.each([
      [1, 30_000],
      [2, 60_000],
      [3, 120_000],
      [4, 240_000],
      [5, 480_000],
      [6, 960_000],
      [7, 1_920_000],
      [8, 3_600_000],
      [12, 3_600_000],
    ])('after %i failed attempts waits %i ms', (attempts, ms) => {
      expect(feedbackLinearBackoffMs(attempts)).toBe(ms);
    });
  });

  describe('enqueue', () => {
    it('creates a row with a generated UUID issue id', async () => {
      await service.enqueue({ sourceType: 'CONTACT_SUPPORT', sourceUid: 's1', teamId: 't1', projectId: 'p1' });
      const { data } = prisma.feedbackLinearIssue.create.mock.calls[0][0];
      expect(data).toMatchObject({ sourceType: 'CONTACT_SUPPORT', sourceUid: 's1', teamId: 't1', projectId: 'p1' });
      expect(data.linearIssueId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('ignores a duplicate enqueue of the same item', async () => {
      prisma.feedbackLinearIssue.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', 'P2002', 'x')
      );
      await expect(
        service.enqueue({ sourceType: 'CONTACT_SUPPORT', sourceUid: 's1', teamId: 't1' })
      ).resolves.toBeUndefined();
    });

    it('rethrows other errors', async () => {
      prisma.feedbackLinearIssue.create.mockRejectedValue(new Error('db down'));
      await expect(service.enqueue({ sourceType: 'CONTACT_SUPPORT', sourceUid: 's1', teamId: 't1' })).rejects.toThrow(
        'db down'
      );
    });
  });

  describe('claimDue', () => {
    it('claims due rows with a lease and skips rows another worker won', async () => {
      prisma.feedbackLinearIssue.findMany
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
        .mockResolvedValueOnce([row({ id: 1 })]);
      prisma.feedbackLinearIssue.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

      const claimed = await service.claimDue(10, now);

      expect(claimed.map((r) => r.id)).toEqual([1]);
      const [first] = prisma.feedbackLinearIssue.updateMany.mock.calls;
      expect(first[0].where).toMatchObject({
        id: 1,
        status: FeedbackLinearStatus.PENDING,
        nextAttemptAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      });
      expect(first[0].data.leaseUntil).toEqual(new Date(now.getTime() + FEEDBACK_LINEAR_LEASE_MS));
      expect(prisma.feedbackLinearIssue.findMany.mock.calls[1][0].where).toEqual({ id: { in: [1] } });
    });

    it('returns nothing and skips the reload when no row was claimed', async () => {
      prisma.feedbackLinearIssue.findMany.mockResolvedValueOnce([{ id: 1 }]);
      prisma.feedbackLinearIssue.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.claimDue(10, now)).resolves.toEqual([]);
      expect(prisma.feedbackLinearIssue.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('requestState', () => {
    it('bumps the version and makes the row due now, without touching the lease', async () => {
      prisma.feedbackLinearIssue.updateMany.mockResolvedValue({ count: 1 });
      await expect(service.requestState('AI_APP_FEEDBACK', 'f1', 'COMPLETED', undefined, now)).resolves.toBe(true);
      const { where, data } = prisma.feedbackLinearIssue.updateMany.mock.calls[0][0];
      expect(where).toEqual({ sourceType: 'AI_APP_FEEDBACK', sourceUid: 'f1', status: { not: 'SKIPPED' } });
      expect(data).toEqual({
        targetState: 'COMPLETED',
        version: { increment: 1 },
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: now,
      });
      expect(data).not.toHaveProperty('leaseUntil');
    });

    it('records a pending comment with a fresh comment id', async () => {
      prisma.feedbackLinearIssue.updateMany.mockResolvedValue({ count: 1 });
      await service.requestState('AI_APP_FEEDBACK', 'f1', 'COMPLETED', { uid: 'c1' }, now);
      const { data } = prisma.feedbackLinearIssue.updateMany.mock.calls[0][0];
      expect(data.pendingCommentUid).toBe('c1');
      expect(data.pendingCommentId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('is a no-op for an item that was never pushed', async () => {
      prisma.feedbackLinearIssue.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.requestState('AI_APP_FEEDBACK', 'f1', 'CANCELED')).resolves.toBe(false);
    });
  });

  describe('saveProgress', () => {
    it('stores only the fields given and clears a posted comment', async () => {
      await service.saveProgress(row(), { appliedState: 'COMPLETED', commentDone: true });
      expect(prisma.feedbackLinearIssue.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { appliedState: 'COMPLETED', pendingCommentUid: null, pendingCommentId: null },
      });
    });

    it('writes nothing when there is no progress', async () => {
      await service.saveProgress(row(), {});
      expect(prisma.feedbackLinearIssue.update).not.toHaveBeenCalled();
    });
  });

  describe('markSynced', () => {
    it('marks SYNCED only for the claimed version, then stores progress and releases the lease', async () => {
      prisma.feedbackLinearIssue.updateMany.mockResolvedValue({ count: 1 });
      await service.markSynced(row({ attempts: 2, version: 3 }), { identifier: 'LAB-1', url: 'https://linear.app/x' });
      expect(prisma.feedbackLinearIssue.updateMany).toHaveBeenCalledWith({
        where: { id: 1, version: 3 },
        data: { status: 'SYNCED', attempts: 3, lastError: null },
      });
      expect(prisma.feedbackLinearIssue.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { identifier: 'LAB-1', url: 'https://linear.app/x', leaseUntil: null },
      });
    });

    it('still stores progress when a newer request changed the version (row stays PENDING)', async () => {
      prisma.feedbackLinearIssue.updateMany.mockResolvedValue({ count: 0 });
      await service.markSynced(row(), { identifier: 'LAB-1', url: 'u', appliedState: 'INTAKE' });
      expect(prisma.feedbackLinearIssue.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { identifier: 'LAB-1', url: 'u', appliedState: 'INTAKE', leaseUntil: null },
      });
    });
  });

  it('marks a row SKIPPED for its version and releases the lease', async () => {
    prisma.feedbackLinearIssue.updateMany.mockResolvedValue({ count: 1 });
    await service.markSkipped(row({ version: 2 }));
    expect(prisma.feedbackLinearIssue.updateMany).toHaveBeenCalledWith({
      where: { id: 1, version: 2 },
      data: { status: 'SKIPPED', leaseUntil: null, lastError: null },
    });
    expect(prisma.feedbackLinearIssue.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { leaseUntil: null } });
  });

  describe('markFailedAttempt', () => {
    beforeEach(() => {
      prisma.feedbackLinearIssue.updateMany.mockResolvedValue({ count: 1 });
    });

    it('reschedules with backoff while attempts remain', async () => {
      const status = await service.markFailedAttempt(row({ attempts: 0 }), 'boom', 8, null, now);
      expect(status).toBe('PENDING');
      expect(prisma.feedbackLinearIssue.updateMany.mock.calls[0][0]).toEqual({
        where: { id: 1, version: 0 },
        data: {
          status: 'PENDING',
          attempts: 1,
          lastError: 'boom',
          leaseUntil: null,
          nextAttemptAt: new Date(now.getTime() + 30_000),
        },
      });
    });

    it('uses a Retry-After later than the backoff', async () => {
      await service.markFailedAttempt(row({ attempts: 0 }), 'rate limited', 8, 120_000, now);
      expect(prisma.feedbackLinearIssue.updateMany.mock.calls[0][0].data.nextAttemptAt).toEqual(
        new Date(now.getTime() + 120_000)
      );
    });

    it('keeps the backoff when Retry-After is shorter', async () => {
      await service.markFailedAttempt(row({ attempts: 2 }), 'rate limited', 8, 1_000, now);
      expect(prisma.feedbackLinearIssue.updateMany.mock.calls[0][0].data.nextAttemptAt).toEqual(
        new Date(now.getTime() + 120_000)
      );
    });

    it('marks FAILED on the last attempt', async () => {
      const status = await service.markFailedAttempt(row({ attempts: 7 }), 'still down', 8, null, now);
      expect(status).toBe('FAILED');
      expect(prisma.feedbackLinearIssue.updateMany.mock.calls[0][0].data).toEqual({
        status: 'FAILED',
        attempts: 8,
        lastError: 'still down',
        leaseUntil: null,
      });
    });

    it('truncates long errors to 1000 characters', async () => {
      await service.markFailedAttempt(row(), 'x'.repeat(5000), 8, null, now);
      expect(prisma.feedbackLinearIssue.updateMany.mock.calls[0][0].data.lastError).toHaveLength(1000);
    });

    it('never overwrites a newer request with a failure', async () => {
      prisma.feedbackLinearIssue.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.markFailedAttempt(row({ attempts: 7 }), 'down', 8, null, now)).resolves.toBeNull();
      expect(prisma.feedbackLinearIssue.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { leaseUntil: null } });
    });
  });
});
