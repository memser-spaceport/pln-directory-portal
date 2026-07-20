/// <reference types="multer" />
import { ConflictException } from '@nestjs/common';

// axios ships ESM (not in the jest transform allowlist); the deploy paths under
// test call it, so mock the calls themselves.
jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  isAxiosError: jest.fn((error: any) => !!error?.isAxiosError),
}));

// The constants module reads env vars at import time; pin the bucket so the
// deploy/draft upload paths are exercised regardless of the test environment.
jest.mock('./ai-apps.constants', () => ({
  ...jest.requireActual('./ai-apps.constants'),
  AI_APPS_S3_BUCKET: 'test-bucket',
}));

import axios from 'axios';
import { AiAppsService } from './ai-apps.service';
import { AI_APPS_DEPLOY_STUCK_MS } from './ai-apps.constants';

const mockedAxios = axios as jest.Mocked<typeof axios>;

/** DEPLOYING since well past the stuck window (retryable). */
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

const FILE = { buffer: Buffer.from('zip'), mimetype: 'application/zip' } as Express.Multer.File;

const DEPLOY_DTO = { appId: 'demo', name: 'Demo', description: 'desc', deploymentId: 'd2' } as any;
const DRAFT_DTO = { ...DEPLOY_DTO, requiredEnvVars: ['OPENAI_API_KEY'] } as any;

function buildService(existing: Record<string, any> | null = APP) {
  const prisma = {
    aiApp: {
      findUnique: jest.fn().mockResolvedValue(existing),
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ ...APP, ...create, uid: 'app-1' })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...APP, ...data })),
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AiAppsService.deploy concurrency guard', () => {
  it('blocks a second agent deploy while a fresh deploy is in flight', async () => {
    const { service, prisma, aws } = buildService({ ...APP, status: 'DEPLOYING', updatedAt: new Date() });

    await expect(service.deploy('creator-1', DEPLOY_DTO, FILE)).rejects.toBeInstanceOf(ConflictException);

    // Nothing is overwritten: no S3 upload, no upsert, no runner call.
    expect(aws.uploadFileToS3).not.toHaveBeenCalled();
    expect(prisma.aiApp.upsert).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('allows a deploy that recovers a STUCK in-flight deploy', async () => {
    const { service, prisma } = buildService({
      ...APP,
      status: 'DEPLOYING',
      updatedAt: new Date(Date.now() - STUCK_AGE_MS),
    });
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    const result = await service.deploy('creator-1', DEPLOY_DTO, FILE);

    expect(prisma.aiApp.upsert).toHaveBeenCalled();
    expect(result.status).toBe('READY');
  });

  it('allows the first-ever deploy when no app row exists yet', async () => {
    const { service, prisma } = buildService(null);
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    const result = await service.deploy('creator-1', DEPLOY_DTO, FILE);

    expect(prisma.aiApp.upsert).toHaveBeenCalled();
    expect(result.status).toBe('READY');
  });
});

describe('AiAppsService.registerDraft concurrency guard', () => {
  it('blocks re-registering a draft while a fresh deploy is in flight', async () => {
    const { service, prisma, aws } = buildService({ ...APP, status: 'DEPLOYING', updatedAt: new Date() });

    await expect(service.registerDraft('creator-1', DRAFT_DTO, FILE)).rejects.toBeInstanceOf(ConflictException);

    expect(aws.uploadFileToS3).not.toHaveBeenCalled();
    expect(prisma.aiApp.upsert).not.toHaveBeenCalled();
  });

  it('allows registering a draft when no app row exists yet', async () => {
    const { service, prisma } = buildService(null);

    await service.registerDraft('creator-1', DRAFT_DTO, FILE);

    expect(prisma.aiApp.upsert).toHaveBeenCalled();
  });
});
