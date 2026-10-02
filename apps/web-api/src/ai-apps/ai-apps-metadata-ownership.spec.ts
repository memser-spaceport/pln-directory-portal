/// <reference types="multer" />
import { ForbiddenException } from '@nestjs/common';

jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
  isAxiosError: jest.fn((error: any) => !!error?.isAxiosError),
}));

jest.mock('./ai-apps.constants', () => ({
  ...jest.requireActual('./ai-apps.constants'),
  AI_APPS_S3_BUCKET: 'test-bucket',
  AI_APPS_PRD_S3_BUCKET: 'test-bucket',
}));

jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));

jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import { AiAppsService } from './ai-apps.service';

const APP = { uid: 'app-1', memberUid: 'creator-1', appId: 'demo', name: 'Demo', status: 'READY', tags: [] };

const PRD_FILE = {
  buffer: Buffer.from('<h1>One-pager</h1>'),
  originalname: 'prd.html',
  mimetype: 'text/html',
  size: 18,
} as Express.Multer.File;

function buildService({ requesterRoles = [] as string[] } = {}) {
  const prisma = {
    aiApp: {
      findUnique: jest.fn().mockResolvedValue(APP),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...APP, ...data })),
    },
    aiAppEvent: { create: jest.fn().mockResolvedValue({}) },
    member: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ memberRoles: requesterRoles.map((name) => ({ name })) }),
    },
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

describe('dashboard metadata edits are limited to the creator or a directory admin', () => {
  it('rejects a JSON edit by another member and leaves the app unchanged', async () => {
    const { service, prisma } = buildService();

    await expect(service.updateMetadata('viewer-1', 'app-1', { name: 'Defaced' } as any)).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(prisma.aiApp.update).not.toHaveBeenCalled();
  });

  it('rejects turning LabOS feedback off by someone who cannot edit the app', async () => {
    const { service, prisma } = buildService();

    await expect(service.updateMetadata('viewer-1', 'app-1', { feedbackEnabled: false } as any)).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(prisma.aiApp.update).not.toHaveBeenCalled();
  });

  it('rejects a multipart edit with a PRD file by another member before any S3 upload', async () => {
    const { service, prisma, aws } = buildService();

    await expect(
      service.updateMetadataWithOptionalPrdFile('viewer-1', 'app-1', { name: 'Defaced' } as any, PRD_FILE)
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(aws.uploadFileToS3).not.toHaveBeenCalled();
    expect(prisma.aiApp.update).not.toHaveBeenCalled();
  });

  it('rejects POST /:uid/prd by another member before any S3 upload', async () => {
    const { service, prisma, aws } = buildService();

    await expect(service.uploadPrd('viewer-1', 'app-1', PRD_FILE)).rejects.toBeInstanceOf(ForbiddenException);
    expect(aws.uploadFileToS3).not.toHaveBeenCalled();
    expect(prisma.aiApp.update).not.toHaveBeenCalled();
  });

  it('lets the creator edit metadata and upload a PRD', async () => {
    const { service, prisma, aws } = buildService();

    await service.updateMetadata('creator-1', 'app-1', { name: 'Renamed' } as any);
    expect(prisma.aiApp.update).toHaveBeenCalledWith({ where: { uid: 'app-1' }, data: { name: 'Renamed' } });

    await service.uploadPrd('creator-1', 'app-1', PRD_FILE);
    expect(aws.uploadFileToS3).toHaveBeenCalledTimes(1);
  });

  it('lets a directory admin edit another member’s app', async () => {
    const { service, prisma, aws } = buildService({ requesterRoles: ['DIRECTORYADMIN'] });

    await service.updateMetadata('admin-1', 'app-1', { description: 'Fixed typo' } as any);
    expect(prisma.aiApp.update).toHaveBeenCalled();

    await service.updateMetadata('admin-1', 'app-1', { feedbackEnabled: true } as any);
    expect(prisma.aiApp.update).toHaveBeenLastCalledWith({
      where: { uid: 'app-1' },
      data: { feedbackEnabled: true },
    });

    await service.uploadPrd('admin-1', 'app-1', PRD_FILE);
    expect(aws.uploadFileToS3).toHaveBeenCalledTimes(1);
  });

  it('keeps the agent route owner-only and does not consult the admin check', async () => {
    const { service, prisma } = buildService({ requesterRoles: ['DIRECTORYADMIN'] });

    await service.updateMetadata('creator-1', 'app-1', { name: 'Agent rename' } as any, true);
    expect(prisma.aiApp.update).toHaveBeenCalled();

    await expect(service.updateMetadata('admin-1', 'app-1', { name: 'x' } as any, true)).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });
});
