/// <reference types="multer" />
jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
  isAxiosError: jest.fn((error: any) => !!error?.isAxiosError),
}));
jest.mock('./ai-apps.constants', () => ({
  ...jest.requireActual('./ai-apps.constants'),
  AI_APPS_S3_BUCKET: 'test-bucket',
}));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import axios from 'axios';
import { AiAppsService } from './ai-apps.service';
import { withInlineDeploys } from './ai-apps-deploy-queue.spec-helper';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const FILE = { buffer: Buffer.from('zip'), mimetype: 'application/zip' } as Express.Multer.File;
const DTO = { appId: 'demo', name: 'Demo', description: 'd', deploymentId: 'd1' } as any;

function build() {
  const prisma = {
    aiApp: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest
        .fn()
        .mockImplementation(({ create }) => Promise.resolve({ uid: 'app-1', status: 'DEPLOYING', ...create })),
      update: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ uid: 'app-1', appId: 'demo', memberUid: 'm-1', ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    aiAppEvent: { create: jest.fn().mockResolvedValue({}) },
    aiAppAuthGate: { upsert: jest.fn().mockResolvedValue({}) },
    member: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
  };
  const aws = { uploadFileToS3: jest.fn().mockResolvedValue(undefined) };
  const service = withInlineDeploys(
    prisma,
    new AiAppsService(prisma as any, aws as any, { create: jest.fn() } as any, { trackEvent: jest.fn() } as any)
  );
  return { service, prisma };
}

describe('auth gate version recording on deploy', () => {
  beforeEach(() => jest.clearAllMocks());

  it('records the gate version the runner reports for the deployed target', async () => {
    const { service, prisma } = build();
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001, authGateVersion: 2 } });

    await service.deploy('m-1', DTO, FILE);

    expect(prisma.aiAppAuthGate.upsert).toHaveBeenCalledWith({
      where: { appUid_environment: { appUid: 'app-1', environment: 'prod' } },
      create: { appUid: 'app-1', environment: 'prod', version: 2 },
      update: { version: 2, lastError: null },
    });
  });

  it('records nothing when the runner reports no gate version (orchestrator before gate v2)', async () => {
    const { service, prisma } = build();
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    await service.deploy('m-1', DTO, FILE);

    expect(prisma.aiAppAuthGate.upsert).not.toHaveBeenCalled();
  });

  it('keeps gate state off the app row', async () => {
    const { service, prisma } = build();
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001, authGateVersion: 2 } });

    await service.deploy('m-1', DTO, FILE);

    for (const [args] of prisma.aiApp.update.mock.calls) {
      expect(Object.keys(args.data)).not.toEqual(expect.arrayContaining(['authGateVersion']));
    }
  });

  it('never fails the deploy when recording the gate version fails', async () => {
    const { service, prisma } = build();
    prisma.aiAppAuthGate.upsert.mockRejectedValue(new Error('db down'));
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001, authGateVersion: 2 } });

    await expect(service.deploy('m-1', DTO, FILE)).resolves.toEqual(expect.objectContaining({ status: 'READY' }));
  });
});
