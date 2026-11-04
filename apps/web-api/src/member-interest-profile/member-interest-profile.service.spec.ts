import { ConflictException } from '@nestjs/common';
import { MemberInterestProfileService } from './member-interest-profile.service';

describe('MemberInterestProfileService run claim (LAB-3122)', () => {
  function build({ running = null as unknown, doneToday = null as unknown } = {}) {
    const run = {
      findFirst: jest.fn(async ({ where }: { where: { status: string } }) =>
        where.status === 'RUNNING' ? running : doneToday
      ),
      updateMany: jest.fn(async () => ({ count: 0 })),
      create: jest.fn(async () => ({ id: 42 })),
      update: jest.fn(async () => ({})),
    };
    const tx = { $queryRaw: jest.fn(async () => [{}]), memberInterestProfileRun: run };
    const prisma = {
      $transaction: jest.fn(async (arg: unknown) => (typeof arg === 'function' ? arg(tx) : arg)),
      memberInterestProfileRun: run,
      focusArea: { findMany: jest.fn(async () => []) },
      member: { findMany: jest.fn(async () => []) },
      memberInterestProfileEntry: { deleteMany: jest.fn(async () => ({ count: 0 })), createMany: jest.fn() },
    };
    const analytics = { trackEvent: jest.fn(async () => undefined) };
    return {
      service: new MemberInterestProfileService(prisma as never, analytics as never),
      prisma,
      run,
      tx,
      analytics,
    };
  }

  it('claims under the advisory lock and creates a RUNNING row', async () => {
    const { service, run, tx } = build();

    await expect(service.claimRun('CRON')).resolves.toBe(42);
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(run.create).toHaveBeenCalledWith({ data: { trigger: 'CRON', status: 'RUNNING' }, select: { id: true } });
  });

  it('refuses while a non-stale rebuild is RUNNING', async () => {
    const { service, run } = build({ running: { id: 1 } });

    await expect(service.claimRun('ADMIN')).resolves.toBeNull();
    expect(run.create).not.toHaveBeenCalled();
    const where = (run.findFirst.mock.calls[0] as unknown as [{ where: { startedAt: { gt: Date } } }])[0].where;
    expect(Date.now() - where.startedAt.gt.getTime()).toBeGreaterThanOrEqual(3 * 60 * 60 * 1000 - 1000);
  });

  it('skips a cron run when a cron rebuild already finished today, but lets an admin run', async () => {
    const cron = build({ doneToday: { id: 7 } });
    await expect(cron.service.claimRun('CRON')).resolves.toBeNull();

    const admin = build({ doneToday: { id: 7 } });
    await expect(admin.service.claimRun('ADMIN')).resolves.toBe(42);
  });

  it('marks stale RUNNING rows FAILED when it claims', async () => {
    const { service, run } = build();

    await service.claimRun('ADMIN');
    expect(run.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'RUNNING' }, data: expect.objectContaining({ status: 'FAILED' }) })
    );
  });

  it('admin trigger answers 409 when the claim is taken', async () => {
    const { service } = build({ running: { id: 1 } });

    await expect(service.startAdminRebuild()).rejects.toBeInstanceOf(ConflictException);
  });

  it('a finished run is marked DONE and sends member-interest-profile-computed', async () => {
    const { service, run, analytics } = build();

    const result = await service.rebuild('CRON');

    expect(result).toEqual(expect.objectContaining({ runId: 42, membersCount: 0, nonEmptyCount: 0 }));
    expect(run.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 42 }, data: expect.objectContaining({ status: 'DONE' }) })
    );
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'member-interest-profile-computed',
        properties: expect.objectContaining({ membersCount: 0, nonEmptyCount: 0 }),
      })
    );
  });

  it('a failed run is marked FAILED and rethrows', async () => {
    const { service, prisma, run, analytics } = build();
    prisma.focusArea.findMany.mockRejectedValue(new Error('db down'));

    await expect(service.rebuild('CRON')).rejects.toThrow('db down');
    expect(run.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', error: 'db down' }) })
    );
    expect(analytics.trackEvent).not.toHaveBeenCalled();
  });
});
