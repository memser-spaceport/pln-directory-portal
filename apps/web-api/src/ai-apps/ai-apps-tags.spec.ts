/// <reference types="multer" />
import { BadRequestException } from '@nestjs/common';

// axios ships ESM (not in the jest transform allowlist); the draft path under
// test never reaches it.
jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false) }));

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

import { AiAppsService } from './ai-apps.service';
import { AI_APPS_MAX_TAGS_PER_APP, AI_APPS_TAGS } from './ai-apps-tags';
import { DeployAppSchema } from './dto/deploy-app.dto';
import { RegisterDraftSchema } from './dto/register-draft.dto';
import { UpdateAppMetadataSchema } from './dto/update-app-metadata.dto';

const APP = {
  uid: 'app-1',
  memberUid: 'creator-1',
  appId: 'demo',
  name: 'Demo',
  status: 'DRAFT',
  requiredEnvVars: ['OPENAI_API_KEY'],
  providedEnvVars: [],
  tags: [] as string[],
};

const FILE = { buffer: Buffer.from('zip'), mimetype: 'application/zip' } as Express.Multer.File;

const DRAFT_DTO = {
  appId: 'demo',
  name: 'Demo',
  deploymentId: 'd1',
  requiredEnvVars: ['OPENAI_API_KEY'],
  tags: ['venture', 'dashboards'],
};

function buildService(app: Record<string, any> | null = APP) {
  const prisma = {
    aiApp: {
      findUnique: jest.fn().mockResolvedValue(app),
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ ...APP, ...create })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...APP, ...data })),
    },
    aiAppEvent: { create: jest.fn().mockResolvedValue({}) },
    member: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    aiAppActiveMember: { groupBy: jest.fn().mockResolvedValue([]) },
  };
  const aws = { uploadFileToS3: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new AiAppsService(
      prisma as any,
      aws as any,
      { create: jest.fn() } as any,
      { trackEvent: jest.fn() } as any
    ),
    prisma,
  };
}

describe('AI App tags', () => {
  describe('vocabulary', () => {
    it('has unique slugs and includes `other`', () => {
      const slugs = AI_APPS_TAGS.map((tag) => tag.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      expect(slugs).toContain('other');
    });
  });

  describe('DTO validation', () => {
    it('accepts known slugs and dedupes them', () => {
      const parsed = UpdateAppMetadataSchema.parse({ tags: ['venture', 'venture', 'other'] });
      expect(parsed.tags).toEqual(['venture', 'other']);
    });

    it('rejects slugs outside the vocabulary', () => {
      expect(() => UpdateAppMetadataSchema.parse({ tags: ['freeform'] })).toThrow();
    });

    it('rejects more than the per-app cap', () => {
      const tooMany = AI_APPS_TAGS.slice(0, AI_APPS_MAX_TAGS_PER_APP + 1).map((tag) => tag.slug);
      expect(() => UpdateAppMetadataSchema.parse({ tags: tooMany })).toThrow();
    });

    it('parses multipart tags from a JSON array or a comma-separated string', () => {
      const base = { appId: 'demo', name: 'Demo', deploymentId: 'd1' };
      expect(DeployAppSchema.parse({ ...base, tags: '["venture","dashboards"]' }).tags).toEqual([
        'venture',
        'dashboards',
      ]);
      expect(DeployAppSchema.parse({ ...base, tags: 'venture, dashboards' }).tags).toEqual(['venture', 'dashboards']);
      expect(DeployAppSchema.parse({ ...base, tags: '' }).tags).toBeUndefined();
      expect(RegisterDraftSchema.parse({ ...base, requiredEnvVars: 'A_KEY', tags: 'other' }).tags).toEqual(['other']);
    });
  });

  describe('updateMetadata', () => {
    it('accepts a tags-only edit and replaces the list', async () => {
      const { service, prisma } = buildService();
      await service.updateMetadata('creator-1', 'app-1', { tags: ['events'] } as any);
      expect(prisma.aiApp.update).toHaveBeenCalledWith({ where: { uid: 'app-1' }, data: { tags: ['events'] } });
    });

    it('still rejects an empty payload', async () => {
      const { service } = buildService();
      await expect(service.updateMetadata('creator-1', 'app-1', {} as any)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('uploads', () => {
    it('sets tags on the first upload', async () => {
      const { service, prisma } = buildService(null);
      await service.registerDraft('creator-1', DRAFT_DTO as any, FILE);
      const { create, update } = prisma.aiApp.upsert.mock.calls[0][0];
      expect(create.tags).toEqual(['venture', 'dashboards']);
      expect(update.tags).toEqual(['venture', 'dashboards']);
    });

    it('defaults to no tags when an older kit sends none', async () => {
      const { service, prisma } = buildService(null);
      await service.registerDraft('creator-1', { ...DRAFT_DTO, tags: undefined } as any, FILE);
      const { create, update } = prisma.aiApp.upsert.mock.calls[0][0];
      expect(create.tags).toEqual([]);
      expect(update.tags).toEqual([]);
    });

    it('never overwrites tags on an already-tagged app', async () => {
      const { service, prisma } = buildService({ ...APP, tags: ['people-ops'] });
      await service.registerDraft('creator-1', DRAFT_DTO as any, FILE);
      const { update } = prisma.aiApp.upsert.mock.calls[0][0];
      expect(update.tags).toBeUndefined();
    });
  });
});
