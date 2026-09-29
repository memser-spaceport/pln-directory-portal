/// <reference types="multer" />
import { BadRequestException } from '@nestjs/common';

// axios ships ESM (not in the jest transform allowlist); the deploy paths under test call it.
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
import { isReservedAppId } from './ai-apps.constants';

const mockedAxios = axios as jest.Mocked<typeof axios>;

const FILE = { buffer: Buffer.from('zip'), mimetype: 'application/zip' } as Express.Multer.File;
const dto = (appId: string) => ({ appId, name: 'App', description: 'desc', deploymentId: 'd1' } as any);

function buildService({ existing = null }: { existing?: Record<string, any> | null } = {}) {
  const prisma = {
    aiApp: {
      findUnique: jest.fn().mockResolvedValue(existing),
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ uid: 'app-1', ...create })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ uid: 'app-1', ...existing, ...data })),
    },
    aiAppEvent: { create: jest.fn().mockResolvedValue({}) },
    member: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
  };
  const aws = { uploadFileToS3: jest.fn().mockResolvedValue(undefined) };
  const service = new AiAppsService(
    prisma as any,
    aws as any,
    { create: jest.fn() } as any,
    { trackEvent: jest.fn() } as any
  );
  return { service, prisma, aws };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isReservedAppId', () => {
  it.each(['api-directory', 'auth', 'forum', 'www', 'deployment-orchestrator-runner', 'dev-directory', 'directoryv2'])(
    'reserves %s',
    (appId) => expect(isReservedAppId(appId)).toBe(true)
  );

  it.each(['my-app', 'auth-demo', 'api-directory-v2-test', 'forum-bot', 'x'])('allows %s', (appId) =>
    expect(isReservedAppId(appId)).toBe(false)
  );

  it('adds AI_APPS_RESERVED_APP_IDS_EXTRA entries (trimmed, case-insensitive)', () => {
    const previous = process.env.AI_APPS_RESERVED_APP_IDS_EXTRA;
    process.env.AI_APPS_RESERVED_APP_IDS_EXTRA = ' new-platform-host , Other ';
    try {
      jest.isolateModules(() => {
        const constants = jest.requireActual('./ai-apps.constants');
        expect(constants.isReservedAppId('new-platform-host')).toBe(true);
        expect(constants.isReservedAppId('other')).toBe(true);
        expect(constants.isReservedAppId('auth')).toBe(true);
        expect(constants.isReservedAppId('my-app')).toBe(false);
      });
    } finally {
      if (previous === undefined) delete process.env.AI_APPS_RESERVED_APP_IDS_EXTRA;
      else process.env.AI_APPS_RESERVED_APP_IDS_EXTRA = previous;
    }
  });
});

describe('reserved appIds on deploy entry points', () => {
  it('rejects an agent deploy with 400 naming the appId, before any upload, upsert or runner call', async () => {
    const { service, prisma, aws } = buildService();

    const attempt = service.deploy('member-1', dto('api-directory'), FILE);
    await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
    await expect(attempt).rejects.toThrow('"api-directory" is reserved');

    expect(aws.uploadFileToS3).not.toHaveBeenCalled();
    expect(prisma.aiApp.upsert).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('rejects a draft registration with a reserved appId before any upload or upsert', async () => {
    const { service, prisma, aws } = buildService();

    await expect(
      service.registerDraft('member-1', { ...dto('auth'), requiredEnvVars: ['OPENAI_API_KEY'] }, FILE)
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(aws.uploadFileToS3).not.toHaveBeenCalled();
    expect(prisma.aiApp.upsert).not.toHaveBeenCalled();
  });

  it('rejects a reserved appId whose only row is DELETED (a new claim)', async () => {
    const { service, aws } = buildService({ existing: { status: 'DELETED' } });

    await expect(service.deploy('member-1', dto('forum'), FILE)).rejects.toBeInstanceOf(BadRequestException);
    expect(aws.uploadFileToS3).not.toHaveBeenCalled();
  });

  it("lets the member's own existing row keep deploying (grandfathered)", async () => {
    const existing = {
      uid: 'app-1',
      memberUid: 'member-1',
      appId: 'www',
      status: 'READY',
      updatedAt: new Date(),
      tags: [],
    };
    const { service, aws } = buildService({ existing });
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    await service.deploy('member-1', dto('www'), FILE);

    expect(aws.uploadFileToS3).toHaveBeenCalled();
  });

  it('does not look up rows for ordinary appIds', async () => {
    const { service, prisma, aws } = buildService();
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    await service.deploy('member-1', dto('my-app'), FILE);

    // One lookup: the existing concurrent-deploy check, not the reserved check.
    expect(prisma.aiApp.findUnique).toHaveBeenCalledTimes(1);
    expect(aws.uploadFileToS3).toHaveBeenCalled();
  });
});
