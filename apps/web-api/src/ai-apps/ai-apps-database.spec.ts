/// <reference types="multer" />

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

const mockedAxios = axios as jest.Mocked<typeof axios>;

const FILE = { buffer: Buffer.from('zip'), mimetype: 'application/zip' } as Express.Multer.File;

/**
 * Stateful prisma mock: unlike the simpler per-call mocks elsewhere, this one
 * accumulates writes across calls so a single deploy's several `update()`s
 * (DEPLOYING → READY) and a later, separate `deployDraft()` see the same
 * persisted row — needed to prove the `database` column survives between
 * calls the way the real DB would.
 */
function buildService(initial: Record<string, any> | null = null) {
  let row: Record<string, any> | null = initial ? { ...initial } : null;
  const prisma = {
    aiApp: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(row ? { ...row } : null)),
      upsert: jest.fn().mockImplementation(({ create, update }) => {
        row = row ? { ...row, ...update } : { uid: 'app-1', memberUid: 'creator-1', ...create };
        return Promise.resolve({ ...row });
      }),
      update: jest.fn().mockImplementation(({ data }) => {
        row = { ...(row as Record<string, any>), ...data };
        return Promise.resolve({ ...row });
      }),
    },
    aiAppEvent: { create: jest.fn().mockResolvedValue({}) },
    member: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  const aws = { uploadFileToS3: jest.fn().mockResolvedValue(undefined) };
  return { service: new AiAppsService(prisma as any, aws as any), prisma, aws, getRow: () => row };
}

const DEPLOY_DTO = {
  appId: 'demo',
  name: 'Demo',
  description: 'desc',
  deploymentId: 'd1',
  database: { enabled: true, type: 'postgres' },
} as any;

const DEPLOY_DTO_NO_DATABASE = {
  appId: 'demo',
  name: 'Demo',
  description: 'desc',
  deploymentId: 'd2',
} as any;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('agent-driven database provisioning', () => {
  it('forwards {enabled, type} to the runner and reflects it in the response', async () => {
    const { service } = buildService(null);
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    const result = await service.deploy('creator-1', DEPLOY_DTO, FILE);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/deploy'),
      expect.objectContaining({ appId: 'demo', database: { enabled: true, type: 'postgres' } }),
      expect.anything()
    );
    expect(result.database).toEqual({ enabled: true, type: 'postgres' });
  });

  it('omits the database field from the runner request when not requested', async () => {
    const { service } = buildService(null);
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    const result = await service.deploy('creator-1', DEPLOY_DTO_NO_DATABASE, FILE);

    const [, body] = mockedAxios.post.mock.calls[0];
    expect(body).not.toHaveProperty('database');
    expect(result.database).toEqual({ enabled: false });
  });

  it('stores non-sensitive connection metadata the runner returns once it provisions the database', async () => {
    const { service } = buildService(null);
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: {
        port: 31001,
        database: {
          host: 'ai-rds.internal',
          port: 5432,
          name: 'db_demo',
          user: 'db_demo_user',
          type: 'postgres',
          credentialsInjected: true,
        },
      },
    });

    const result = await service.deploy('creator-1', DEPLOY_DTO, FILE);

    expect(result.database).toEqual({
      enabled: true,
      type: 'postgres',
      host: 'ai-rds.internal',
      port: 5432,
      name: 'db_demo',
      user: 'db_demo_user',
      credentialsInjected: true,
    });
    // The password never touches us — it isn't part of the runner's response
    // contract, so it can never appear on the stored row or the API response.
    expect(JSON.stringify(result)).not.toMatch(/password/i);
  });

  it('the application never has to generate credentials — only enabled+type is sent, never generated ourselves', async () => {
    const { service } = buildService(null);
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    await service.deploy('creator-1', DEPLOY_DTO, FILE);

    const [, body] = mockedAxios.post.mock.calls[0] as [string, Record<string, any>];
    expect(body.database).toEqual({ enabled: true, type: 'postgres' });
  });

  it('a member-triggered redeploy keeps requesting the previously provisioned database without the agent resending it', async () => {
    const existing = {
      uid: 'app-1',
      memberUid: 'creator-1',
      appId: 'demo',
      name: 'Demo',
      status: 'READY',
      s3Key: 'apps/demo/d1/app.zip',
      deploymentId: 'd1',
      requiredEnvVars: [],
      providedEnvVars: [],
      database: { enabled: true, type: 'postgres' },
      updatedAt: new Date(),
    };
    const { service } = buildService(existing);
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    await service.deployDraft('creator-1', 'app-1', undefined);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/deploy'),
      expect.objectContaining({ database: { enabled: true, type: 'postgres' } }),
      expect.anything()
    );
  });

  it('a later deploy that omits the field turns provisioning off for that deploy (mirrors kitVersion/agentModel semantics)', async () => {
    const existing = {
      uid: 'app-1',
      memberUid: 'creator-1',
      appId: 'demo',
      name: 'Demo',
      status: 'READY',
      s3Key: 'apps/demo/d1/app.zip',
      deploymentId: 'd1',
      requiredEnvVars: [],
      providedEnvVars: [],
      database: { enabled: true, type: 'postgres' },
      updatedAt: new Date(),
    };
    const { service } = buildService(existing);
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    const result = await service.deploy('creator-1', DEPLOY_DTO_NO_DATABASE, FILE);

    const [, body] = mockedAxios.post.mock.calls[0];
    expect(body).not.toHaveProperty('database');
    expect(result.database).toEqual({ enabled: false });
  });
});
