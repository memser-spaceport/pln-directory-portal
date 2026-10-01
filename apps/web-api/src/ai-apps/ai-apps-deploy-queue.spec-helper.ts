import { AiAppDeployJob, AiAppsService } from './ai-apps.service';

type Row = Record<string, unknown>;

interface DeployHarness {
  jobs: AiAppDeployJob[];
  queue: { add: jest.Mock };
}

const HARNESS = Symbol('deployHarness');

/**
 * Test harness for the background deploy job, for specs that hand-roll their
 * prisma mocks:
 * - a fake queue that captures queued attempts (`queue.add`);
 * - rows follow what the service wrote to them (the fields of every tracked
 *   `update`/`upsert`, overlaid on later `findUnique` results), so the job sees
 *   its own `deployAttemptId`/`deployPhase` like it would in the DB;
 * - attempt-scoped writes (`updateMany` where only `uid`/`deployAttemptId`
 *   match) are refused when another attempt owns the row, and otherwise go
 *   through `update`, so assertions on `update` data keep seeing the terminal
 *   READY/ERROR writes. Conditional writes that also match on `status` stay on
 *   the spec's own `updateMany` mock (its configured `count` decides).
 */
export function installDeployQueue(service: AiAppsService, prisma: any): DeployHarness {
  const jobs: AiAppDeployJob[] = [];
  const queue = {
    add: jest.fn(async (_name: string, data: AiAppDeployJob['data']) => {
      jobs.push({
        data,
        update: async (next) => {
          Object.assign(data, next);
        },
      });
      return {};
    }),
  };
  (service as any).deployQueue = queue;
  prisma.$executeRaw = prisma.$executeRaw ?? jest.fn().mockResolvedValue(1);

  trackModel(
    prisma.aiApp,
    (where) => where?.uid as string | undefined,
    (key) => ({ uid: key })
  );
  if (prisma.aiAppTarget) {
    trackModel(
      prisma.aiAppTarget,
      (where) => {
        const compound = where?.appUid_environment as Row | undefined;
        const appUid = (compound?.appUid ?? where?.appUid) as string | undefined;
        const environment = (compound?.environment ?? where?.environment) as string | undefined;
        return appUid && environment ? `${appUid}:${environment}` : undefined;
      },
      (key) => {
        const [appUid, environment] = key.split(':');
        return { appUid_environment: { appUid, environment } };
      }
    );
  }

  const harness = { jobs, queue };
  (service as any)[HARNESS] = harness;
  return harness;
}

function trackModel(
  model: any,
  keyOf: (where: Row | undefined) => string | undefined,
  uniqueWhere: (key: string) => Row
): void {
  if (!model) return;
  const rows = new Map<string, Row>();
  const remember = (key: string | undefined, data: Row | undefined) => {
    if (!key || !data) return;
    rows.set(key, { ...(rows.get(key) ?? {}), ...data });
  };
  // A row the service wrote exists even when the spec's findUnique mock says null (first-ever deploy).
  const overlay = (key: string | undefined, result: any) =>
    key && rows.has(key) && (result == null || typeof result === 'object')
      ? { ...(result ?? {}), ...rows.get(key) }
      : result;

  const originalUpdate = model.update;
  if (originalUpdate) {
    model.update = jest.fn(async (args: any) => {
      const result = await originalUpdate(args);
      // The mock's returned row is what the "DB" now holds (specs may swap in an untracked upsert mock).
      remember(keyOf(args?.where), { ...(result && typeof result === 'object' ? result : {}), ...args?.data });
      return overlay(keyOf(args?.where), result);
    });
  }
  const originalUpsert = model.upsert;
  if (originalUpsert) {
    model.upsert = jest.fn(async (args: any) => {
      const result = await originalUpsert(args);
      const key = keyOf(args?.where) ?? keyOf(result);
      remember(key, result);
      return result;
    });
  }
  const originalFindUnique = model.findUnique;
  if (originalFindUnique) {
    model.findUnique = jest.fn(async (args: any) => overlay(keyOf(args?.where), await originalFindUnique(args)));
  }
  const originalUpdateMany = model.updateMany;
  model.updateMany = jest.fn(async (args: any) => {
    const where = (args?.where ?? {}) as Row;
    const key = keyOf(where);
    if (key && 'deployAttemptId' in where) {
      const owner = rows.get(key)?.deployAttemptId;
      if (owner !== undefined && owner !== where.deployAttemptId) {
        return { count: 0 };
      }
      if (!('status' in where)) {
        await model.update({ where: uniqueWhere(key), data: args.data });
        return { count: 1 };
      }
    }
    const result = originalUpdateMany ? await originalUpdateMany(args) : { count: 1 };
    if (result?.count) remember(key, args?.data);
    return result;
  });
}

/** Runs every queued deploy job in order; returns the last job's result, rethrowing the pipeline's errors. */
export async function runQueuedDeploys(service: AiAppsService): Promise<any> {
  const harness = (service as any)[HARNESS] as DeployHarness | undefined;
  if (!harness) throw new Error('installDeployQueue() was not called for this service');
  let result: unknown = null;
  while (harness.jobs.length) {
    const job = harness.jobs.shift() as AiAppDeployJob;
    result = await service.executeDeployJob(job);
  }
  return result;
}

/**
 * Awaits a deploy request (202 payload) and then runs its background job, so
 * outcome assertions read the settled result the synchronous flow used to return.
 */
export async function settleDeploy(service: AiAppsService, request: Promise<unknown>): Promise<any> {
  await request;
  return runQueuedDeploys(service);
}

/**
 * For specs written against the synchronous deploy flow: installs the harness
 * and makes `deploy`/`deployDraft` resolve with the background job's settled
 * result (or reject with its error), so their outcome assertions stay as they
 * were. The 202 contract itself is covered by ai-apps-async-deploy.spec.ts.
 */
export function withInlineDeploys(prisma: any, service: AiAppsService): AiAppsService {
  installDeployQueue(service, prisma);
  const deploy = service.deploy.bind(service);
  const deployDraft = service.deployDraft.bind(service);
  (service as any).deploy = (...args: Parameters<AiAppsService['deploy']>) => settleDeploy(service, deploy(...args));
  (service as any).deployDraft = (...args: Parameters<AiAppsService['deployDraft']>) =>
    settleDeploy(service, deployDraft(...args));
  return service;
}
