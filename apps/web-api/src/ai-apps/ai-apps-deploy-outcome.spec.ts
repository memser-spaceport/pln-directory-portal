// axios ships ESM (not in the jest transform allowlist); the deploy paths under
// test call it, so mock the calls themselves.
jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  isAxiosError: jest.fn((error: any) => !!error?.isAxiosError),
}));

// Orchestrator-record wait timings, adjustable per test (read lazily through getters).
const mockTimings = { grace: 60_000, deadline: 60_000 };

// The constants module reads env vars at import time; pin the bucket and make
// the orchestrator-record poll spin without waiting.
jest.mock('./ai-apps.constants', () => {
  const actual = jest.requireActual('./ai-apps.constants');
  return {
    ...actual,
    AI_APPS_S3_BUCKET: 'test-bucket',
    AI_APPS_DEPLOY_POLL_INTERVAL_MS: 0,
    get AI_APPS_DEPLOY_REGISTER_GRACE_MS() {
      return mockTimings.grace;
    },
    get AI_APPS_DEPLOY_POLL_DEADLINE_MS() {
      return mockTimings.deadline;
    },
  };
});

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

const LAST_SHIP = new Date('2026-07-01T00:00:00.000Z');
const DATABASE_KEYS = ['DATABASE_URL', 'DB_HOST', 'DB_NAME', 'DB_PASSWORD', 'DB_PORT', 'DB_TYPE', 'DB_USER'];

/** A live app being redeployed: the previous version keeps answering on its URL throughout. */
const APP = {
  uid: 'app-1',
  memberUid: 'creator-1',
  appId: 'demo',
  name: 'Demo',
  status: 'READY',
  notes: null as string | null,
  s3Key: 'apps/demo/d1/app.zip',
  deploymentId: 'd1',
  requiredEnvVars: ['API_KEY', 'OTHER_KEY'],
  providedEnvVars: ['API_KEY', 'OTHER_KEY'],
  database: null as Record<string, unknown> | null,
  lastDeployedAt: LAST_SHIP as Date | null,
  access: 'OPEN',
  announcedAt: LAST_SHIP as Date | null,
  failureStream: null as string | null,
  updatedAt: new Date(),
};

function buildService(app: Record<string, any> = APP) {
  const prisma = {
    aiApp: {
      findUnique: jest.fn().mockResolvedValue(app),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([app]),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...APP, ...app, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    aiAppEvent: { create: jest.fn().mockResolvedValue({}) },
    member: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    aiAppActiveMember: { groupBy: jest.fn().mockResolvedValue([]) },
    aiAppAllowedMember: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new AiAppsService(
    prisma as any,
    { uploadFileToS3: jest.fn() } as any,
    { create: jest.fn().mockResolvedValue({}) } as any,
    { trackEvent: jest.fn() } as any
  );
  return { service, prisma };
}

/** Helm values as the orchestrator stores them on a record that attached these secret keys. */
function valuesWithKeys(keys: string[]) {
  return { runtimeSecrets: { enabled: true, existingSecretName: 'prod-demo-runtime-secrets', keys, checksum: 'x' } };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rec-1',
    deployment_id: 'd1',
    release_name: 'demo',
    status: 'running',
    error: null,
    values: {},
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

const TIMEOUT = { isAxiosError: true, response: undefined, code: 'ECONNABORTED' };

interface RunnerScript {
  /** `/deploy` outcome: a rejection (timeout, 409…) or a 2xx body. */
  deploy: { reject: unknown } | { data: Record<string, unknown> };
  /** Successive deployments-list responses (the last one repeats). */
  lists?: Array<Record<string, unknown>[]>;
  /** Events of `GET /v1/deployments/rec-1`. */
  events?: Array<{ type: string }>;
}

/** Routes runner/app calls by URL. The app URL itself always answers 200 (previous version serving). */
function scriptRunner(script: RunnerScript) {
  let listCall = 0;
  mockedAxios.post.mockImplementation((url: string) => {
    if (url.endsWith('/deploy')) {
      return 'reject' in script.deploy
        ? Promise.reject(script.deploy.reject)
        : Promise.resolve({ status: 200, data: script.deploy.data });
    }
    if (url.includes('/deployments')) {
      return Promise.resolve({ status: 200, data: { status: 'success' } });
    }
    return Promise.resolve({ status: 200, data: { ok: true } });
  });
  mockedAxios.get.mockImplementation(async (url: string) => {
    if (url.endsWith('/deployments')) {
      const lists = script.lists ?? [[]];
      const list = lists[Math.min(listCall++, lists.length - 1)];
      return { status: 200, data: { project: 'default', deployments: list } };
    }
    if (url.includes('/v1/deployments/')) {
      return { status: 200, data: { ...record(), events: script.events ?? [] } };
    }
    if (url.endsWith('/apps')) {
      return { status: 200, data: { apps: [{ app_id: 'demo', release_name: 'demo', image: 'ecr/apps:demo-d1' }] } };
    }
    if (url.endsWith('/_pln/gate')) {
      return { status: 404, data: '' };
    }
    return { status: 200, data: 'previous version' };
  });
}

/** POSTs to the secret-aware runtime-config deployments endpoint. */
function injectionCalls() {
  return mockedAxios.post.mock.calls.filter(([url]) => (url as string).includes('/v1/projects/default/deployments'));
}

function writes(prisma: any): Record<string, any>[] {
  return prisma.aiApp.update.mock.calls.map(([{ data }]: any) => data);
}

function restoredRows(prisma: any): Record<string, any>[] {
  return prisma.aiApp.updateMany.mock.calls.map(([{ data }]: any) => data);
}

function eventTypes(prisma: any): string[] {
  return prisma.aiAppEvent.create.mock.calls.map(([{ data }]: any) => data.type);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTimings.grace = 60_000;
  mockTimings.deadline = 60_000;
});

describe('uncertain /deploy settled from the orchestrator deployment record', () => {
  it('redeploy: waits through running → success, then READY without a secrets deploy when the build attached them', async () => {
    const { service, prisma } = buildService();
    scriptRunner({
      deploy: { reject: TIMEOUT },
      lists: [[], [record()], [record({ status: 'success', values: valuesWithKeys(['API_KEY', 'OTHER_KEY']) })]],
    });

    await service.deployDraft('creator-1', 'app-1', undefined);

    const listCalls = mockedAxios.get.mock.calls.filter(([url]) => (url as string).endsWith('/deployments'));
    expect(listCalls).toHaveLength(3);
    expect(listCalls[0][1]).toMatchObject({ params: { appId: 'demo' } });
    expect(injectionCalls()).toHaveLength(0);
    expect(writes(prisma).map((d) => d.status)).toEqual(['DEPLOYING', 'READY']);
    expect(eventTypes(prisma).filter((t) => t === 'DEPLOY_SUCCEEDED')).toHaveLength(1);
  });

  it('redeploy: a failed record without build.success is a build failure even though the app answers', async () => {
    const { service, prisma } = buildService();
    scriptRunner({
      deploy: { reject: TIMEOUT },
      lists: [[record({ status: 'failed', error: 'kaniko: COPY failed' })]],
      events: [{ type: 'build.started' }, { type: 'deployment.failed' }],
    });

    await expect(service.deployDraft('creator-1', 'app-1', undefined)).rejects.toThrow();

    const error = writes(prisma).find((d) => d.status === 'ERROR');
    expect(error).toMatchObject({ failureStream: 'build', notes: 'Runner error: kaniko: COPY failed' });
    expect(writes(prisma).some((d) => d.status === 'READY' || 'lastDeployedAt' in d)).toBe(false);
    expect(injectionCalls()).toHaveLength(0);
    expect(eventTypes(prisma)).toContain('DEPLOY_FAILED');
  });

  it('a failed record after build.success is a runtime failure', async () => {
    const { service, prisma } = buildService();
    scriptRunner({
      deploy: { reject: TIMEOUT },
      lists: [[record({ status: 'failed', error: 'helm: timed out waiting for the condition' })]],
      events: [{ type: 'build.started' }, { type: 'build.success' }, { type: 'deployment.failed' }],
    });

    await expect(service.deployDraft('creator-1', 'app-1', undefined)).rejects.toThrow();

    expect(writes(prisma).find((d) => d.status === 'ERROR')).toMatchObject({ failureStream: 'runtime' });
  });

  it('ignores an earlier record with the same deploymentId and a record of another release', async () => {
    const { service, prisma } = buildService();
    const earlier = record({
      id: 'rec-old',
      status: 'success',
      values: valuesWithKeys(['API_KEY', 'OTHER_KEY']),
      created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });
    const preview = record({ id: 'rec-preview', release_name: 'demo-preview', status: 'success' });
    scriptRunner({
      deploy: { reject: TIMEOUT },
      lists: [
        [preview, earlier],
        [record({ status: 'failed', error: 'kaniko: COPY failed' }), preview, earlier],
      ],
    });

    await expect(service.deployDraft('creator-1', 'app-1', undefined)).rejects.toThrow();

    expect(writes(prisma).find((d) => d.status === 'ERROR')).toMatchObject({
      notes: 'Runner error: kaniko: COPY failed',
    });
  });

  it('no record within the grace window → ERROR "could not be confirmed", stream unset', async () => {
    mockTimings.grace = 20;
    const { service, prisma } = buildService();
    scriptRunner({ deploy: { reject: TIMEOUT }, lists: [[]] });

    await expect(service.deployDraft('creator-1', 'app-1', undefined)).rejects.toThrow();

    const error = writes(prisma).find((d) => d.status === 'ERROR');
    expect(error?.notes).toMatch(/^Deploy outcome could not be confirmed: the runner has no record/);
    expect(error?.failureStream).toBeNull();
  });

  it('record still running at the deadline → ERROR "could not be confirmed", stream unset', async () => {
    mockTimings.deadline = 30;
    const { service, prisma } = buildService();
    scriptRunner({ deploy: { reject: TIMEOUT }, lists: [[record()]] });

    await expect(service.deployDraft('creator-1', 'app-1', undefined)).rejects.toThrow();

    const error = writes(prisma).find((d) => d.status === 'ERROR');
    expect(error?.notes).toMatch(
      /^Deploy outcome could not be confirmed: the runner still reports this deploy as running/
    );
    expect(error?.failureStream).toBeNull();
    expect(injectionCalls()).toHaveLength(0);
  });

  it('transient poll errors are retried, not treated as an outcome', async () => {
    const { service, prisma } = buildService();
    scriptRunner({
      deploy: { reject: TIMEOUT },
      lists: [[record({ status: 'success', values: valuesWithKeys(['API_KEY', 'OTHER_KEY']) })]],
    });
    const routed = mockedAxios.get.getMockImplementation()!;
    mockedAxios.get
      .mockImplementationOnce(() =>
        Promise.reject({ isAxiosError: true, response: { status: 502, data: 'bad gateway' } })
      )
      .mockImplementation(routed);

    await service.deployDraft('creator-1', 'app-1', undefined);

    expect(writes(prisma).map((d) => d.status)).toEqual(['DEPLOYING', 'READY']);
  });
});

describe('concurrent deploy conflict', () => {
  it('/deploy 409 helm_release_locked restores the previous row and does not wait on a record', async () => {
    const { service, prisma } = buildService();
    scriptRunner({
      deploy: {
        reject: {
          isAxiosError: true,
          response: {
            status: 409,
            data: {
              error: 'helm_release_locked',
              message: 'Helm release "demo" in namespace "deployment-system-prod" is already being modified',
            },
          },
        },
      },
    });

    await expect(service.deployDraft('creator-1', 'app-1', undefined)).rejects.toThrow(/still in progress/);

    expect(restoredRows(prisma)[0]).toMatchObject({ status: 'READY', deploymentId: 'd1', failureStream: null });
    expect(eventTypes(prisma)).not.toContain('DEPLOY_FAILED');
    expect(writes(prisma).some((data) => data.status === 'ERROR')).toBe(false);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('a lock conflict leaves a row another attempt already settled', async () => {
    const { service, prisma } = buildService();
    prisma.aiApp.updateMany.mockResolvedValue({ count: 0 });
    scriptRunner({
      deploy: {
        reject: {
          isAxiosError: true,
          response: {
            status: 409,
            data: {
              error: 'helm_release_locked',
              message: 'Helm release "demo" in namespace "deployment-system-prod" is already being modified',
            },
          },
        },
      },
    });

    await expect(service.deployDraft('creator-1', 'app-1', undefined)).rejects.toThrow(/still in progress/);

    expect(eventTypes(prisma)).not.toContain('DEPLOY_FAILED');
    expect(writes(prisma).some((data) => data.status === 'ERROR')).toBe(false);
  });

  it('an orchestrator that still answers 500 with the lock text is also a conflict', async () => {
    const { service, prisma } = buildService();
    scriptRunner({
      deploy: {
        reject: {
          isAxiosError: true,
          response: {
            status: 500,
            data: { error: 'Helm release "demo" in namespace "deployment-system-prod" is already being modified' },
          },
        },
      },
    });

    await expect(service.deployDraft('creator-1', 'app-1', undefined)).rejects.toThrow(/still in progress/);

    expect(restoredRows(prisma)[0]).toMatchObject({ status: 'READY', deploymentId: 'd1' });
    expect(eventTypes(prisma)).not.toContain('DEPLOY_FAILED');
  });

  it('a polled record failed on the release lock is a conflict, not a build failure', async () => {
    const { service, prisma } = buildService();
    scriptRunner({
      deploy: { reject: TIMEOUT },
      lists: [
        [
          record({
            status: 'failed',
            error: 'Helm release "demo" in namespace "deployment-system-prod" is already being modified',
          }),
        ],
      ],
    });

    await expect(service.deployDraft('creator-1', 'app-1', undefined)).rejects.toThrow(/still in progress/);

    expect(restoredRows(prisma)[0]).toMatchObject({ status: 'READY', deploymentId: 'd1' });
    expect(eventTypes(prisma)).not.toContain('DEPLOY_FAILED');
    expect(writes(prisma).find((data) => data.status === 'ERROR')).toBeUndefined();
  });

  it('other /deploy errors stay build failures', async () => {
    const { service, prisma } = buildService();
    scriptRunner({
      deploy: { reject: { isAxiosError: true, response: { status: 500, data: { error: 'kaniko blew up' } } } },
    });

    await expect(service.deployDraft('creator-1', 'app-1', undefined)).rejects.toThrow();

    expect(writes(prisma).find((d) => d.status === 'ERROR')).toMatchObject({
      failureStream: 'build',
      notes: 'Runner error: 500 kaniko blew up',
    });
  });
});

describe('runtime-config injection gating', () => {
  it('runs one secrets deploy, after the build record is success, when a required secret is not attached', async () => {
    const { service, prisma } = buildService();
    scriptRunner({
      deploy: { reject: TIMEOUT },
      lists: [[record()], [record({ status: 'success', values: valuesWithKeys(['API_KEY']) })]],
    });

    await service.deployDraft('creator-1', 'app-1', undefined);

    const calls = injectionCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({ appId: 'demo', secretNames: ['API_KEY', 'OTHER_KEY'] });
    // The injection POST came after the last deployments-list poll (the build had finished).
    const injectOrder = mockedAxios.post.mock.invocationCallOrder[mockedAxios.post.mock.calls.indexOf(calls[0])];
    const lastListOrder = Math.max(
      ...mockedAxios.get.mock.calls.map(([url], i) =>
        (url as string).endsWith('/deployments') ? mockedAxios.get.mock.invocationCallOrder[i] : 0
      )
    );
    expect(injectOrder).toBeGreaterThan(lastListOrder);
    expect(writes(prisma).map((d) => d.status)).toEqual(['DEPLOYING', 'READY']);
  });

  it('runs the secrets deploy when the build record attached nothing (first secret-aware deploy)', async () => {
    const { service } = buildService();
    scriptRunner({ deploy: { reject: TIMEOUT }, lists: [[record({ status: 'success', values: {} })]] });

    await service.deployDraft('creator-1', 'app-1', undefined);

    expect(injectionCalls()).toHaveLength(1);
  });

  it('database enabled without DATABASE_URL attached → injection requests the database', async () => {
    const { service } = buildService({ ...APP, database: { enabled: true, type: 'postgres' } });
    scriptRunner({
      deploy: { reject: TIMEOUT },
      lists: [[record({ status: 'success', values: valuesWithKeys(['API_KEY', 'OTHER_KEY']) })]],
    });

    await service.deployDraft('creator-1', 'app-1', undefined);

    expect(injectionCalls()).toHaveLength(1);
    expect(injectionCalls()[0][1]).toMatchObject({ database: { enabled: true, type: 'postgres' } });
  });

  it('database enabled with its credentials attached → no injection', async () => {
    const { service } = buildService({ ...APP, database: { enabled: true, type: 'postgres' } });
    scriptRunner({
      deploy: { reject: TIMEOUT },
      lists: [[record({ status: 'success', values: valuesWithKeys(['API_KEY', 'OTHER_KEY', ...DATABASE_KEYS]) })]],
    });

    await service.deployDraft('creator-1', 'app-1', undefined);

    expect(injectionCalls()).toHaveLength(0);
  });

  it('direct 2xx /deploy whose deployment record attached every secret → no injection, no polling', async () => {
    const { service, prisma } = buildService();
    scriptRunner({
      deploy: {
        data: {
          status: 'ready',
          authGateVersion: 2,
          deployment: record({ status: 'success', values: valuesWithKeys(['API_KEY', 'OTHER_KEY']) }),
        },
      },
    });

    await service.deployDraft('creator-1', 'app-1', undefined);

    expect(injectionCalls()).toHaveLength(0);
    expect(mockedAxios.get.mock.calls.some(([url]) => (url as string).endsWith('/deployments'))).toBe(false);
    expect(writes(prisma).map((d) => d.status)).toEqual(['DEPLOYING', 'READY']);
  });

  it('direct 2xx /deploy without a deployment record → injection runs', async () => {
    const { service } = buildService();
    scriptRunner({ deploy: { data: { port: 31001 } } });

    await service.deployDraft('creator-1', 'app-1', undefined);

    expect(injectionCalls()).toHaveLength(1);
  });
});
