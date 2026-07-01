import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { AiApp, AiAppEvent, AiAppEventType } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { AwsService } from '../utils/aws/aws.service';
import { DeployAppDto } from './dto/deploy-app.dto';
import {
  AI_APPS_RUNNER_TOKEN,
  AI_APPS_RUNNER_URL,
  AI_APPS_S3_BUCKET,
  buildAppHost,
  buildAppHttpUrl,
  buildAppS3Key,
  buildAppUrl,
} from './ai-apps.constants';

/** Edge/gateway statuses that mean "the runner may still have finished" — verify, don't fail. */
const GATEWAY_TIMEOUT_STATUSES = [408, 502, 503, 504, 521, 522, 523, 524];
/** How long to wait for the app to come up after a runner timeout. */
const VERIFY_ATTEMPTS = 8;
const VERIFY_INTERVAL_MS = 8000;

interface RunnerDeployResponse {
  status?: string;
  host?: string;
  url?: string;
  httpUrl?: string;
  port?: number;
}

type AiAppMember = { uid: string; name: string };

/** Response shape across all AI Apps endpoints: `memberUid` replaced by `member`. */
type WithMember<T extends { memberUid: string }> = Omit<T, 'memberUid'> & { member: AiAppMember | null };

@Injectable()
export class AiAppsService {
  private readonly logger = new Logger(AiAppsService.name);

  constructor(private readonly prisma: PrismaService, private readonly awsService: AwsService) {}

  private async withMember<T extends { memberUid: string }>(records: T[]): Promise<Array<WithMember<T>>> {
    const memberUids = Array.from(new Set(records.map((r) => r.memberUid)));
    const members = memberUids.length
      ? await this.prisma.member.findMany({
          where: { uid: { in: memberUids } },
          select: { uid: true, name: true },
        })
      : [];
    const byUid = new Map(members.map((m) => [m.uid, m]));
    return records.map(({ memberUid, ...rest }) => ({
      ...(rest as Omit<T, 'memberUid'>),
      member: byUid.get(memberUid) ?? null,
    }));
  }

  /** Dashboard list — all non-deleted apps across PL Infra users, newest first, with owner info. */
  async listApps(): Promise<Array<WithMember<AiApp>>> {
    const apps = await this.prisma.aiApp.findMany({
      where: { status: { not: 'DELETED' } },
      orderBy: { updatedAt: 'desc' },
    });
    return this.withMember(apps);
  }

  async getApp(uid: string): Promise<WithMember<AiApp>> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app) {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    return (await this.withMember([app]))[0];
  }

  /**
   * Append an event to the audit log. Never throws — event logging must not
   * break the primary flow (download/deploy).
   */
  private async recordEvent(
    type: AiAppEventType,
    memberUid: string,
    extra: { appUid?: string; appId?: string; deploymentId?: string; message?: string } = {}
  ): Promise<void> {
    try {
      await this.prisma.aiAppEvent.create({ data: { type, memberUid, ...extra } });
    } catch (error) {
      this.logger.error(`Failed to record AI App event ${type}: ${(error as Error).message}`);
    }
  }

  /** Logs that a member downloaded the starter kit. */
  async logKitDownloaded(memberUid: string): Promise<void> {
    await this.recordEvent('KIT_DOWNLOADED', memberUid);
  }

  /** Event log (audit feed) — newest first, optionally scoped to one app. */
  async listEvents(appUid?: string, limit = 100): Promise<Array<WithMember<AiAppEvent>>> {
    const events = await this.prisma.aiAppEvent.findMany({
      where: appUid ? { appUid } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
    return this.withMember(events);
  }

  /**
   * Lazy-creates/updates the app record, uploads the app ZIP to S3, then proxies
   * the deploy to the sandbox runner (keeping AWS creds + the runner token
   * server-side) and stores the result.
   */
  async deploy(memberUid: string, dto: DeployAppDto, file: Express.Multer.File): Promise<WithMember<AiApp>> {
    if (!file?.buffer?.length) {
      throw new BadGatewayException('Missing app ZIP file');
    }
    if (!AI_APPS_S3_BUCKET) {
      throw new InternalServerErrorException('AI_APPS_S3_BUCKET is not configured');
    }

    const s3Key = buildAppS3Key(dto.appId, dto.deploymentId);
    // The sandbox host is deterministic from appId, so set the link up front.
    const host = buildAppHost(dto.appId);
    const url = buildAppUrl(dto.appId);
    const httpUrl = buildAppHttpUrl(dto.appId);

    const app = await this.prisma.aiApp.upsert({
      where: { memberUid_appId: { memberUid, appId: dto.appId } },
      create: {
        memberUid,
        appId: dto.appId,
        name: dto.name,
        description: dto.description,
        status: 'DEPLOYING',
        deploymentId: dto.deploymentId,
        url,
        httpUrl,
        host,
      },
      update: {
        name: dto.name,
        description: dto.description,
        status: 'DEPLOYING',
        deploymentId: dto.deploymentId,
        url,
        httpUrl,
        host,
        notes: null,
      },
    });

    const eventContext = { appUid: app.uid, appId: dto.appId, deploymentId: dto.deploymentId };
    await this.recordEvent('DEPLOY_STARTED', memberUid, eventContext);

    const markReady = async (port: number | null) => {
      const updated = await this.prisma.aiApp.update({
        where: { uid: app.uid },
        data: { status: 'READY', url, httpUrl, host, port, notes: null },
      });
      await this.recordEvent('DEPLOY_SUCCEEDED', memberUid, { ...eventContext, message: url });
      return (await this.withMember([updated]))[0];
    };

    try {
      await this.awsService.uploadFileToS3(
        { buffer: file.buffer, mimetype: 'application/zip' },
        AI_APPS_S3_BUCKET,
        s3Key
      );

      this.logger.log(
        `Runner deploy request for ${dto.appId}: POST ${AI_APPS_RUNNER_URL}/deploy ` +
          `(deploymentId=${dto.deploymentId}, s3Key=${s3Key})`
      );
      const response = await axios.post<RunnerDeployResponse>(
        `${AI_APPS_RUNNER_URL}/deploy`,
        { appId: dto.appId, deploymentId: dto.deploymentId, s3Key },
        { headers: { 'Content-Type': 'application/json', 'x-runner-token': AI_APPS_RUNNER_TOKEN } }
      );
      this.logRunnerResponse('deploy', dto.appId, response.status, response.data);
      return markReady(response.data.port ?? null);
    } catch (error) {
      this.logRunnerError('deploy', dto.appId, error);
      const message = axios.isAxiosError(error)
        ? `Runner error: ${error.response?.status ?? ''} ${JSON.stringify(error.response?.data ?? error.message)}`
        : `Deploy failed: ${(error as Error).message}`;

      // A gateway timeout (Cloudflare 504/524, etc.) or no response doesn't mean the
      // deploy failed — the long-running build often completes on the origin. Verify
      // by checking whether the app is actually reachable before declaring failure.
      if (this.isUncertainRunnerError(error)) {
        this.logger.warn(`Runner timed out for ${dto.appId}; verifying app at ${url}. (${message})`);
        if (await this.verifyAppLive(url)) {
          this.logger.log(`AI App ${dto.appId} is live despite runner timeout — marking READY`);
          return markReady(null);
        }
      }

      this.logger.error(`AI App deploy failed for ${dto.appId}: ${message}`);
      await this.prisma.aiApp.update({
        where: { uid: app.uid },
        data: { status: 'ERROR', notes: message.slice(0, 2000) },
      });
      await this.recordEvent('DEPLOY_FAILED', memberUid, { ...eventContext, message: message.slice(0, 2000) });
      throw new BadGatewayException('Failed to deploy app to the sandbox runner');
    }
  }

  /**
   * Log a runner response (status + body) so the full runner output is captured
   * in the API logs (CloudWatch) for debugging. The runner sometimes returns a
   * 2xx that still carries `status: "failed"` in the body, or a delete that
   * succeeds at the HTTP level without actually tearing the container down —
   * both are only visible if we log the body, not just the HTTP status.
   */
  private logRunnerResponse(op: string, appId: string, status: number | undefined, data: unknown): void {
    this.logger.log(`Runner ${op} response for ${appId}: status=${status ?? 'n/a'} body=${this.safeStringify(data)}`);
  }

  /** Log a failed runner call: HTTP status + body when present, else the raw error / no-response cause. */
  private logRunnerError(op: string, appId: string, error: unknown): void {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const body = error.response
        ? this.safeStringify(error.response.data)
        : `no response (${error.code ?? error.message})`;
      this.logger.error(`Runner ${op} error for ${appId}: status=${status ?? 'n/a'} body=${body}`);
    } else {
      this.logger.error(`Runner ${op} error for ${appId}: ${(error as Error).message}`);
    }
  }

  /** JSON-stringify a runner body for logging, tolerating non-JSON and capping length. */
  private safeStringify(data: unknown): string {
    try {
      const str = typeof data === 'string' ? data : JSON.stringify(data);
      return str.length > 4000 ? `${str.slice(0, 4000)}…[truncated ${str.length - 4000} chars]` : str;
    } catch {
      return String(data);
    }
  }

  /** True when the runner call timed out / hit a gateway error and the outcome is unknown. */
  private isUncertainRunnerError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }
    // No response at all (connection reset / our own timeout) → unknown.
    if (!error.response) {
      return true;
    }
    return GATEWAY_TIMEOUT_STATUSES.includes(error.response.status);
  }

  /**
   * Polls the app URL until it responds (any non-gateway HTTP status means the
   * server is up — even a 404 from the app counts). Returns false if it never
   * becomes reachable within the verification window.
   */
  private async verifyAppLive(url: string): Promise<boolean> {
    for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt++) {
      try {
        const res = await axios.get(url, { timeout: 10000, validateStatus: () => true, maxRedirects: 0 });
        if (res.status && !GATEWAY_TIMEOUT_STATUSES.includes(res.status)) {
          return true;
        }
      } catch {
        // Not reachable yet — keep polling.
      }
      if (attempt < VERIFY_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, VERIFY_INTERVAL_MS));
      }
    }
    return false;
  }

  /**
   * Deletes the app from the sandbox runner, then marks it `DELETED` and records
   * the delete events. The row is kept (status flips to `DELETED`) so the audit
   * trail survives. `memberUid` is the member performing the deletion.
   */
  async deleteApp(memberUid: string, uid: string): Promise<WithMember<AiApp>> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app) {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }

    const eventContext = { appUid: app.uid, appId: app.appId, deploymentId: app.deploymentId ?? undefined };
    await this.prisma.aiApp.update({ where: { uid: app.uid }, data: { status: 'DELETING', notes: null } });
    await this.recordEvent('DELETE_STARTED', memberUid, eventContext);

    try {
      this.logger.log(`Runner delete request for ${app.appId}: DELETE ${AI_APPS_RUNNER_URL}/apps/${app.appId}`);
      const response = await axios.delete(`${AI_APPS_RUNNER_URL}/apps/${app.appId}`, {
        headers: { 'x-runner-token': AI_APPS_RUNNER_TOKEN },
      });
      this.logRunnerResponse('delete', app.appId, response.status, response.data);

      const updated = await this.prisma.aiApp.update({
        where: { uid: app.uid },
        data: { status: 'DELETED', url: null, httpUrl: null, host: null, port: null, notes: null },
      });
      await this.recordEvent('DELETE_SUCCEEDED', memberUid, eventContext);
      return (await this.withMember([updated]))[0];
    } catch (error) {
      this.logRunnerError('delete', app.appId, error);
      const message = axios.isAxiosError(error)
        ? `Runner error: ${error.response?.status ?? ''} ${JSON.stringify(error.response?.data ?? error.message)}`
        : `Delete failed: ${(error as Error).message}`;
      this.logger.error(`AI App delete failed for ${app.appId}: ${message}`);
      await this.prisma.aiApp.update({
        where: { uid: app.uid },
        data: { status: 'ERROR', notes: message.slice(0, 2000) },
      });
      await this.recordEvent('DELETE_FAILED', memberUid, { ...eventContext, message: message.slice(0, 2000) });
      throw new BadGatewayException('Failed to delete app on the sandbox runner');
    }
  }
}
