/// <reference types="multer" />
import { ConflictException, ForbiddenException } from '@nestjs/common';

// axios ships ESM (not in the jest transform allowlist); the deploy/delete paths
// under test call it, so mock the calls themselves.
jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
  isAxiosError: jest.fn((error: any) => !!error?.isAxiosError),
}));

// The constants module reads env vars at import time; pin the bucket so the
// deploy/draft upload paths are exercised regardless of the test environment.
jest.mock('./ai-apps.constants', () => ({
  ...jest.requireActual('./ai-apps.constants'),
  AI_APPS_S3_BUCKET: 'test-bucket',
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

const FILE = { buffer: Buffer.from('zip'), mimetype: 'application/zip' } as Express.Multer.File;

const DEPLOY_DTO = { appId: 'demo', name: 'Demo', description: 'desc', deploymentId: 'd2' } as any;
const DRAFT_DTO = { ...DEPLOY_DTO, requiredEnvVars: ['OPENAI_API_KEY'] } as any;

/** Another member's live row holding the same appId. */
const OTHER_MEMBERS_APP = { uid: 'app-2', memberUid: 'creator-2' };

function buildService({
  existing = null,
  claimedByOther = null,
}: { existing?: Record<string, any> | null; claimedByOther?: Record<string, any> | null } = {}) {
  const prisma = {
    aiApp: {
      findUnique: jest.fn().mockResolvedValue(existing),
      findFirst: jest.fn().mockResolvedValue(claimedByOther),
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ ...APP, ...create, uid: 'app-1' })),
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
    aws,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('cross-member appId claim guard', () => {
  it('rejects an agent deploy for an appId live under another member', async () => {
    const { service, prisma, aws } = buildService({ claimedByOther: OTHER_MEMBERS_APP });

    await expect(service.deploy('creator-1', DEPLOY_DTO, FILE)).rejects.toBeInstanceOf(ConflictException);

    // Nothing touches the shared runner deployment: no S3 upload, no upsert, no runner call.
    expect(aws.uploadFileToS3).not.toHaveBeenCalled();
    expect(prisma.aiApp.upsert).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('rejects a draft registration for an appId live under another member', async () => {
    const { service, prisma, aws } = buildService({ claimedByOther: OTHER_MEMBERS_APP });

    await expect(service.registerDraft('creator-1', DRAFT_DTO, FILE)).rejects.toBeInstanceOf(ConflictException);

    expect(aws.uploadFileToS3).not.toHaveBeenCalled();
    expect(prisma.aiApp.upsert).not.toHaveBeenCalled();
  });

  it('rejects a member-triggered redeploy when a legacy duplicate row is live under another member', async () => {
    const { service } = buildService({ existing: APP, claimedByOther: OTHER_MEMBERS_APP });

    await expect(service.deployDraft('creator-1', 'app-1', undefined)).rejects.toBeInstanceOf(ConflictException);

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('scopes the claim lookup to other members with non-DELETED rows', async () => {
    const { service, prisma } = buildService();
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    await service.deploy('creator-1', DEPLOY_DTO, FILE);

    // The caller's own row and DELETED rows (runner deployment already torn
    // down) must not block the deploy.
    expect(prisma.aiApp.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { appId: 'demo', memberUid: { not: 'creator-1' }, status: { not: 'DELETED' } },
      })
    );
    expect(prisma.aiApp.upsert).toHaveBeenCalled();
  });
});

describe('AiAppsService.deleteApp ownership', () => {
  it('rejects a member who is neither the creator nor a directory admin', async () => {
    const { service, prisma } = buildService({ existing: APP });
    prisma.member.findUnique.mockResolvedValue({ memberRoles: [] });

    await expect(service.deleteApp('viewer-1', 'app-1')).rejects.toBeInstanceOf(ForbiddenException);

    // The shared runner deployment survives and the row is untouched.
    expect(mockedAxios.delete).not.toHaveBeenCalled();
    expect(prisma.aiApp.update).not.toHaveBeenCalled();
  });

  it('allows the creator to delete', async () => {
    const { service, prisma } = buildService({ existing: APP });
    mockedAxios.delete.mockResolvedValue({ status: 200, data: {} });

    const result = await service.deleteApp('creator-1', 'app-1');

    expect(mockedAxios.delete).toHaveBeenCalled();
    expect(result.status).toBe('DELETED');
    expect(prisma.aiAppEvent.create).toHaveBeenCalledTimes(2); // DELETE_STARTED + DELETE_SUCCEEDED
  });

  it('allows a directory admin who is not the creator to delete', async () => {
    const { service, prisma } = buildService({ existing: APP });
    prisma.member.findUnique.mockResolvedValue({ memberRoles: [{ name: 'DIRECTORYADMIN' }] });
    mockedAxios.delete.mockResolvedValue({ status: 200, data: {} });

    const result = await service.deleteApp('admin-1', 'app-1');

    expect(result.status).toBe('DELETED');
  });
});
