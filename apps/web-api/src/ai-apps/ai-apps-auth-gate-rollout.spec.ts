jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  isAxiosError: jest.fn((error: any) => !!error?.isAxiosError),
}));
jest.mock('./ai-apps.constants', () => ({
  ...jest.requireActual('./ai-apps.constants'),
  AI_APPS_RUNNER_URL: 'https://runner.test',
  AI_APPS_RUNNER_TOKEN: 'runner-secret',
}));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import { ForbiddenException } from '@nestjs/common';
import axios from 'axios';
import { AiAppsAuthGateService } from './ai-apps-auth-gate.service';
import { AiAppsController } from './ai-apps.controller';
import { buildAppUrl } from './ai-apps.constants';

const mockedAxios = axios as jest.Mocked<typeof axios>;

const APPS = [
  { uid: 'app-1', appId: 'alpha', status: 'READY', lastDeployedAt: new Date() },
  { uid: 'app-2', appId: 'beta', status: 'READY', lastDeployedAt: new Date() },
  { uid: 'app-3', appId: 'gamma', status: 'DRAFT', lastDeployedAt: null },
];

function build({ statusOverride }: { statusOverride?: Record<string, string> } = {}) {
  const prisma: any = {
    aiApp: {
      findMany: jest.fn().mockResolvedValue(APPS),
      findUnique: jest.fn(async ({ where }) => {
        const app = APPS.find((a) => a.uid === where.uid);
        return app ? { ...app, status: statusOverride?.[app.uid] ?? app.status } : null;
      }),
      update: jest.fn(),
    },
    aiAppTarget: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    aiAppAuthGate: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    aiAppEvent: { create: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const aiAppsService = { isRequesterAdmin: jest.fn().mockResolvedValue(true) };
  const service = new AiAppsAuthGateService(prisma, aiAppsService as any);
  service.verifySettle = { timeoutMs: 0, intervalMs: 0 };
  return { service, prisma, aiAppsService };
}

/**
 * Probes answer like a healthy app; `after` overrides what the app answers once the gate is refreshed.
 * `switchOverProbes` answers that many probes with 502 right after the refresh, like the load balancer switch-over.
 */
function stubApp(opts: { gateVersion?: number | null; rootAfter?: number; switchOverProbes?: number } = {}) {
  let refreshed = false;
  let switchOver = opts.switchOverProbes ?? 0;
  mockedAxios.post.mockImplementation(async (url: string) => {
    if (url.endsWith('/auth-gate/refresh')) {
      refreshed = true;
      return { data: { release: 'alpha', previousRevision: 4, revision: 5, authGateVersion: 2 } };
    }
    return { data: {} };
  });
  mockedAxios.get.mockImplementation(async (url: string) => {
    if (refreshed && switchOver > 0) {
      switchOver -= 1;
      return { status: 502, data: '<html>502 Bad Gateway</html>' };
    }
    if (url.endsWith('/_pln/gate')) {
      return refreshed && opts.gateVersion !== null
        ? { status: 200, data: { version: opts.gateVersion ?? 2 } }
        : { status: 404, data: {} };
    }
    if (url.endsWith('/_health')) return { status: 200, data: '' };
    return { status: refreshed && opts.rootAfter ? opts.rootAfter : 401, data: '' };
  });
}

describe('AiAppsAuthGateService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls the orchestrator refresh/rollback routes with the runner token', async () => {
    const { service } = build();
    mockedAxios.post.mockResolvedValue({
      data: { release: 'alpha', previousRevision: 1, revision: 2, authGateVersion: 2 },
    });

    await service.refreshAuthGate('alpha', 'preview');
    await service.rollbackAuthGate('alpha', 'preview', 1);

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'https://runner.test/v1/apps/alpha/auth-gate/refresh',
      { target: 'preview' },
      expect.objectContaining({ headers: expect.objectContaining({ 'x-runner-token': 'runner-secret' }) })
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      'https://runner.test/v1/apps/alpha/auth-gate/rollback',
      { target: 'preview', toRevision: 1 },
      expect.anything()
    );
  });

  it('lists only deployed, non-draft targets below the current gate as eligible', async () => {
    const { service } = build();
    const fleet = await service.listFleet();
    expect(fleet.filter((t) => t.eligible).map((t) => t.appId)).toEqual(['alpha', 'beta']);
  });

  it('dry run lists what it would do and calls nothing', async () => {
    const { service } = build();
    const outcomes = await service.refreshBatch({ dryRun: true });
    expect(outcomes.map((o) => o.result)).toEqual(['dry_run', 'dry_run']);
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('refreshes, verifies and records the gate without touching the app row, events or updatedAt', async () => {
    const { service, prisma } = build();
    stubApp();

    const [outcome] = await service.refreshBatch({ appUids: ['app-1'] });

    expect(outcome).toEqual(expect.objectContaining({ appId: 'alpha', result: 'refreshed' }));
    expect(prisma.aiAppAuthGate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { appUid_environment: { appUid: 'app-1', environment: 'prod' } },
        update: expect.objectContaining({ version: 2, previousRevision: 4, lastError: null }),
      })
    );
    const sql = prisma.$executeRaw.mock.calls[0][0].join('?');
    expect(sql).toContain('UPDATE "AiApp" SET "directLinkGateReady" = true, "publicPathsGateReady" = true');
    expect(sql).not.toContain('updatedAt');
    expect(prisma.aiApp.update).not.toHaveBeenCalled();
    expect(prisma.aiAppEvent.create).not.toHaveBeenCalled();
  });

  it.each([
    ['the gate does not report the new version', { gateVersion: null }],
    ['the unauthenticated / answer changes', { rootAfter: 500 }],
  ])('rolls back to the previous revision when %s', async (_label, opts) => {
    const { service, prisma } = build();
    stubApp(opts);

    const [outcome] = await service.refreshBatch({ appUids: ['app-1'] });

    expect(outcome.result).toBe('rolled_back');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://runner.test/v1/apps/alpha/auth-gate/rollback',
      { target: 'prod', toRevision: 4 },
      expect.anything()
    );
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.aiAppAuthGate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ lastError: expect.stringContaining('rolled back') }),
      })
    );
  });

  it('waits through the load-balancer switch-over before judging the refresh', async () => {
    const { service, prisma } = build();
    service.verifySettle = { timeoutMs: 5_000, intervalMs: 1 };
    stubApp({ switchOverProbes: 4 });

    const [outcome] = await service.refreshBatch({ appUids: ['app-1'] });

    expect(outcome.result).toBe('refreshed');
    expect(mockedAxios.post).not.toHaveBeenCalledWith(
      expect.stringContaining('/auth-gate/rollback'),
      expect.anything(),
      expect.anything()
    );
    expect(prisma.aiAppAuthGate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ version: 2, lastError: null }) })
    );
  });

  it('rolls back when the target is still failing after the settle window', async () => {
    const { service } = build();
    service.verifySettle = { timeoutMs: 20, intervalMs: 5 };
    stubApp({ switchOverProbes: 10_000 });

    const [outcome] = await service.refreshBatch({ appUids: ['app-1'] });

    expect(outcome).toEqual(
      expect.objectContaining({ result: 'rolled_back', detail: expect.stringContaining('/_health 502') })
    );
  });

  it('stops the batch once failures reach maxFailures', async () => {
    const { service } = build();
    stubApp({ gateVersion: null });

    const outcomes = await service.refreshBatch({ maxFailures: 1 });

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].result).toBe('rolled_back');
  });

  it('skips a target whose release no longer exists (404) without counting a failure', async () => {
    const { service } = build();
    mockedAxios.get.mockResolvedValue({ status: 401, data: '' });
    mockedAxios.post.mockRejectedValue({ response: { status: 404, data: { error: 'release_not_found' } } });

    const outcomes = await service.refreshBatch({ maxFailures: 1 });

    expect(outcomes.map((o) => o.result)).toEqual(['skipped', 'skipped']);
  });

  it('skipped targets do not use up the batch, so the next target is still refreshed', async () => {
    const { service } = build();
    stubApp();
    const refreshPost = mockedAxios.post.getMockImplementation()!;
    mockedAxios.post.mockImplementation(async (url: string, ...rest: any[]) => {
      if (url.includes('/apps/alpha/auth-gate/refresh')) {
        throw { response: { status: 404, data: { error: 'release_not_found' } } };
      }
      return refreshPost(url, ...rest);
    });

    const outcomes = await service.refreshBatch({ batchSize: 1, maxFailures: 1 });

    expect(outcomes.map((o) => [o.appId, o.result])).toEqual([
      ['alpha', 'skipped'],
      ['beta', 'refreshed'],
    ]);
  });

  it('batchSize caps the targets actually refreshed', async () => {
    const { service } = build();
    stubApp();

    const outcomes = await service.refreshBatch({ batchSize: 1 });

    expect(outcomes.map((o) => [o.appId, o.result])).toEqual([['alpha', 'refreshed']]);
  });

  it('skips an app that started deploying after the list was built', async () => {
    const { service } = build({ statusOverride: { 'app-1': 'DEPLOYING' } });
    stubApp();

    const [outcome] = await service.refreshBatch({ appUids: ['app-1'] });

    expect(outcome).toEqual(expect.objectContaining({ result: 'skipped', detail: 'status DEPLOYING' }));
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('probes the target’s own host', async () => {
    const { service } = build();
    stubApp();
    await service.refreshBatch({ appUids: ['app-1'] });
    expect(mockedAxios.get).toHaveBeenCalledWith(`${buildAppUrl('alpha', 'prod')}/_pln/gate`, expect.anything());
  });
});

describe('auth-gate admin routes', () => {
  it.each([
    ['listAuthGates', (c: AiAppsController, req: any) => c.listAuthGates(req)],
    ['refreshAuthGates', (c: AiAppsController, req: any) => c.refreshAuthGates({ dryRun: true } as any, req)],
    [
      'rollbackAuthGate',
      (c: AiAppsController, req: any) => c.rollbackAuthGate('app-1', { target: 'prod' } as any, req),
    ],
  ])('%s: 403 for a non-admin', async (_name, call) => {
    const authGateService = {
      isDirectoryAdmin: jest.fn().mockResolvedValue(false),
      listFleet: jest.fn(),
      refreshBatch: jest.fn(),
      rollbackOne: jest.fn(),
    };
    const controller = new AiAppsController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      authGateService as any
    );
    await expect(call(controller, { memberUid: 'm-1' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(authGateService.listFleet).not.toHaveBeenCalled();
    expect(authGateService.refreshBatch).not.toHaveBeenCalled();
    expect(authGateService.rollbackOne).not.toHaveBeenCalled();
  });
});
