import type { PrismaService } from '../shared/prisma.service';
import type { AwsService } from '../utils/aws/aws.service';
import type { JobOpeningsQueryService } from '../job-openings/job-openings-query.service';
import { JobAlertsDispatchService } from './job-alerts-dispatch.service';
import type { JobIngestCompletedPayload } from './job-alerts.events';

// p-limit ships ESM only; run the limited tasks inline.
jest.mock('p-limit', () => ({ __esModule: true, default: () => (fn: () => unknown) => fn() }));

/**
 * Dispatch is exercised at the event seam: the ingest-completed payload goes in, and
 * what comes out is whether a digest was sent and the alert cursor advanced. Matching
 * itself is delegated to `findNewMatchesSince`, so it is mocked here; the query
 * service spec covers that it matches on `publishedAt`.
 */
describe('JobAlertsDispatchService', () => {
  const alert = {
    uid: 'alert-1',
    memberUid: 'member-1',
    name: 'Engineering roles',
    filterState: { roleCategory: ['Engineering'] },
    lastSentAt: new Date('2026-02-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    member: { uid: 'member-1', email: 'member@example.com', name: 'Member', deletedAt: null },
  };

  const payload = (overrides: Partial<JobIngestCompletedPayload> = {}): JobIngestCompletedPayload => ({
    runId: 'run-1',
    source: 'crawler',
    received: 1,
    created: 1,
    updated: 0,
    failed: 0,
    completedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  });

  let prisma: {
    jobAlert: { findMany: jest.Mock; update: jest.Mock };
    jobAlertSendRun: { findMany: jest.Mock; create: jest.Mock };
  };
  let findNewMatchesSince: jest.Mock;
  let service: JobAlertsDispatchService;
  let sendDigestEmail: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      jobAlert: {
        findMany: jest.fn().mockResolvedValueOnce([alert]).mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      jobAlertSendRun: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    findNewMatchesSince = jest.fn();
    service = new JobAlertsDispatchService(
      prisma as unknown as PrismaService,
      { findNewMatchesSince } as unknown as JobOpeningsQueryService,
      {} as AwsService
    );
    sendDigestEmail = jest.spyOn(service as never, 'sendDigestEmail' as never).mockResolvedValue(undefined as never);
  });

  it('sends one digest and advances the alert cursor when a run has a new match', async () => {
    findNewMatchesSince.mockResolvedValue([{ uid: 'job-1', roleTitle: 'Engineer', location: [], team: null }]);

    const result = await service.onJobIngestCompleted(payload({ created: 1 }));

    expect(findNewMatchesSince).toHaveBeenCalledWith(
      expect.objectContaining({ roleCategory: ['Engineering'], page: 1, limit: 50, sort: 'newest' }),
      alert.lastSentAt
    );
    expect(sendDigestEmail).toHaveBeenCalledTimes(1);
    expect(sendDigestEmail).toHaveBeenCalledWith(
      expect.objectContaining({ alertUid: 'alert-1', memberEmail: 'member@example.com' })
    );
    expect(prisma.jobAlertSendRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ alertUid: 'alert-1', ingestRunId: 'run-1', matchCount: 1, emailType: 'digest' }),
    });
    expect(prisma.jobAlert.update).toHaveBeenCalledWith({
      where: { uid: 'alert-1' },
      data: { lastSentAt: expect.any(Date) },
    });
    expect(result).toBeUndefined();
  });

  it('uses the alert creation time as the cursor when it has never been sent', async () => {
    prisma.jobAlert.findMany
      .mockReset()
      .mockResolvedValueOnce([{ ...alert, lastSentAt: null }])
      .mockResolvedValue([]);
    findNewMatchesSince.mockResolvedValue([]);

    await service.onJobIngestCompleted(payload({ created: 1 }));

    expect(findNewMatchesSince).toHaveBeenCalledWith(expect.anything(), alert.createdAt);
  });

  it('sends nothing when the run produced no new matches for the alert', async () => {
    findNewMatchesSince.mockResolvedValue([]);

    await service.onJobIngestCompleted(payload({ updated: 1, created: 0 }));

    expect(findNewMatchesSince).toHaveBeenCalledTimes(1);
    expect(sendDigestEmail).not.toHaveBeenCalled();
    expect(prisma.jobAlertSendRun.create).not.toHaveBeenCalled();
    expect(prisma.jobAlert.update).not.toHaveBeenCalled();
  });

  it('does not dispatch at all when the run created and updated nothing', async () => {
    await service.onJobIngestCompleted(payload({ created: 0, updated: 0 }));

    expect(prisma.jobAlert.findMany).not.toHaveBeenCalled();
    expect(findNewMatchesSince).not.toHaveBeenCalled();
    expect(sendDigestEmail).not.toHaveBeenCalled();
  });

  it('does not send twice for the same run', async () => {
    prisma.jobAlertSendRun.findMany.mockResolvedValue([{ alertUid: 'alert-1' }]);
    findNewMatchesSince.mockResolvedValue([{ uid: 'job-1', roleTitle: 'Engineer', location: [], team: null }]);

    await service.onJobIngestCompleted(payload({ created: 1 }));

    expect(findNewMatchesSince).not.toHaveBeenCalled();
    expect(sendDigestEmail).not.toHaveBeenCalled();
  });
});
