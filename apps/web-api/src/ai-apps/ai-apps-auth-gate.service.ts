import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../shared/prisma.service';
import {
  AI_APPS_AUTH_GATE_CURRENT_VERSION,
  AI_APPS_RUNNER_TOKEN,
  AI_APPS_RUNNER_URL,
  AiAppTargetEnvironment,
  buildAppUrl,
} from './ai-apps.constants';
import { AiAppsService } from './ai-apps.service';

/** Helm upgrades wait for rollout (`--wait --atomic`, up to the orchestrator's 15 min timeout). */
const RUNNER_GATE_TIMEOUT_MS = 20 * 60 * 1000;
const PROBE_TIMEOUT_MS = 10 * 1000;

export type AuthGateRefreshResult = {
  release: string;
  previousRevision: number;
  revision: number;
  authGateVersion: number;
};

export type AuthGateTarget = {
  appUid: string;
  appId: string;
  target: AiAppTargetEnvironment;
  status: string;
  gateVersion: number;
  refreshedAt: Date | null;
  lastError: string | null;
  eligible: boolean;
};

export type AuthGateOutcome = {
  appUid: string;
  appId: string;
  target: AiAppTargetEnvironment;
  result: 'refreshed' | 'rolled_back' | 'failed' | 'skipped' | 'dry_run';
  detail?: string;
};

/** Statuses whose release is (or may still be) serving: a refresh keeps it serving with the new gate. */
const REFRESHABLE_STATUSES = new Set(['READY', 'ERROR']);

/**
 * Silent fleet migration to the current auth gate (LAB-2695, design D8/D9). Each target's release is upgraded in
 * place by the orchestrator with the same image and values, only the gate changes, then verified and rolled back on
 * any mismatch. Nothing an owner sees changes: no status, updatedAt, event or notification is written.
 */
@Injectable()
export class AiAppsAuthGateService {
  private readonly logger = new Logger(AiAppsAuthGateService.name);

  constructor(private readonly prisma: PrismaService, private readonly aiAppsService: AiAppsService) {}

  private runnerHeaders() {
    return { 'Content-Type': 'application/json', 'x-runner-token': AI_APPS_RUNNER_TOKEN };
  }

  async refreshAuthGate(
    appId: string,
    target: AiAppTargetEnvironment,
    gateOverrides?: Record<string, unknown>
  ): Promise<AuthGateRefreshResult> {
    const { data } = await axios.post<AuthGateRefreshResult>(
      `${AI_APPS_RUNNER_URL}/v1/apps/${encodeURIComponent(appId)}/auth-gate/refresh`,
      { target, ...(gateOverrides ? { gateOverrides } : {}) },
      { headers: this.runnerHeaders(), timeout: RUNNER_GATE_TIMEOUT_MS }
    );
    return data;
  }

  async rollbackAuthGate(appId: string, target: AiAppTargetEnvironment, toRevision: number): Promise<void> {
    await axios.post(
      `${AI_APPS_RUNNER_URL}/v1/apps/${encodeURIComponent(appId)}/auth-gate/rollback`,
      { target, toRevision },
      { headers: this.runnerHeaders(), timeout: RUNNER_GATE_TIMEOUT_MS }
    );
  }

  /** Unauthenticated status of an app URL, as a visitor without a session would see it (0 = unreachable). */
  private async probe(url: string): Promise<number> {
    try {
      const res = await axios.get(url, { timeout: PROBE_TIMEOUT_MS, validateStatus: () => true, maxRedirects: 0 });
      return res.status;
    } catch {
      return 0;
    }
  }

  private async gateVersionServed(baseUrl: string): Promise<number | null> {
    try {
      const res = await axios.get(`${baseUrl}/_pln/gate`, { timeout: PROBE_TIMEOUT_MS, validateStatus: () => true });
      return res.status === 200 && typeof res.data?.version === 'number' ? res.data.version : null;
    } catch {
      return null;
    }
  }

  /** Every target of every live app, with its gate state and whether it can be refreshed now. */
  async listFleet(): Promise<AuthGateTarget[]> {
    const apps = await this.prisma.aiApp.findMany({
      where: { status: { notIn: ['DELETED'] } },
      select: { uid: true, appId: true, status: true, lastDeployedAt: true },
    });
    const uids = apps.map((a) => a.uid);
    const [targets, gates] = await Promise.all([
      (this.prisma as any).aiAppTarget?.findMany
        ? (this.prisma as any).aiAppTarget.findMany({
            where: { appUid: { in: uids }, environment: 'preview' },
            select: { appUid: true, status: true, lastDeployedAt: true },
          })
        : [],
      this.prisma.aiAppAuthGate.findMany({ where: { appUid: { in: uids } } }),
    ]);
    const gateOf = (appUid: string, target: AiAppTargetEnvironment) =>
      gates.find((g) => g.appUid === appUid && g.environment === target);
    const row = (
      app: { uid: string; appId: string },
      target: AiAppTargetEnvironment,
      status: string,
      lastDeployedAt: Date | null
    ): AuthGateTarget => {
      const gate = gateOf(app.uid, target);
      const gateVersion = gate?.version ?? 1;
      return {
        appUid: app.uid,
        appId: app.appId,
        target,
        status,
        gateVersion,
        refreshedAt: gate?.refreshedAt ?? null,
        lastError: gate?.lastError ?? null,
        eligible:
          REFRESHABLE_STATUSES.has(status) && !!lastDeployedAt && gateVersion < AI_APPS_AUTH_GATE_CURRENT_VERSION,
      };
    };
    const fleet: AuthGateTarget[] = apps.map((app) => row(app, 'prod', app.status, app.lastDeployedAt));
    for (const t of targets as Array<{ appUid: string; status: string; lastDeployedAt: Date | null }>) {
      const app = apps.find((a) => a.uid === t.appUid);
      if (app) fleet.push(row(app, 'preview', t.status, t.lastDeployedAt));
    }
    return fleet;
  }

  /** Refreshes the chosen (or the next `batchSize` eligible) targets one at a time, stopping at `maxFailures`. */
  async refreshBatch(options: {
    appUids?: string[];
    target?: AiAppTargetEnvironment;
    batchSize?: number;
    dryRun?: boolean;
    maxFailures?: number;
    gateOverrides?: Record<string, unknown>;
  }): Promise<AuthGateOutcome[]> {
    const maxFailures = options.maxFailures ?? 1;
    let candidates = (await this.listFleet()).filter((t) => t.eligible);
    if (options.appUids?.length) candidates = candidates.filter((t) => options.appUids!.includes(t.appUid));
    if (options.target) candidates = candidates.filter((t) => t.target === options.target);
    candidates = candidates.slice(0, options.batchSize ?? candidates.length);

    const outcomes: AuthGateOutcome[] = [];
    let failures = 0;
    for (const candidate of candidates) {
      if (failures >= maxFailures) break;
      if (options.dryRun) {
        outcomes.push({ ...this.ids(candidate), result: 'dry_run' });
        continue;
      }
      const outcome = await this.refreshOne(candidate, options.gateOverrides);
      outcomes.push(outcome);
      if (outcome.result === 'failed' || outcome.result === 'rolled_back') failures += 1;
    }
    return outcomes;
  }

  private ids(t: Pick<AuthGateTarget, 'appUid' | 'appId' | 'target'>) {
    return { appUid: t.appUid, appId: t.appId, target: t.target };
  }

  private async currentStatus(t: AuthGateTarget): Promise<string | null> {
    if (t.target === 'prod') {
      return (
        (await this.prisma.aiApp.findUnique({ where: { uid: t.appUid }, select: { status: true } }))?.status ?? null
      );
    }
    const table = (this.prisma as any).aiAppTarget;
    const row = await table?.findUnique({
      where: { appUid_environment: { appUid: t.appUid, environment: 'preview' } },
      select: { status: true },
    });
    return row?.status ?? null;
  }

  private async refreshOne(t: AuthGateTarget, gateOverrides?: Record<string, unknown>): Promise<AuthGateOutcome> {
    const status = await this.currentStatus(t);
    if (!status || !REFRESHABLE_STATUSES.has(status)) {
      return { ...this.ids(t), result: 'skipped', detail: `status ${status ?? 'unknown'}` };
    }
    const baseUrl = buildAppUrl(t.appId, t.target);
    const before = { root: await this.probe(`${baseUrl}/`), health: await this.probe(`${baseUrl}/_health`) };

    let refreshed: AuthGateRefreshResult;
    try {
      refreshed = await this.refreshAuthGate(t.appId, t.target, gateOverrides);
    } catch (error) {
      const detail = this.errorText(error);
      // No release serves this target any more (e.g. a stale ERROR row): nothing to migrate, not a failure.
      if ((error as any)?.response?.status === 404) {
        return { ...this.ids(t), result: 'skipped', detail };
      }
      await this.recordGate(t, { lastError: `refresh failed: ${detail}` });
      return { ...this.ids(t), result: 'failed', detail };
    }

    const after = {
      root: await this.probe(`${baseUrl}/`),
      health: await this.probe(`${baseUrl}/_health`),
      gate: await this.gateVersionServed(baseUrl),
    };
    const problems = [
      after.gate !== refreshed.authGateVersion ? `gate reports ${after.gate ?? 'nothing'}` : null,
      after.health !== 200 ? `/_health ${after.health}` : null,
      after.root !== before.root ? `/ ${before.root} -> ${after.root}` : null,
    ].filter(Boolean);

    if (problems.length) {
      const detail = problems.join('; ');
      try {
        await this.rollbackAuthGate(t.appId, t.target, refreshed.previousRevision);
      } catch (error) {
        await this.recordGate(t, { lastError: `verify failed (${detail}); rollback failed: ${this.errorText(error)}` });
        return { ...this.ids(t), result: 'failed', detail: `${detail}; rollback failed` };
      }
      await this.recordGate(t, { lastError: `verify failed, rolled back: ${detail}` });
      return { ...this.ids(t), result: 'rolled_back', detail };
    }

    await this.recordGate(t, {
      version: refreshed.authGateVersion,
      refreshedAt: new Date(),
      previousRevision: refreshed.previousRevision,
      lastError: null,
    });
    await this.markGateFlagsReady(t);
    return {
      ...this.ids(t),
      result: 'refreshed',
      detail: `${refreshed.release} r${refreshed.previousRevision} -> r${refreshed.revision}`,
    };
  }

  /** Rolls one target back to the revision recorded before its last gate refresh. */
  async rollbackOne(appUid: string, target: AiAppTargetEnvironment): Promise<AuthGateOutcome> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid: appUid }, select: { uid: true, appId: true } });
    const gate = await this.prisma.aiAppAuthGate.findUnique({
      where: { appUid_environment: { appUid, environment: target } },
    });
    if (!app || !gate?.previousRevision) {
      return { appUid, appId: app?.appId ?? '', target, result: 'skipped', detail: 'no recorded gate refresh' };
    }
    const t = { appUid, appId: app.appId, target };
    try {
      await this.rollbackAuthGate(app.appId, target, gate.previousRevision);
    } catch (error) {
      return { ...t, result: 'failed', detail: this.errorText(error) };
    }
    await this.prisma.aiAppAuthGate.update({
      where: { appUid_environment: { appUid, environment: target } },
      data: { version: 1, previousRevision: null, lastError: 'rolled back by an admin' },
    });
    return { ...t, result: 'rolled_back' };
  }

  private async recordGate(
    t: Pick<AuthGateTarget, 'appUid' | 'target'>,
    data: { version?: number; refreshedAt?: Date; previousRevision?: number; lastError?: string | null }
  ) {
    await this.prisma.aiAppAuthGate.upsert({
      where: { appUid_environment: { appUid: t.appUid, environment: t.target } },
      create: { appUid: t.appUid, environment: t.target, version: data.version ?? 1, ...data },
      update: data,
    });
  }

  /**
   * The gate-ready flags a normal deploy sets, set here with plain SQL: Prisma only applies `@updatedAt` through its
   * client, so the app's "Last updated" and the LabOS iframe remount are left alone.
   */
  private async markGateFlagsReady(t: Pick<AuthGateTarget, 'appUid' | 'target'>) {
    if (t.target === 'prod') {
      await this.prisma
        .$executeRaw`UPDATE "AiApp" SET "directLinkGateReady" = true, "publicPathsGateReady" = true WHERE "uid" = ${t.appUid}`;
    } else {
      await this.prisma
        .$executeRaw`UPDATE "AiAppTarget" SET "directLinkGateReady" = true, "publicPathsGateReady" = true WHERE "appUid" = ${t.appUid} AND "environment" = 'preview'`;
    }
  }

  private errorText(error: unknown): string {
    const e = error as any;
    const body = e?.response?.data;
    const text =
      typeof body?.error === 'string' ? body.error : typeof body?.message === 'string' ? body.message : e?.message;
    return `${e?.response?.status ?? ''} ${text ?? 'unknown error'}`.trim().slice(0, 500);
  }

  /** Admin gate for the rollout endpoints. */
  isDirectoryAdmin(requesterUid: string): Promise<boolean> {
    return this.aiAppsService.isRequesterAdmin(requesterUid);
  }
}
