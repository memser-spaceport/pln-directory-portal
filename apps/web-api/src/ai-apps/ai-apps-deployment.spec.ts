/// <reference types="multer" />

// axios ships ESM (not in the jest transform allowlist); the deploy paths under
// test call it, so mock the calls themselves.
jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  isAxiosError: jest.fn((error: any) => !!error?.isAxiosError),
}));

// The constants module reads env vars at import time; pin the bucket, and make
// the post-timeout liveness verification instant (one failing attempt) so the
// "timeout, app never came up" classification path runs in milliseconds.
jest.mock('./ai-apps.constants', () => ({
  ...jest.requireActual('./ai-apps.constants'),
  AI_APPS_S3_BUCKET: 'test-bucket',
  AI_APPS_VERIFY_ATTEMPTS: 1,
  AI_APPS_VERIFY_INTERVAL_MS: 0,
}));

// The real module pulls in a transitive chain that breaks under ts-jest (an
// ESM-only nestjs-zod import); mock it like roadmap.service.spec.ts does.
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));

import axios from 'axios';
import { AiAppsService } from './ai-apps.service';
import { AI_APPS_DEPLOY_STUCK_MS } from './ai-apps.constants';

const mockedAxios = axios as jest.Mocked<typeof axios>;

const LAST_SHIP = new Date('2026-07-01T00:00:00.000Z');

const APP = {
  uid: 'app-1',
  memberUid: 'creator-1',
  appId: 'demo',
  name: 'Demo',
  status: 'READY',
  notes: null as string | null,
  s3Key: 'apps/demo/d1/app.zip',
  deploymentId: 'd1',
  requiredEnvVars: [] as string[],
  providedEnvVars: [] as string[],
  lastDeployedAt: LAST_SHIP as Date | null,
  failureStream: null as string | null,
  updatedAt: new Date(),
};

function buildService(app: Record<string, any> | null = APP) {
  const prisma = {
    aiApp: {
      findUnique: jest.fn().mockResolvedValue(app),
      // Cross-member appId claim check — no other member holds the appId by default.
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue(app ? [app] : []),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...APP, ...app, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    aiAppEvent: { create: jest.fn().mockResolvedValue({}) },
    member: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  const aws = { uploadFileToS3: jest.fn().mockResolvedValue(undefined) };
  const pushNotifications = { create: jest.fn().mockResolvedValue({}) };
  return {
    service: new AiAppsService(prisma as any, aws as any, pushNotifications as any),
    prisma,
    aws,
    pushNotifications,
  };
}

/** The `data` of the update() call that wrote status ERROR. */
function errorWrite(prisma: any): Record<string, any> | undefined {
  return prisma.aiApp.update.mock.calls.map(([{ data }]: any) => data).find((d: any) => d.status === 'ERROR');
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deployment.serving derivation', () => {
  it.each([
    // [status, lastDeployedAt, expected]
    ['READY', LAST_SHIP, 'latest'],
    ['ERROR', LAST_SHIP, 'previous'],
    ['ERROR', null, 'none'],
    ['DEPLOYING', LAST_SHIP, 'previous'],
    ['DRAFT', null, 'none'],
  ] as const)('status=%s lastDeployedAt=%s → %s', async (status, lastDeployedAt, expected) => {
    const { service } = buildService({ ...APP, status, lastDeployedAt, updatedAt: new Date() });

    const result = await service.getApp('app-1');

    expect(result.deployment.serving).toBe(expected);
  });
});

describe('manager gating of failure details', () => {
  const failedApp = {
    ...APP,
    status: 'ERROR',
    notes: 'Runner error: 500 kaniko blew up',
    failureStream: 'build',
    lastDeployedAt: LAST_SHIP,
  };

  it('creator sees notes + deployment.failureReason/failureStream (and canManage)', async () => {
    const { service } = buildService(failedApp);

    const result = await service.getApp('app-1', 'creator-1');

    expect(result.canManage).toBe(true);
    expect(result.notes).toBe(failedApp.notes);
    expect(result.deployment).toEqual({
      serving: 'previous',
      failureReason: failedApp.notes,
      failureStream: 'build',
    });
  });

  it('a non-manager gets serving only — notes nulled, no failure details', async () => {
    const { service } = buildService(failedApp);

    const result = await service.getApp('app-1', 'someone-else');

    expect(result.canManage).toBe(false);
    expect(result.notes).toBeNull();
    expect(result.deployment).toEqual({ serving: 'previous' });
  });

  it('an anonymous read is gated like a non-manager', async () => {
    const { service } = buildService(failedApp);

    const result = await service.getApp('app-1');

    expect(result.notes).toBeNull();
    expect(result.deployment).toEqual({ serving: 'previous' });
  });

  it('the raw failureStream column never appears on responses', async () => {
    const { service } = buildService(failedApp);

    const asManager = await service.getApp('app-1', 'creator-1');
    const asVisitor = await service.getApp('app-1', 'someone-else');

    expect('failureStream' in asManager).toBe(false);
    expect('failureStream' in asVisitor).toBe(false);
  });

  it('listApps gates per row: requester sees details on own apps only', async () => {
    const own = { ...failedApp };
    const other = { ...failedApp, uid: 'app-2', appId: 'other', memberUid: 'someone-else' };
    const { service, prisma } = buildService(failedApp);
    prisma.aiApp.findMany.mockResolvedValueOnce([own, other]);

    const result = await service.listApps('creator-1');

    expect(result[0].notes).toBe(failedApp.notes);
    expect(result[0].deployment.failureReason).toBe(failedApp.notes);
    expect(result[1].notes).toBeNull();
    expect(result[1].deployment).toEqual({ serving: 'previous' });
    // One admin lookup for the requester — never one per row.
    expect(prisma.member.findUnique).toHaveBeenCalledTimes(1);
  });

  it('listApps without a requester gates every row', async () => {
    const { service, prisma } = buildService(failedApp);
    prisma.aiApp.findMany.mockResolvedValueOnce([failedApp]);

    const result = await service.listApps();

    expect(result[0].notes).toBeNull();
    expect(result[0].deployment).toEqual({ serving: 'previous' });
    expect(prisma.member.findUnique).not.toHaveBeenCalled();
  });
});

describe('deploy outcome writes', () => {
  it('a successful deploy sets lastDeployedAt and clears failureStream (markReady)', async () => {
    const { service, prisma } = buildService({ ...APP, status: 'ERROR', notes: 'old failure', failureStream: 'build' });
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    const result = await service.deployDraft('creator-1', 'app-1', undefined);

    const readyWrite = prisma.aiApp.update.mock.calls
      .map(([{ data }]: any) => data)
      .find((d: any) => d.status === 'READY');
    expect(readyWrite).toMatchObject({ notes: null, failureStream: null });
    expect(readyWrite.lastDeployedAt).toBeInstanceOf(Date);
    expect(result.deployment.serving).toBe('latest');
  });

  it('a hard runner error is classified as a build failure and never touches lastDeployedAt', async () => {
    const { service, prisma } = buildService({ ...APP, status: 'ERROR' });
    mockedAxios.post.mockRejectedValue({ isAxiosError: true, response: { status: 500, data: 'kaniko error' } });

    await expect(service.deployDraft('creator-1', 'app-1', undefined)).rejects.toThrow();

    expect(errorWrite(prisma)).toMatchObject({ failureStream: 'build' });
    expect(errorWrite(prisma)).not.toHaveProperty('lastDeployedAt');
  });

  it('a runner 2xx carrying status:"failed" is a failure, not a success', async () => {
    const { service, prisma } = buildService({ ...APP, status: 'ERROR' });
    mockedAxios.post.mockResolvedValue({ status: 200, data: { status: 'failed', port: null } });

    await expect(service.deployDraft('creator-1', 'app-1', undefined)).rejects.toThrow();

    expect(errorWrite(prisma)).toMatchObject({ status: 'ERROR', failureStream: 'build' });
    expect(prisma.aiApp.update.mock.calls.map(([{ data }]: any) => data.status)).not.toContain('READY');
  });

  it('a timeout where the app never comes up leaves the stream unclassified', async () => {
    const { service, prisma } = buildService({ ...APP, status: 'ERROR' });
    mockedAxios.post.mockRejectedValue({ isAxiosError: true, response: undefined, code: 'ECONNABORTED' });
    mockedAxios.get.mockRejectedValue(new Error('unreachable')); // liveness verify fails

    await expect(service.deployDraft('creator-1', 'app-1', undefined)).rejects.toThrow();

    expect(errorWrite(prisma)).toMatchObject({ status: 'ERROR', failureStream: null });
  });

  it('a secrets-injection failure is classified as a runtime failure', async () => {
    const { service, prisma } = buildService({
      ...APP,
      status: 'ERROR',
      requiredEnvVars: ['API_KEY'],
      providedEnvVars: ['API_KEY'],
    });
    // Build succeeds; the runner registry lookup then fails the secrets redeploy.
    mockedAxios.post.mockResolvedValueOnce({ status: 200, data: { port: 31001 } });
    mockedAxios.get.mockResolvedValue({ data: { apps: [] } }); // no image for appId

    await expect(service.deployDraft('creator-1', 'app-1', undefined)).rejects.toThrow();

    expect(errorWrite(prisma)).toMatchObject({ failureStream: 'runtime' });
  });

  it('a stuck-deploy settle writes ERROR with failureStream null (stale values must not leak)', async () => {
    const stuck = {
      ...APP,
      status: 'DEPLOYING',
      failureStream: 'build',
      updatedAt: new Date(Date.now() - AI_APPS_DEPLOY_STUCK_MS - 60_000),
    };
    const { service, prisma } = buildService(stuck);
    prisma.aiApp.findUnique.mockResolvedValueOnce(stuck).mockResolvedValueOnce({ ...stuck, status: 'ERROR' });

    await service.getApp('app-1');

    expect(prisma.aiApp.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ERROR', failureStream: null }) })
    );
  });
});

describe('deploy lifecycle bell notifications', () => {
  it('a FIRST successful deploy (lastDeployedAt was null) broadcasts to AI Apps access holders', async () => {
    const { service, pushNotifications } = buildService({ ...APP, status: 'DRAFT', lastDeployedAt: null });
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    await service.deployDraft('creator-1', 'app-1', undefined);

    expect(pushNotifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'AI_APP',
        link: '/pl-infra/ai-apps/app-1',
        requiredPermissions: ['ai_apps.read', 'ai_apps.write'],
        metadata: expect.objectContaining({ appUid: 'app-1', trigger: 'deploy_succeeded' }),
      })
    );
    expect(pushNotifications.create.mock.calls[0][0]).not.toHaveProperty('recipientUid');
  });

  it('a redeploy (lastDeployedAt already set) never re-fires the broadcast', async () => {
    const { service, pushNotifications } = buildService({ ...APP, status: 'READY', lastDeployedAt: LAST_SHIP });
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    await service.deployDraft('creator-1', 'app-1', undefined);

    expect(pushNotifications.create).not.toHaveBeenCalled();
  });

  it('a deploy failure notifies the app OWNER only, never the broader access-holder broadcast', async () => {
    const { service, prisma, pushNotifications } = buildService({ ...APP, status: 'ERROR', memberUid: 'owner-1' });
    // requesterUid is a directory admin acting on someone else's app — the
    // notification must still target the app's owner, not the requester.
    prisma.member.findUnique.mockResolvedValueOnce({ memberRoles: [{ name: 'DIRECTORYADMIN' }] });
    mockedAxios.post.mockRejectedValue({ isAxiosError: true, response: { status: 500, data: 'kaniko error' } });

    await expect(service.deployDraft('admin-1', 'app-1', undefined)).rejects.toThrow();

    expect(pushNotifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'AI_APP',
        link: '/pl-infra/ai-apps/app-1',
        recipientUid: 'owner-1',
        metadata: expect.objectContaining({ appUid: 'app-1', trigger: 'deploy_failed' }),
      })
    );
    expect(pushNotifications.create.mock.calls[0][0]).not.toHaveProperty('requiredPermissions');
  });

  it('a stuck-deploy settle notifies the app owner of the failure', async () => {
    const stuck = {
      ...APP,
      memberUid: 'owner-1',
      status: 'DEPLOYING',
      updatedAt: new Date(Date.now() - AI_APPS_DEPLOY_STUCK_MS - 60_000),
    };
    const { service, prisma, pushNotifications } = buildService(stuck);
    prisma.aiApp.findUnique.mockResolvedValueOnce(stuck).mockResolvedValueOnce({ ...stuck, status: 'ERROR' });

    await service.getApp('app-1');

    expect(pushNotifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'AI_APP', recipientUid: 'owner-1' })
    );
  });
});
