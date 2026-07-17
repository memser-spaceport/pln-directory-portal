/// <reference types="multer" />
import { ConflictException } from '@nestjs/common';

// axios ships ESM (not in the jest transform allowlist); the retry path under
// test calls it, so mock the calls themselves.
jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  isAxiosError: jest.fn((error: any) => !!error?.isAxiosError),
}));

// The constants module reads env vars at import time; pin the bucket so the
// deploy paths are exercised regardless of the test environment.
jest.mock('./ai-apps.constants', () => ({
  ...jest.requireActual('./ai-apps.constants'),
  AI_APPS_S3_BUCKET: 'test-bucket',
}));

import axios from 'axios';
import { AiAppsService } from './ai-apps.service';
import { AI_APPS_DEPLOY_STUCK_MS } from './ai-apps.constants';

const mockedAxios = axios as jest.Mocked<typeof axios>;

/** DEPLOYING since well past the stuck window. */
const STUCK_AGE_MS = AI_APPS_DEPLOY_STUCK_MS + 60 * 1000;

const APP = {
  uid: 'app-1',
  memberUid: 'creator-1',
  appId: 'demo',
  name: 'Demo',
  status: 'READY',
  s3Key: 'apps/demo/d1/app.zip',
  deploymentId: 'd1',
  requiredEnvVars: [],
  providedEnvVars: [],
  updatedAt: new Date(),
};

function buildService(app: Record<string, any> | null = APP) {
  const prisma = {
    aiApp: {
      findUnique: jest.fn().mockResolvedValue(app),
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
  return { service: new AiAppsService(prisma as any, aws as any), prisma, aws };
}

function eventTypes(prisma: any): string[] {
  return prisma.aiAppEvent.create.mock.calls.map(([{ data }]) => data.type);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('stuck deploy settling on read', () => {
  const stuckApp = { ...APP, status: 'DEPLOYING', updatedAt: new Date(Date.now() - STUCK_AGE_MS) };

  it('getApp flips a stuck DEPLOYING app to ERROR and records DEPLOY_FAILED', async () => {
    const { service, prisma } = buildService(stuckApp);
    const settled = { ...stuckApp, status: 'ERROR', notes: 'Deploy timed out', updatedAt: new Date() };
    prisma.aiApp.findUnique.mockResolvedValueOnce(stuckApp).mockResolvedValueOnce(settled);

    const result = await service.getApp('app-1');

    expect(prisma.aiApp.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uid: 'app-1', status: 'DEPLOYING' },
        data: expect.objectContaining({ status: 'ERROR', notes: expect.stringContaining('Deploy timed out') }),
      })
    );
    expect(eventTypes(prisma)).toEqual(['DEPLOY_FAILED']);
    expect(result.status).toBe('ERROR');
  });

  it('getApp leaves a fresh DEPLOYING app untouched', async () => {
    const { service, prisma } = buildService({ ...APP, status: 'DEPLOYING', updatedAt: new Date() });

    const result = await service.getApp('app-1');

    expect(prisma.aiApp.updateMany).not.toHaveBeenCalled();
    expect(eventTypes(prisma)).toEqual([]);
    expect(result.status).toBe('DEPLOYING');
  });

  it('getApp records no event when the deploy settled concurrently (updateMany count 0)', async () => {
    const { service, prisma } = buildService(stuckApp);
    prisma.aiApp.updateMany.mockResolvedValue({ count: 0 });
    prisma.aiApp.findUnique.mockResolvedValueOnce(stuckApp).mockResolvedValueOnce({ ...stuckApp, status: 'READY' });

    const result = await service.getApp('app-1');

    expect(eventTypes(prisma)).toEqual([]);
    expect(result.status).toBe('READY');
  });

  it('listApps settles stuck rows and keeps healthy ones as-is', async () => {
    const ready = { ...APP, uid: 'app-2', appId: 'other', status: 'READY' };
    const { service, prisma } = buildService();
    prisma.aiApp.findMany.mockResolvedValueOnce([stuckApp, ready]).mockResolvedValue([]);
    prisma.aiApp.findUnique.mockResolvedValue({ ...stuckApp, status: 'ERROR', notes: 'Deploy timed out' });

    const result = await service.listApps();

    expect(prisma.aiApp.updateMany).toHaveBeenCalledTimes(1);
    expect(result.map((a) => a.status)).toEqual(['ERROR', 'READY']);
  });
});

describe('AiAppsService.deployDraft retry gating', () => {
  it('blocks a retry while a fresh deploy is in flight', async () => {
    const { service } = buildService({ ...APP, status: 'DEPLOYING', updatedAt: new Date() });
    await expect(service.deployDraft('creator-1', 'app-1', undefined)).rejects.toBeInstanceOf(ConflictException);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('allows a retry of a STUCK deploy and settles READY on success', async () => {
    const { service, prisma } = buildService({
      ...APP,
      status: 'DEPLOYING',
      updatedAt: new Date(Date.now() - STUCK_AGE_MS),
    });
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    const result = await service.deployDraft('creator-1', 'app-1', undefined);

    expect(mockedAxios.post.mock.calls[0][0]).toContain('/deploy');
    expect(eventTypes(prisma)).toEqual(['DEPLOY_STARTED', 'DEPLOY_SUCCEEDED']);
    expect(result.status).toBe('READY');
  });

  it('allows a retry from ERROR for an app without required env vars', async () => {
    const { service, prisma } = buildService({ ...APP, status: 'ERROR', notes: 'Runner error: 500' });
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    const result = await service.deployDraft('creator-1', 'app-1', undefined);

    expect(eventTypes(prisma)).toEqual(['DEPLOY_STARTED', 'DEPLOY_SUCCEEDED']);
    expect(result.status).toBe('READY');
  });
});
