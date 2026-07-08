/// <reference types="multer" />
import { BadGatewayException, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

// axios ships ESM (not in the jest transform allowlist); the draft/deploy paths
// under test call it, so mock the calls themselves.
jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  isAxiosError: jest.fn((error: any) => !!error?.isAxiosError),
}));

// The constants module reads env vars at import time; pin the bucket so the
// upload paths are exercised regardless of the test environment.
jest.mock('./ai-apps.constants', () => ({
  ...jest.requireActual('./ai-apps.constants'),
  AI_APPS_S3_BUCKET: 'test-bucket',
}));

import axios from 'axios';
import { AiAppsService } from './ai-apps.service';
import { RegisterDraftSchema } from './dto/register-draft.dto';

const mockedAxios = axios as jest.Mocked<typeof axios>;

const APP = {
  uid: 'app-1',
  memberUid: 'creator-1',
  appId: 'demo',
  name: 'Demo',
  status: 'DRAFT',
  s3Key: 'apps/demo/d1/app.zip',
  deploymentId: 'd1',
  requiredEnvVars: ['OPENAI_API_KEY', 'SUPABASE_URL'],
  providedEnvVars: [],
};

const FILE = { buffer: Buffer.from('zip'), mimetype: 'application/zip' } as Express.Multer.File;

function buildService(app: Record<string, any> | null = APP) {
  const prisma = {
    aiApp: {
      findUnique: jest.fn().mockResolvedValue(app),
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

/** Route runner calls by URL: secrets store + deploy both answer 200 by default. */
function mockRunnerOk() {
  mockedAxios.post.mockImplementation((url: string) =>
    url.includes('/secrets')
      ? Promise.resolve({ status: 200, data: { ok: true } })
      : Promise.resolve({ status: 200, data: { port: 31001 } })
  );
}

function eventTypes(prisma: any): string[] {
  return prisma.aiAppEvent.create.mock.calls.map(([{ data }]) => data.type);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RegisterDraftSchema.requiredEnvVars', () => {
  const base = { appId: 'demo', name: 'Demo', deploymentId: 'd1' };

  it('accepts a JSON array string (multipart field)', () => {
    const parsed = RegisterDraftSchema.parse({ ...base, requiredEnvVars: '["OPENAI_API_KEY","SUPABASE_URL"]' });
    expect(parsed.requiredEnvVars).toEqual(['OPENAI_API_KEY', 'SUPABASE_URL']);
  });

  it('accepts a comma-separated list', () => {
    const parsed = RegisterDraftSchema.parse({ ...base, requiredEnvVars: 'OPENAI_API_KEY, SUPABASE_URL' });
    expect(parsed.requiredEnvVars).toEqual(['OPENAI_API_KEY', 'SUPABASE_URL']);
  });

  it('rejects names that are not UPPER_SNAKE_CASE', () => {
    expect(() => RegisterDraftSchema.parse({ ...base, requiredEnvVars: 'openai-key' })).toThrow();
  });

  it('rejects an empty list', () => {
    expect(() => RegisterDraftSchema.parse({ ...base, requiredEnvVars: '' })).toThrow();
  });
});

describe('AiAppsService.registerDraft', () => {
  const DTO = {
    appId: 'demo',
    name: 'Demo',
    description: 'desc',
    deploymentId: 'd2',
    requiredEnvVars: ['OPENAI_API_KEY', 'SUPABASE_URL'],
  } as any;

  it('rejects a missing ZIP', async () => {
    const { service } = buildService();
    await expect(service.registerDraft('creator-1', DTO, undefined as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uploads the bundle, stores the draft, and returns the LabOS page URL', async () => {
    const { service, prisma, aws } = buildService();
    const result = await service.registerDraft('creator-1', DTO, FILE);

    expect(aws.uploadFileToS3).toHaveBeenCalledWith(
      { buffer: FILE.buffer, mimetype: 'application/zip' },
      'test-bucket',
      'apps/demo/d2/app.zip'
    );
    expect(prisma.aiApp.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'DRAFT',
          s3Key: 'apps/demo/d2/app.zip',
          requiredEnvVars: DTO.requiredEnvVars,
        }),
      })
    );
    // Nothing is deployed at draft time.
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(eventTypes(prisma)).toEqual(['DRAFT_CREATED']);
    expect(result.appPageUrl).toContain('/pl-infra/ai-apps/app-1');
    expect(result.missingEnvVars).toEqual(['OPENAI_API_KEY', 'SUPABASE_URL']);
  });

  it('keeps already-provided vars out of missingEnvVars on re-registration', async () => {
    const { service, prisma } = buildService();
    prisma.aiApp.upsert.mockResolvedValue({ ...APP, providedEnvVars: ['OPENAI_API_KEY'] });
    const result = await service.registerDraft('creator-1', DTO, FILE);
    expect(result.missingEnvVars).toEqual(['SUPABASE_URL']);
  });
});

describe('AiAppsService.deployDraft', () => {
  const SECRETS = { OPENAI_API_KEY: 'sk-1', SUPABASE_URL: 'https://x.supabase.co' };

  it('throws 404 when the app does not exist', async () => {
    const { service } = buildService(null);
    await expect(service.deployDraft('creator-1', 'missing', SECRETS)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a member who is neither creator nor directory admin', async () => {
    const { service, prisma } = buildService();
    prisma.member.findUnique.mockResolvedValue({ memberRoles: [] });
    await expect(service.deployDraft('viewer-1', 'app-1', SECRETS)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an app without an uploaded bundle', async () => {
    const { service } = buildService({ ...APP, s3Key: null });
    await expect(service.deployDraft('creator-1', 'app-1', SECRETS)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks the deploy and names the missing required vars', async () => {
    const { service } = buildService();
    await expect(service.deployDraft('creator-1', 'app-1', { OPENAI_API_KEY: 'sk-1' })).rejects.toThrow(
      'Missing values for required environment variables: SUPABASE_URL'
    );
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('saves secrets to the runner, then deploys the stored bundle', async () => {
    const { service, prisma } = buildService();
    mockRunnerOk();

    const result = await service.deployDraft('creator-1', 'app-1', SECRETS);

    const [secretsCall, deployCall] = mockedAxios.post.mock.calls;
    expect(secretsCall[0]).toContain('/v1/projects/default/secrets');
    expect(secretsCall[1]).toEqual(expect.objectContaining({ appId: 'demo', secrets: SECRETS }));
    expect(deployCall[0]).toContain('/deploy');
    expect(deployCall[1]).toEqual({ appId: 'demo', deploymentId: 'd1', s3Key: 'apps/demo/d1/app.zip' });

    // Only the NAMES are remembered on the app record.
    expect(prisma.aiApp.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { providedEnvVars: ['OPENAI_API_KEY', 'SUPABASE_URL'] } })
    );
    expect(eventTypes(prisma)).toEqual(['SECRETS_UPDATED', 'DEPLOY_STARTED', 'DEPLOY_SUCCEEDED']);
    expect(result.status).toBe('READY');
  });

  it('redeploys without a secrets payload when all values were stored earlier', async () => {
    const { service, prisma } = buildService({ ...APP, providedEnvVars: ['OPENAI_API_KEY', 'SUPABASE_URL'] });
    mockRunnerOk();

    await service.deployDraft('creator-1', 'app-1', undefined);

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post.mock.calls[0][0]).toContain('/deploy');
    expect(eventTypes(prisma)).toEqual(['DEPLOY_STARTED', 'DEPLOY_SUCCEEDED']);
  });

  it('fails with 502 and skips the deploy when the runner rejects the secrets', async () => {
    const { service, prisma } = buildService();
    mockedAxios.post.mockRejectedValue(Object.assign(new Error('boom'), { isAxiosError: true }));

    await expect(service.deployDraft('creator-1', 'app-1', SECRETS)).rejects.toBeInstanceOf(BadGatewayException);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1); // secrets call only
    expect(eventTypes(prisma)).toEqual([]); // no SECRETS_UPDATED, no deploy events
  });

  it('marks the app ERROR when the runner deploy fails outright', async () => {
    const { service, prisma } = buildService({ ...APP, providedEnvVars: ['OPENAI_API_KEY', 'SUPABASE_URL'] });
    mockedAxios.post.mockRejectedValue(
      Object.assign(new Error('build failed'), { isAxiosError: true, response: { status: 500, data: 'nope' } })
    );

    await expect(service.deployDraft('creator-1', 'app-1', undefined)).rejects.toBeInstanceOf(BadGatewayException);
    expect(prisma.aiApp.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ERROR' }) })
    );
    expect(eventTypes(prisma)).toEqual(['DEPLOY_STARTED', 'DEPLOY_FAILED']);
  });
});
