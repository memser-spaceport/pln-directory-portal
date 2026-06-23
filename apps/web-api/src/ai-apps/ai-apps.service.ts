import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import axios from 'axios';
import { AiApp, AiAppEvent, AiAppEventType } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { AwsService } from '../utils/aws/aws.service';
import { DeployAppDto } from './dto/deploy-app.dto';
import {
  AI_APP_TOKEN_PREFIX,
  AI_APPS_RUNNER_TOKEN,
  AI_APPS_RUNNER_URL,
  AI_APPS_S3_BUCKET,
  buildAppS3Key,
} from './ai-apps.constants';

interface RunnerDeployResponse {
  status?: string;
  host?: string;
  url?: string;
  httpUrl?: string;
  port?: number;
}

@Injectable()
export class AiAppsService {
  private readonly logger = new Logger(AiAppsService.name);

  constructor(private readonly prisma: PrismaService, private readonly awsService: AwsService) {}

  /** Returns the member's reusable deploy token, creating one on first use. */
  async ensureToken(memberUid: string): Promise<string> {
    const existing = await this.prisma.aiAppToken.findUnique({ where: { memberUid } });
    if (existing && !existing.revokedAt) {
      return existing.token;
    }

    const token = `${AI_APP_TOKEN_PREFIX}${randomBytes(24).toString('hex')}`;
    if (existing) {
      await this.prisma.aiAppToken.update({
        where: { memberUid },
        data: { token, revokedAt: null },
      });
    } else {
      await this.prisma.aiAppToken.create({ data: { memberUid, token } });
    }
    return token;
  }

  /** Dashboard list — all apps across PL Infra users, newest first, with owner info. */
  async listApps(): Promise<Array<AiApp & { member: { uid: string; name: string } | null }>> {
    const apps = await this.prisma.aiApp.findMany({ orderBy: { updatedAt: 'desc' } });
    const memberUids = Array.from(new Set(apps.map((app) => app.memberUid)));
    const members = await this.prisma.member.findMany({
      where: { uid: { in: memberUids } },
      select: { uid: true, name: true },
    });
    const byUid = new Map(members.map((m) => [m.uid, m]));
    return apps.map((app) => ({ ...app, member: byUid.get(app.memberUid) ?? null }));
  }

  async getApp(uid: string): Promise<AiApp> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app) {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    return app;
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
  async listEvents(
    appUid?: string,
    limit = 100
  ): Promise<Array<AiAppEvent & { member: { uid: string; name: string } | null }>> {
    const events = await this.prisma.aiAppEvent.findMany({
      where: appUid ? { appUid } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
    const memberUids = Array.from(new Set(events.map((e) => e.memberUid)));
    const members = await this.prisma.member.findMany({
      where: { uid: { in: memberUids } },
      select: { uid: true, name: true },
    });
    const byUid = new Map(members.map((m) => [m.uid, m]));
    return events.map((e) => ({ ...e, member: byUid.get(e.memberUid) ?? null }));
  }

  /**
   * Lazy-creates/updates the app record, uploads the app ZIP to S3, then proxies
   * the deploy to the sandbox runner (keeping AWS creds + the runner token
   * server-side) and stores the result.
   */
  async deploy(memberUid: string, dto: DeployAppDto, file: Express.Multer.File): Promise<AiApp> {
    if (!file?.buffer?.length) {
      throw new BadGatewayException('Missing app ZIP file');
    }
    if (!AI_APPS_S3_BUCKET) {
      throw new InternalServerErrorException('AI_APPS_S3_BUCKET is not configured');
    }

    const s3Key = buildAppS3Key(dto.appId, dto.deploymentId);

    const app = await this.prisma.aiApp.upsert({
      where: { memberUid_appId: { memberUid, appId: dto.appId } },
      create: {
        memberUid,
        appId: dto.appId,
        name: dto.name,
        description: dto.description,
        status: 'DEPLOYING',
        deploymentId: dto.deploymentId,
      },
      update: {
        name: dto.name,
        description: dto.description,
        status: 'DEPLOYING',
        deploymentId: dto.deploymentId,
        notes: null,
      },
    });

    const eventContext = { appUid: app.uid, appId: dto.appId, deploymentId: dto.deploymentId };
    await this.recordEvent('DEPLOY_STARTED', memberUid, eventContext);

    try {
      await this.awsService.uploadFileToS3(
        { buffer: file.buffer, mimetype: 'application/zip' },
        AI_APPS_S3_BUCKET,
        s3Key
      );

      const { data } = await axios.post<RunnerDeployResponse>(
        `${AI_APPS_RUNNER_URL}/deploy`,
        { appId: dto.appId, deploymentId: dto.deploymentId, s3Key },
        { headers: { 'Content-Type': 'application/json', 'x-runner-token': AI_APPS_RUNNER_TOKEN } }
      );

      const updated = await this.prisma.aiApp.update({
        where: { uid: app.uid },
        data: {
          status: 'READY',
          url: data.url ?? null,
          httpUrl: data.httpUrl ?? null,
          host: data.host ?? null,
          port: data.port ?? null,
          notes: null,
        },
      });
      await this.recordEvent('DEPLOY_SUCCEEDED', memberUid, { ...eventContext, message: updated.url ?? undefined });
      return updated;
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? `Runner error: ${error.response?.status ?? ''} ${JSON.stringify(error.response?.data ?? error.message)}`
        : `Deploy failed: ${(error as Error).message}`;
      this.logger.error(`AI App deploy failed for ${dto.appId}: ${message}`);
      await this.prisma.aiApp.update({
        where: { uid: app.uid },
        data: { status: 'ERROR', notes: message.slice(0, 2000) },
      });
      await this.recordEvent('DEPLOY_FAILED', memberUid, { ...eventContext, message: message.slice(0, 2000) });
      throw new BadGatewayException('Failed to deploy app to the sandbox runner');
    }
  }
}
