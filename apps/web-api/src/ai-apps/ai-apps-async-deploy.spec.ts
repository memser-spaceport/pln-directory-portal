/// <reference types="multer" />

// axios ships ESM (not in the jest transform allowlist); the deploy paths under
// test call it, so mock the calls themselves.
jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  isAxiosError: jest.fn((error: any) => !!error?.isAxiosError),
}));

// Pin the bucket and status URL base, and make the orchestrator-record wait instant.
jest.mock('./ai-apps.constants', () => ({
  ...jest.requireActual('./ai-apps.constants'),
  AI_APPS_S3_BUCKET: 'test-bucket',
  AI_APPS_DEPLOYMENT_STATUS_ENDPOINT: 'https://api.test/v1/ai-apps/{appUid}/deployments/{deploymentId}',
  AI_APPS_DEPLOY_POLL_INTERVAL_MS: 0,
  AI_APPS_DEPLOY_REGISTER_GRACE_MS: 0,
  AI_APPS_DEPLOY_POLL_DEADLINE_MS: 0,
}));

// The real module pulls in a transitive chain that breaks under ts-jest (an
// ESM-only nestjs-zod import); mock it like roadmap.service.spec.ts does.
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import 'reflect-metadata';
import {
  ForbiddenException,
  HttpStatus,
  NotFoundException,
  RequestMethod,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import axios from 'axios';
import { AiAppDeployJob, AiAppsService } from './ai-apps.service';
import { AiAppsController } from './ai-apps.controller';
import { AiAppTokenGuard } from './guards/ai-app-token.guard';
import { AI_APPS_DEPLOY_STUCK_MS } from './ai-apps.constants';

const mockedAxios = axios as jest.Mocked<typeof axios>;

const OWNER = 'creator-1';
const FILE = { buffer: Buffer.from('zip'), mimetype: 'application/zip' } as Express.Multer.File;
const DTO = { appId: 'demo', name: 'Demo', description: 'desc', deploymentId: 'd2' } as any;

type Row = Record<string, any>;

/** Minimal in-memory Prisma: rows change as the service writes them; raw SQL phase writes skip `updatedAt`. */
function buildStore(seed: { app?: Row | null; preview?: Row | null } = {}) {
  let clock = Date.now();
  const now = () => new Date((clock += 1000));
  const apps = new Map<string, Row>();
  const targets = new Map<string, Row>();
  const events: Row[] = [];
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([key, value]) =>
      value && typeof value === 'object' && 'in' in (value as Row)
        ? ((value as Row).in as unknown[]).includes(row[key])
        : row[key] === value
    );
  if (seed.app) apps.set(seed.app.uid, { ...seed.app });
  if (seed.preview) targets.set(`${seed.preview.appUid}:preview`, { ...seed.preview });

  const findApp = (where: Row) =>
    where.uid
      ? apps.get(where.uid) ?? null
      : [...apps.values()].find(
          (row) => row.memberUid === where.memberUid_appId?.memberUid && row.appId === where.memberUid_appId?.appId
        ) ?? null;
  const targetKey = (where: Row) =>
    `${where.appUid_environment?.appUid ?? where.appUid}:${where.appUid_environment?.environment ?? where.environment}`;

  const prisma: any = {
    aiApp: {
      findUnique: jest.fn(async ({ where }) => (findApp(where) ? { ...findApp(where) } : null)),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => [...apps.values()]),
      create: jest.fn(async ({ data }) => {
        const row = { uid: 'app-1', updatedAt: now(), providedEnvVars: [], requiredEnvVars: [], ...data };
        apps.set(row.uid, row);
        return { ...row };
      }),
      upsert: jest.fn(async ({ where, create, update }) => {
        const existing = findApp(where);
        const defined = Object.fromEntries(Object.entries(update).filter(([, v]) => v !== undefined));
        const row = existing
          ? { ...existing, ...defined, updatedAt: now() }
          : { uid: 'app-1', providedEnvVars: [], requiredEnvVars: [], ...create, updatedAt: now() };
        apps.set(row.uid, row);
        return { ...row };
      }),
      update: jest.fn(async ({ where, data }) => {
        const row = { ...findApp(where), ...data, updatedAt: now() };
        apps.set(row.uid, row);
        return { ...row };
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        for (const row of apps.values()) {
          if (matches(row, where)) {
            Object.assign(row, data, { updatedAt: now() });
            count++;
          }
        }
        return { count };
      }),
    },
    aiAppTarget: {
      findMany: jest.fn(async ({ where } = {}) =>
        [...targets.values()].filter((row) =>
          where?.appUid?.in ? where.appUid.in.includes(row.appUid) : matches(row, where)
        )
      ),
      findUnique: jest.fn(async ({ where }) =>
        targets.get(targetKey(where)) ? { ...targets.get(targetKey(where)) } : null
      ),
      upsert: jest.fn(async ({ where, create, update }) => {
        const key = targetKey(where);
        const row = {
          uid: `t-${key}`,
          ...(targets.get(key) ?? create),
          ...(targets.has(key) ? update : {}),
          updatedAt: now(),
        };
        targets.set(key, row);
        return { ...row };
      }),
      update: jest.fn(async ({ where, data }) => {
        const key = where.uid ? [...targets.entries()].find(([, row]) => row.uid === where.uid)?.[0] : targetKey(where);
        const row = { ...targets.get(key as string), ...data, updatedAt: now() };
        targets.set(key as string, row);
        return { ...row };
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        for (const row of targets.values()) {
          if (matches(row, where)) {
            Object.assign(row, data, { updatedAt: now() });
            count++;
          }
        }
        return { count };
      }),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    $executeRaw: jest.fn(async (strings: TemplateStringsArray, phase: string, uid: string, attemptId: string) => {
      const sql = strings.join('?');
      const row = sql.includes('"AiAppTarget"') ? targets.get(`${uid}:preview`) : apps.get(uid);
      if (row && row.deployAttemptId === attemptId) row.deployPhase = phase; // no updatedAt bump
      return row ? 1 : 0;
    }),
    aiAppEvent: {
      create: jest.fn(async ({ data }) => {
        events.push({ ...data, createdAt: now() });
        return {};
      }),
      findMany: jest.fn(async ({ where }) =>
        events.filter((event) => matches(event, where)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      ),
    },
    aiAppAuthGate: { upsert: jest.fn().mockResolvedValue({}) },
    member: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
    aiAppActiveMember: { groupBy: jest.fn().mockResolvedValue([]) },
    aiAppAllowedMember: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const jobs: AiAppDeployJob[] = [];
  const queue = {
    add: jest.fn(async (_name: string, data: AiAppDeployJob['data'], _opts?: Record<string, unknown>) => {
      jobs.push({ data, update: async (next) => void Object.assign(data, next) });
      return {};
    }),
  };
  const pushNotifications = { create: jest.fn().mockResolvedValue({}) };
  const service = new AiAppsService(
    prisma,
    { uploadFileToS3: jest.fn().mockResolvedValue(undefined) } as any,
    pushNotifications as any,
    { trackEvent: jest.fn() } as any,
    queue as any
  );
  return {
    service,
    prisma,
    queue,
    jobs,
    events,
    pushNotifications,
    app: () => apps.get('app-1') as Row,
    preview: () => targets.get('app-1:preview') as Row,
    setApp: (patch: Row) => Object.assign(apps.get('app-1') as Row, patch),
    addEvent: (event: Row) =>
      events.push({ appUid: 'app-1', appId: 'demo', memberUid: OWNER, createdAt: now(), ...event }),
  };
}

const READY_APP: Row = {
  uid: 'app-1',
  memberUid: OWNER,
  appId: 'demo',
  name: 'Demo',
  status: 'READY',
  notes: null,
  failureStream: null,
  s3Key: 'apps/demo/d1/app.zip',
  deploymentId: 'd1',
  url: 'https://demo.example',
  httpUrl: 'http://demo.example',
  host: 'demo.example',
  requiredEnvVars: [],
  providedEnvVars: [],
  lastDeployedAt: new Date('2026-09-01T00:00:00.000Z'),
  access: 'OPEN',
  announcedAt: new Date('2026-09-01T00:00:00.000Z'),
  deployPhase: 'done',
  deployAttemptId: 'attempt-0',
  updatedAt: new Date(),
};

const TIMEOUT = { isAxiosError: true, code: 'ECONNABORTED', message: 'timeout of 120000ms exceeded' };

function successRecord(deploymentId = 'd2') {
  return {
    status: 200,
    data: {
      deployments: [
        {
          id: 'rec-1',
          deployment_id: deploymentId,
          release_name: 'demo',
          status: 'success',
          created_at: new Date().toISOString(),
        },
      ],
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deploy requests answer 202 and queue the pipeline', () => {
  it('agent prod deploy returns DEPLOYING + statusEndpoint + pollIntervalSec without calling the runner', async () => {
    const store = buildStore({ app: READY_APP });

    const result = await store.service.deploy(OWNER, DTO, FILE);

    expect(result).toMatchObject({
      uid: 'app-1',
      status: 'DEPLOYING',
      deploymentId: 'd2',
      statusEndpoint: 'https://api.test/v1/ai-apps/app-1/deployments/d2',
      pollIntervalSec: 10,
    });
    expect(result).not.toHaveProperty('deployAttemptId');
    expect(result).not.toHaveProperty('deployPhase');
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(store.queue.add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = store.queue.add.mock.calls[0];
    expect(name).toBe('deploy');
    expect(opts).toMatchObject({ jobId: data.attemptId, attempts: 1 });
    expect(store.app()).toMatchObject({ status: 'DEPLOYING', deployPhase: 'queued', deployAttemptId: data.attemptId });
    // The pre-attempt state travels with the job, for a lock-rejected restore.
    expect(data.previous).toMatchObject({ status: 'READY', deploymentId: 'd1' });
  });

  it('agent preview deploy points the statusEndpoint at the preview environment', async () => {
    const store = buildStore({ app: READY_APP });

    const result = await store.service.deploy(OWNER, { ...DTO, environment: 'preview' }, FILE);

    expect(result.statusEndpoint).toBe('https://api.test/v1/ai-apps/app-1/deployments/d2?environment=preview');
    expect(result.deployments.preview?.status).toBe('DEPLOYING');
    expect(store.preview()).toMatchObject({ status: 'DEPLOYING', deployPhase: 'queued' });
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('member deploy returns 202 payload after the secret checks', async () => {
    const store = buildStore({ app: READY_APP });

    const result = await store.service.deployDraft(OWNER, 'app-1', undefined);

    expect(result).toMatchObject({ status: 'DEPLOYING', statusEndpoint: expect.stringContaining('/deployments/d1') });
    expect(store.queue.add).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('a queue failure fails the attempt at once and keeps the bundle for a retry', async () => {
    const store = buildStore({ app: READY_APP });
    store.queue.add.mockRejectedValueOnce(new Error('redis down'));

    await expect(store.service.deploy(OWNER, DTO, FILE)).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(store.app()).toMatchObject({
      status: 'ERROR',
      deployPhase: 'failed',
      s3Key: 'apps/demo/d2/app.zip',
      notes: expect.stringContaining('could not be started'),
    });
    expect(store.events.filter((e) => e.type === 'DEPLOY_FAILED')).toHaveLength(1);
  });
});

describe('background deploy job', () => {
  it('runs the pipeline to READY and checkpoints phases without moving updatedAt', async () => {
    const store = buildStore({ app: READY_APP });
    await store.service.deploy(OWNER, DTO, FILE);
    const startedAt = store.app().updatedAt;
    mockedAxios.post.mockImplementation(async () => {
      // The raw-SQL checkpoint landed before the runner call and left updatedAt alone.
      expect(store.app()).toMatchObject({ deployPhase: 'building', updatedAt: startedAt });
      return { status: 200, data: { port: 31001 } };
    });

    await store.service.runDeployJob(store.jobs[0]);

    expect(store.app()).toMatchObject({ status: 'READY', deployPhase: 'done', deploymentId: 'd2' });
    expect(typeof store.jobs[0].data.attemptStartedAt).toBe('number');
    expect(mockedAxios.post.mock.calls[0][2]).toMatchObject({ timeout: 120000 });
  });

  it('treats a runner request timeout as uncertain and settles from the orchestrator record', async () => {
    const store = buildStore({ app: READY_APP });
    await store.service.deploy(OWNER, DTO, FILE);
    mockedAxios.post.mockRejectedValue(TIMEOUT);
    mockedAxios.get.mockResolvedValue(successRecord());

    await store.service.runDeployJob(store.jobs[0]);

    expect(store.app()).toMatchObject({ status: 'READY', deployPhase: 'done' });
  });

  it('resumes past `building` from the orchestrator record without a second /deploy', async () => {
    const store = buildStore({ app: READY_APP });
    await store.service.deploy(OWNER, DTO, FILE);
    const job = store.jobs[0];
    // An earlier run sent the build and died.
    job.data.attemptStartedAt = Date.now();
    store.setApp({ deployPhase: 'building' });
    mockedAxios.get.mockResolvedValue(successRecord());

    await store.service.runDeployJob(job);

    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(store.app()).toMatchObject({ status: 'READY', deployPhase: 'done' });
  });

  it('does nothing for an attempt that already settled', async () => {
    const store = buildStore({ app: READY_APP });
    await store.service.deploy(OWNER, DTO, FILE);
    store.setApp({ status: 'ERROR', deployPhase: 'failed' });
    const writesBefore = store.prisma.aiApp.update.mock.calls.length;

    await store.service.runDeployJob(store.jobs[0]);

    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(store.prisma.aiApp.update.mock.calls.length).toBe(writesBefore);
  });

  it('leaves the row alone when a newer attempt owns it', async () => {
    const store = buildStore({ app: READY_APP });
    await store.service.deploy(OWNER, DTO, FILE);
    store.setApp({ deployAttemptId: 'attempt-newer', status: 'DEPLOYING', deployPhase: 'building' });
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    await store.service.runDeployJob(store.jobs[0]);

    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(store.app()).toMatchObject({ deployAttemptId: 'attempt-newer', status: 'DEPLOYING' });
  });

  it('an old job that finishes after a retry took over cannot overwrite it', async () => {
    const store = buildStore({ app: READY_APP });
    await store.service.deploy(OWNER, DTO, FILE);
    mockedAxios.post.mockImplementation(async () => {
      // Meanwhile the attempt got stuck-settled and the member retried.
      store.setApp({ deployAttemptId: 'attempt-retry', status: 'DEPLOYING', deployPhase: 'building' });
      return { status: 200, data: { port: 31001 } };
    });

    await store.service.runDeployJob(store.jobs[0]);

    expect(store.app()).toMatchObject({ deployAttemptId: 'attempt-retry', status: 'DEPLOYING' });
    expect(store.events.map((e) => e.type)).not.toContain('DEPLOY_SUCCEEDED');
  });

  it('a late success after the stuck sweep still settles READY when no newer attempt exists', async () => {
    const store = buildStore({ app: READY_APP });
    await store.service.deploy(OWNER, DTO, FILE);
    mockedAxios.post.mockRejectedValue(TIMEOUT);
    mockedAxios.get.mockImplementation(async () => {
      store.setApp({ status: 'ERROR', deployPhase: 'failed', notes: 'Deploy timed out' });
      return successRecord();
    });

    await store.service.runDeployJob(store.jobs[0]);

    expect(store.app()).toMatchObject({ status: 'READY', deployPhase: 'done', notes: null });
  });

  it('records a crashed job as a failed attempt instead of leaving it DEPLOYING', async () => {
    const store = buildStore({ app: READY_APP });
    await store.service.deploy(OWNER, DTO, FILE);
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });
    store.prisma.aiAppAuthGate.upsert.mockResolvedValue({});
    const updateMany = store.prisma.aiApp.updateMany.getMockImplementation();
    store.prisma.aiApp.updateMany
      .mockImplementationOnce(async () => {
        throw new Error('connection reset');
      })
      .mockImplementation(updateMany);

    await expect(store.service.runDeployJob(store.jobs[0])).resolves.toBeUndefined();

    expect(store.app()).toMatchObject({ status: 'ERROR', notes: 'Deploy failed: connection reset' });
  });
});

describe('lock-rejected attempt', () => {
  it('restores the previous row, records DEPLOY_FAILED without a notification, and polls as stale ERROR', async () => {
    const store = buildStore({ app: READY_APP });
    await store.service.deploy(OWNER, DTO, FILE);
    mockedAxios.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { error: 'helm_release_locked', message: 'release is already being modified' } },
    });

    await store.service.runDeployJob(store.jobs[0]);

    expect(store.app()).toMatchObject({ status: 'READY', deploymentId: 'd1', s3Key: 'apps/demo/d1/app.zip' });
    const failed = store.events.filter((e) => e.type === 'DEPLOY_FAILED');
    expect(failed).toEqual([
      expect.objectContaining({ deploymentId: 'd2', message: expect.stringContaining('in progress') }),
    ]);
    expect(store.pushNotifications.create).not.toHaveBeenCalled();

    const status = await store.service.getDeploymentStatus(OWNER, 'app-1', 'd2');
    expect(status).toMatchObject({
      deploymentId: 'd2',
      stale: true,
      status: 'ERROR',
      phase: 'failed',
      notes: expect.stringContaining('in progress'),
    });
  });
});

describe('deployment status endpoint', () => {
  it('reports an in-flight deploy from the live row', async () => {
    const store = buildStore({ app: READY_APP });
    await store.service.deploy(OWNER, DTO, FILE);
    store.setApp({ deployPhase: 'building' });

    const status = await store.service.getDeploymentStatus(OWNER, 'app-1', 'd2');

    expect(status).toEqual({
      uid: 'app-1',
      appId: 'demo',
      environment: 'prod',
      deploymentId: 'd2',
      status: 'DEPLOYING',
      phase: 'building',
      notes: null,
      failureStream: null,
      startedAt: expect.any(Date),
      finishedAt: null,
      stale: false,
    });
    expect(status).not.toHaveProperty('url');
    expect(status).not.toHaveProperty('host');
  });

  it('reports a runtime failure with notes, failureStream and finishedAt', async () => {
    const store = buildStore({ app: READY_APP });
    await store.service.deploy(OWNER, { ...DTO, database: { enabled: true, type: 'postgres' } }, FILE);
    mockedAxios.post.mockResolvedValueOnce({ status: 200, data: { port: 31001 } });
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: { apps: [{ appId: 'demo', environment: 'prod', image: 'img' }] },
    });
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: { error: 'pod crash' } },
    });

    await store.service.runDeployJob(store.jobs[0]);
    const status = await store.service.getDeploymentStatus(OWNER, 'app-1', 'latest');

    expect(status).toMatchObject({
      deploymentId: 'd2',
      status: 'ERROR',
      phase: 'failed',
      failureStream: 'runtime',
      notes: expect.stringContaining('Runtime config injection failed'),
      finishedAt: expect.any(Date),
      stale: false,
    });
  });

  it('answers a superseded deployment from its own events with stale: true', async () => {
    const store = buildStore({ app: READY_APP });
    store.addEvent({ type: 'DEPLOY_STARTED', deploymentId: 'd1' });
    store.addEvent({ type: 'DEPLOY_SUCCEEDED', deploymentId: 'd1', message: 'https://demo.example' });
    await store.service.deploy(OWNER, DTO, FILE);

    const status = await store.service.getDeploymentStatus(OWNER, 'app-1', 'd1');

    expect(status).toMatchObject({ deploymentId: 'd1', status: 'READY', phase: 'done', stale: true, notes: null });
  });

  it('settles a stuck deploy on read', async () => {
    const store = buildStore({
      app: {
        ...READY_APP,
        status: 'DEPLOYING',
        deploymentId: 'd2',
        deployPhase: 'building',
        updatedAt: new Date(Date.now() - AI_APPS_DEPLOY_STUCK_MS - 60_000),
      },
    });
    store.addEvent({ type: 'DEPLOY_STARTED', deploymentId: 'd2' });

    const status = await store.service.getDeploymentStatus(OWNER, 'app-1', 'd2');

    expect(status).toMatchObject({
      status: 'ERROR',
      phase: 'failed',
      notes: expect.stringContaining('Deploy timed out'),
    });
  });

  it('404s an unknown deploymentId and an unknown or deleted app; 403s a non-owner', async () => {
    const store = buildStore({ app: READY_APP });
    await expect(store.service.getDeploymentStatus(OWNER, 'app-1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    await expect(store.service.getDeploymentStatus(OWNER, 'missing', 'd1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(store.service.getDeploymentStatus('someone-else', 'app-1', 'd1')).rejects.toBeInstanceOf(
      ForbiddenException
    );
    store.setApp({ status: 'DELETED' });
    await expect(store.service.getDeploymentStatus(OWNER, 'app-1', 'd1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('scopes deployment keys to their own app and environment', async () => {
    const store = buildStore({
      app: READY_APP,
      preview: {
        appUid: 'app-1',
        environment: 'preview',
        uid: 't-preview',
        status: 'DEPLOYING',
        deploymentId: 'p1',
        deployPhase: 'building',
        notes: null,
        failureStream: null,
        updatedAt: new Date(),
      },
    });
    store.addEvent({ type: 'DEPLOY_STARTED', deploymentId: 'p1', message: 'environment=preview' });

    await expect(
      store.service.getDeploymentStatus(OWNER, 'app-1', 'd1', undefined, { appUid: 'other-app', environment: 'prod' })
    ).rejects.toBeInstanceOf(ForbiddenException);

    const status = await store.service.getDeploymentStatus(OWNER, 'app-1', 'latest', undefined, {
      appUid: 'app-1',
      environment: 'preview',
    });
    expect(status).toMatchObject({
      environment: 'preview',
      deploymentId: 'p1',
      status: 'DEPLOYING',
      phase: 'building',
    });
  });
});

describe('controller wiring', () => {
  const proto = AiAppsController.prototype as any;

  it('GET :uid/deployments/:deploymentId is on the agent token guard', () => {
    expect(Reflect.getMetadata(PATH_METADATA, proto.getDeploymentStatus)).toBe(':uid/deployments/:deploymentId');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.getDeploymentStatus)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(GUARDS_METADATA, proto.getDeploymentStatus)).toEqual([AiAppTokenGuard]);
  });

  it('both deploy routes answer 202; draft registration is unchanged', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, proto.deploy)).toBe(HttpStatus.ACCEPTED);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, proto.deployDraft)).toBe(HttpStatus.ACCEPTED);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, proto.registerDraft)).toBeUndefined();
  });
});
