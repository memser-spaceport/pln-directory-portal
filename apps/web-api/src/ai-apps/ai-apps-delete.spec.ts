/// <reference types="multer" />
import { BadGatewayException } from '@nestjs/common';

// axios ships ESM (not in the jest transform allowlist); the delete path under
// test calls it, so mock the calls themselves.
jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
  isAxiosError: jest.fn((error: any) => !!error?.isAxiosError),
}));

// The real module pulls in a transitive chain that breaks under ts-jest (an
// ESM-only nestjs-zod import); mock it like roadmap.service.spec.ts does.
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));

jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import axios from 'axios';
import { AiAppsService } from './ai-apps.service';

const mockedAxios = axios as jest.Mocked<typeof axios>;

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

function buildService(existing: Record<string, any>) {
  const prisma = {
    aiApp: {
      findUnique: jest.fn().mockResolvedValue(existing),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...APP, ...existing, ...data })),
    },
    aiAppEvent: { create: jest.fn().mockResolvedValue({}) },
    member: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  const aws = { uploadFileToS3: jest.fn().mockResolvedValue(undefined) };
  const pushNotifications = { create: jest.fn().mockResolvedValue({}) };
  const analyticsService = { trackEvent: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new AiAppsService(prisma as any, aws as any, pushNotifications as any, analyticsService as any),
    prisma,
  };
}

/** The `data` of the last aiApp.update() call. */
function lastWrite(prisma: any): Record<string, any> {
  const calls = prisma.aiApp.update.mock.calls;
  return calls[calls.length - 1][0].data;
}

/** Event types recorded, in order. */
function recordedEvents(prisma: any): string[] {
  return prisma.aiAppEvent.create.mock.calls.map(([{ data }]: any) => data.type);
}

function runnerError(status: number | undefined, data?: unknown) {
  return { isAxiosError: true, response: status ? { status, data } : undefined, message: 'boom' };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AiAppsService.deleteApp runner outcomes', () => {
  it('treats a runner 404 as success — a never-deployed draft has nothing to tear down', async () => {
    const { service, prisma } = buildService({ ...APP, status: 'DRAFT', deploymentId: null });
    mockedAxios.delete.mockRejectedValue(runnerError(404, { error: 'App not found', appId: 'demo' }));

    const result = await service.deleteApp('creator-1', 'app-1');

    expect(result.status).toBe('DELETED');
    expect(lastWrite(prisma)).toMatchObject({ status: 'DELETED', notes: null });
    expect(recordedEvents(prisma)).toEqual(['DELETE_STARTED', 'DELETE_SUCCEEDED']);
  });

  it('restores the prior status on a real runner failure so a draft keeps its DRAFT badge', async () => {
    const { service, prisma } = buildService({ ...APP, status: 'DRAFT', deploymentId: null });
    mockedAxios.delete.mockRejectedValue(runnerError(500, { error: 'internal' }));

    await expect(service.deleteApp('creator-1', 'app-1')).rejects.toBeInstanceOf(BadGatewayException);

    expect(lastWrite(prisma)).toMatchObject({ status: 'DRAFT' });
    expect(lastWrite(prisma).notes).toContain('Runner error: 500');
    expect(recordedEvents(prisma)).toEqual(['DELETE_STARTED', 'DELETE_FAILED']);
  });

  it('restores READY on a failed delete of a live app', async () => {
    const { service, prisma } = buildService({ ...APP, status: 'READY' });
    mockedAxios.delete.mockRejectedValue(runnerError(undefined));

    await expect(service.deleteApp('creator-1', 'app-1')).rejects.toBeInstanceOf(BadGatewayException);

    expect(lastWrite(prisma)).toMatchObject({ status: 'READY' });
  });

  it('falls back to ERROR when the app was already stuck in DELETING', async () => {
    const { service, prisma } = buildService({ ...APP, status: 'DELETING' });
    mockedAxios.delete.mockRejectedValue(runnerError(500, { error: 'internal' }));

    await expect(service.deleteApp('creator-1', 'app-1')).rejects.toBeInstanceOf(BadGatewayException);

    expect(lastWrite(prisma)).toMatchObject({ status: 'ERROR' });
  });
});
