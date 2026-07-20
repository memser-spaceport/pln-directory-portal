import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { AiApp, AiAppEvent, AiAppEventType, AiAppFeedback } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { isDirectoryAdmin } from '../utils/constants';
import { AwsService } from '../utils/aws/aws.service';
import { DeployAppDto } from './dto/deploy-app.dto';
import { RegisterDraftDto } from './dto/register-draft.dto';
import { UpdateAppMetadataDto } from './dto/update-app-metadata.dto';
import {
  AI_APPS_DEPLOY_STUCK_MINUTES,
  AI_APPS_DEPLOY_STUCK_MS,
  AI_APPS_HELM_LOCK_RETRIES,
  AI_APPS_HELM_LOCK_RETRY_INTERVAL_MS,
  AI_APPS_RUNNER_ENVIRONMENT,
  AI_APPS_RUNNER_TOKEN,
  AI_APPS_RUNNER_URL,
  AI_APPS_S3_BUCKET,
  AI_APPS_PRD_S3_BUCKET,
  AI_APPS_STARTER_KIT_VERSION,
  AI_APPS_VERIFY_ATTEMPTS,
  AI_APPS_VERIFY_INTERVAL_MS,
  buildAppHost,
  buildAppHttpUrl,
  buildAppPageUrl,
  buildAppS3Key,
  buildAppUrl,
  buildPrdPublicUrl,
  buildPrdS3Key,
  buildRunnerDeploymentsUrl,
  buildRunnerSecretsUrl,
} from './ai-apps.constants';

/**
 * Edge/gateway statuses that mean "the app isn't reachable (yet)" — verify,
 * don't fail. 530 is Cloudflare's origin-DNS error, served while the app's
 * subdomain isn't registered yet.
 */
const GATEWAY_TIMEOUT_STATUSES = [408, 502, 503, 504, 521, 522, 523, 524, 530];

interface RunnerDeployResponse {
  status?: string;
  host?: string;
  url?: string;
  httpUrl?: string;
  port?: number;
}

type AiAppMember = { uid: string; name: string; image: string | null };

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
          select: { uid: true, name: true, image: { select: { url: true } } },
        })
      : [];
    const byUid = new Map(
      members.map(({ image, ...member }) => [member.uid, { ...member, image: image?.url ?? null }])
    );
    return records.map(({ memberUid, ...rest }) => {
      const response = {
        ...(rest as Omit<T, 'memberUid'>),
        member: byUid.get(memberUid) ?? null,
      } as WithMember<T>;

      // The database stores only the S3 key. Keep the existing API contract by
      // returning the public URL in the same `prd` field. Legacy inline PRD
      // values remain untouched.
      const responseWithPrd = response as WithMember<T> & { prd?: string | null };
      if (typeof responseWithPrd.prd === 'string' && responseWithPrd.prd.startsWith('ai-app-prds/')) {
        responseWithPrd.prd = buildPrdPublicUrl(responseWithPrd.prd);
      }
      return response;
    });
  }

  /**
   * Public identity of the signed-in member, served to deployed AI apps for
   * personalization ("member context"). Returns curated public directory
   * fields only — this is the extension point if apps may read more PLN data
   * later (add fields/sections here rather than exposing internal endpoints).
   * Deliberately NO contact info (email, office-hours link, …): apps
   * personalize with the identity, they never get a channel to the member.
   */
  async getMemberContext(memberUid: string) {
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      select: {
        uid: true,
        name: true,
        image: { select: { url: true } },
        location: { select: { city: true, country: true, continent: true } },
        skills: { select: { title: true }, orderBy: { title: 'asc' } },
        teamMemberRoles: {
          select: {
            role: true,
            mainTeam: true,
            teamLead: true,
            team: { select: { uid: true, name: true } },
          },
          orderBy: { mainTeam: 'desc' },
        },
      },
    });
    if (!member) {
      throw new NotFoundException(`Member not found: ${memberUid}`);
    }
    const { image, location, skills, teamMemberRoles, ...identity } = member;
    return {
      member: {
        ...identity,
        image: image?.url ?? null,
        location: location ?? null,
        skills: skills.map((skill) => skill.title),
        teams: teamMemberRoles.map((tmr) => ({
          uid: tmr.team.uid,
          name: tmr.team.name,
          role: tmr.role,
          mainTeam: tmr.mainTeam,
          teamLead: tmr.teamLead,
        })),
      },
    };
  }

  /** Dashboard list — all non-deleted apps across PL Infra users, newest first, with owner info. */
  async listApps(): Promise<Array<WithMember<AiApp>>> {
    const apps = await this.prisma.aiApp.findMany({
      where: { status: { not: 'DELETED' } },
      orderBy: { updatedAt: 'desc' },
    });
    return this.withMember(await Promise.all(apps.map((app) => this.settleStuckDeploy(app))));
  }

  /**
   * Single app detail. When the requester is known, the response carries
   * `canManage` (creator or directory admin) — computed server-side so the UI
   * never has to compare member uids from a possibly stale login cookie.
   */
  async getApp(uid: string, requesterUid?: string): Promise<WithMember<AiApp> & { canManage?: boolean }> {
    let app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app) {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    app = await this.settleStuckDeploy(app);
    const result = (await this.withMember([app]))[0];
    if (!requesterUid) {
      return result;
    }
    return { ...result, canManage: await this.isCreatorOrDirectoryAdmin(requesterUid, app) };
  }

  /** Updates dashboard metadata only; this never invokes the sandbox runner or starts a deploy. */
  async updateMetadata(
    requesterUid: string,
    uid: string,
    dto: UpdateAppMetadataDto,
    ownerOnly = false
  ): Promise<WithMember<AiApp>> {
    if (dto.name === undefined && dto.description === undefined && dto.prd === undefined) {
      throw new BadRequestException('At least one of name, description, or prd must be provided');
    }

    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    if (ownerOnly && app.memberUid !== requesterUid) {
      throw new ForbiddenException('The agent may edit only apps owned by its connected member');
    }

    const data: { name?: string; description?: string | null; prd?: string | null } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.prd !== undefined) data.prd = dto.prd?.trim() || null;

    const updated = await this.prisma.aiApp.update({ where: { uid }, data });
    return (await this.withMember([updated]))[0];
  }

  /** Update metadata from JSON or multipart; a PRD file overrides body.prd. */
  async updateMetadataWithOptionalPrdFile(
    requesterUid: string,
    uid: string,
    dto: UpdateAppMetadataDto,
    file?: Express.Multer.File
  ): Promise<WithMember<AiApp>> {
    if (!file) {
      return this.updateMetadata(requesterUid, uid, dto);
    }
    if (dto.prd !== undefined) {
      throw new BadRequestException('Send either prd text or a PRD file, not both');
    }
    return this.storePrdFile(requesterUid, uid, file, dto);
  }

  /** File-only PRD upload used by POST /:uid/prd. */
  async uploadPrd(requesterUid: string, uid: string, file: Express.Multer.File): Promise<WithMember<AiApp>> {
    return this.storePrdFile(requesterUid, uid, file, {} as UpdateAppMetadataDto);
  }

  /** Validate a Markdown/HTML PRD file, upload it, and persist only its S3 key. */
  private async storePrdFile(
    requesterUid: string,
    uid: string,
    file: Express.Multer.File,
    metadata: UpdateAppMetadataDto
  ): Promise<WithMember<AiApp>> {
    const extension = this.validatePrdFile(file);
    if (!AI_APPS_PRD_S3_BUCKET) {
      throw new InternalServerErrorException('No PRD bucket configured (AI_APPS_PRD_S3_BUCKET or AI_APPS_S3_BUCKET)');
    }

    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }

    const key = buildPrdS3Key(app.appId, extension, randomUUID());
    try {
      const contentType = extension === '.md' ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8';

      await this.awsService.uploadFileToS3(
        {
          buffer: file.buffer,
          mimetype: contentType,
        },
        AI_APPS_PRD_S3_BUCKET,
        key
      );
    } catch (error) {
      this.logger.error(`AI App PRD upload failed for ${app.appId}: ${(error as Error).message}`);
      throw new BadGatewayException('Failed to store the PRD file');
    }

    return this.updateMetadata(requesterUid, uid, { ...metadata, prd: key } as UpdateAppMetadataDto);
  }

  /** Validate a UTF-8 Markdown/HTML PRD file and return its normalized extension. */
  private validatePrdFile(file: Express.Multer.File): '.md' | '.html' {
    if (!file?.buffer?.length) {
      throw new BadRequestException('PRD file is required and must not be empty');
    }

    const filename = file.originalname || '';
    const rawExtension = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : '';

    let extension: '.md' | '.html';

    if (rawExtension === '.md' || rawExtension === '.markdown') {
      extension = '.md';
    } else if (rawExtension === '.html' || rawExtension === '.htm') {
      extension = '.html';
    } else {
      throw new BadRequestException('Unsupported PRD file type. Only .md, .markdown, .html, and .htm are allowed');
    }

    if (file.buffer.includes(0)) {
      throw new BadRequestException('PRD file must contain UTF-8 text');
    }

    return extension;
  }

  /**
   * Single reachability probe of the app's public URL, for the LabOS detail
   * page: it polls this while a redeploy settles so it can hold its own loading
   * state instead of iframing a raw gateway error page. One attempt per call —
   * the polling cadence belongs to the client (unlike `verifyAppLive`, which
   * does its own retry loop inside the deploy flow).
   */
  async checkAppLive(uid: string): Promise<{ live: boolean }> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app) {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    if (!app.url) {
      return { live: false };
    }
    try {
      const res = await axios.get(app.url, { timeout: 8000, validateStatus: () => true, maxRedirects: 0 });
      // 404 counts as DOWN here: right after a first deploy the ingress serves
      // 404 until the app's route/pod is ready, and the kit contract requires a
      // usable `GET /` anyway — reporting live on 404 makes the detail page
      // iframe a blank error document. (Unlike `verifyAppLive`, which keeps
      // 404-counts-as-up because it only asks whether the *server* survived a
      // gateway timeout during the deploy flow.)
      return { live: !!res.status && res.status !== 404 && !GATEWAY_TIMEOUT_STATUSES.includes(res.status) };
    } catch {
      return { live: false };
    }
  }

  /**
   * Blocks a second concurrent deploy for the same app. A fresh (non-stuck)
   * DEPLOYING app is owned by an in-flight deploy, so any new deploy/registration
   * for it is rejected until that one settles (success or failure). A STUCK
   * deploy (past the window) is deliberately NOT blocked — that's the manual
   * recovery path when the runner hung or the API died mid-deploy.
   */
  private assertNoDeployInProgress(app: Pick<AiApp, 'status' | 'updatedAt'>): void {
    if (app.status === 'DEPLOYING' && !this.isDeployStuck(app)) {
      throw new ConflictException(
        'A deploy is already in progress for this app — wait for it to finish, then try again.'
      );
    }
  }

  /**
   * A deploy that has sat in DEPLOYING beyond the stuck window is stuck: the
   * deploy runs synchronously in the API process, so a legitimate one settles
   * to READY/ERROR within minutes. Nothing touches the row between the flip to
   * DEPLOYING and the settle, so `updatedAt` is exactly "deploy started at".
   */
  private isDeployStuck(app: Pick<AiApp, 'status' | 'updatedAt'>): boolean {
    return app.status === 'DEPLOYING' && Date.now() - app.updatedAt.getTime() > AI_APPS_DEPLOY_STUCK_MS;
  }

  /**
   * Lazily settles a stuck deploy on read: flips the row to ERROR with an
   * explanatory note and records DEPLOY_FAILED, so the dashboard/detail page
   * shows a clear failed state (and the owner can retry) instead of an app
   * frozen in DEPLOYING forever. The update is conditioned on the row still
   * being DEPLOYING — if the deploy somehow settles concurrently, its own
   * READY/ERROR write wins and we return the fresh row.
   */
  private async settleStuckDeploy(app: AiApp): Promise<AiApp> {
    if (!this.isDeployStuck(app)) {
      return app;
    }
    const message =
      `Deploy timed out: no result after ${AI_APPS_DEPLOY_STUCK_MINUTES} minutes — the deploy was interrupted ` +
      'or the sandbox runner is unavailable. Retry the deploy once the runner is healthy.';
    const { count } = await this.prisma.aiApp.updateMany({
      where: { uid: app.uid, status: 'DEPLOYING' },
      data: { status: 'ERROR', notes: message },
    });
    if (count > 0) {
      this.logger.warn(
        `AI App deploy stuck for ${app.appId} (deploymentId=${app.deploymentId ?? 'n/a'}) — marked ERROR`
      );
      await this.recordEvent('DEPLOY_FAILED', app.memberUid, {
        appUid: app.uid,
        appId: app.appId,
        deploymentId: app.deploymentId ?? undefined,
        message,
      });
    }
    return (await this.prisma.aiApp.findUnique({ where: { uid: app.uid } })) ?? app;
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

  /** Logs that a member downloaded the starter kit (and which version). */
  async logKitDownloaded(memberUid: string): Promise<void> {
    await this.recordEvent('KIT_DOWNLOADED', memberUid, { message: `Starter kit v${AI_APPS_STARTER_KIT_VERSION}` });
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
   * Stores free-text feedback from a member viewing the app's detail page. Any
   * member with AI Apps access may submit, and may do so more than once per app.
   */
  async submitFeedback(memberUid: string, appUid: string, text: string): Promise<WithMember<AiAppFeedback>> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid: appUid } });
    if (!app) {
      throw new NotFoundException(`AI App not found: ${appUid}`);
    }
    const feedback = await this.prisma.aiAppFeedback.create({
      data: { appUid: app.uid, memberUid, text },
    });
    return (await this.withMember([feedback]))[0];
  }

  /**
   * All feedback for one app, newest first, with submitter info. Visible only
   * to the app's creator and directory admins.
   */
  async listFeedback(requesterUid: string, appUid: string): Promise<Array<WithMember<AiAppFeedback>>> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid: appUid } });
    if (!app) {
      throw new NotFoundException(`AI App not found: ${appUid}`);
    }
    if (!(await this.isCreatorOrDirectoryAdmin(requesterUid, app))) {
      throw new ForbiddenException('Only the app creator or a directory admin can view feedback');
    }
    const feedback = await this.prisma.aiAppFeedback.findMany({
      where: { appUid: app.uid },
      orderBy: { createdAt: 'desc' },
    });
    return this.withMember(feedback);
  }

  /** True when the requester created the app or is a directory admin. */
  private async isCreatorOrDirectoryAdmin(requesterUid: string, app: Pick<AiApp, 'memberUid'>): Promise<boolean> {
    if (app.memberUid === requesterUid) {
      return true;
    }
    const requester = await this.prisma.member.findUnique({
      where: { uid: requesterUid },
      select: { memberRoles: { select: { name: true } } },
    });
    return !!requester && isDirectoryAdmin(requester);
  }

  /**
   * Lazy-creates/updates the app record, uploads the app ZIP to S3, then proxies
   * the deploy to the sandbox runner (keeping AWS creds + the runner token
   * server-side) and stores the result.
   */
  async deploy(
    memberUid: string,
    dto: DeployAppDto,
    file: Express.Multer.File,
    agentClient?: string | null
  ): Promise<WithMember<AiApp>> {
    if (!file?.buffer?.length) {
      throw new BadGatewayException('Missing app ZIP file');
    }
    if (!AI_APPS_S3_BUCKET) {
      throw new InternalServerErrorException('AI_APPS_S3_BUCKET is not configured');
    }

    // Block a second concurrent deploy: if a deploy is already in flight for this
    // app (from another agent run or a member-triggered deploy), reject before we
    // overwrite its bundle/status. First-ever deploys have no row yet, so skip.
    const existing = await this.prisma.aiApp.findUnique({
      where: { memberUid_appId: { memberUid, appId: dto.appId } },
    });
    if (existing) {
      this.assertNoDeployInProgress(existing);
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
        s3Key,
        url,
        httpUrl,
        host,
        kitVersion: dto.kitVersion ?? null,
        agentClient: agentClient ?? null,
        agentModel: dto.agentModel ?? null,
      },
      update: {
        name: dto.name,
        description: dto.description,
        status: 'DEPLOYING',
        deploymentId: dto.deploymentId,
        s3Key,
        url,
        httpUrl,
        host,
        // Upload metadata reflects the LAST upload — cleared when a client
        // that sends nothing (older kit) redeploys, so it never goes stale.
        kitVersion: dto.kitVersion ?? null,
        agentClient: agentClient ?? null,
        agentModel: dto.agentModel ?? null,
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
    } catch (error) {
      const message = `Deploy failed: ${(error as Error).message}`;
      await this.failDeploy(app.uid, memberUid, eventContext, message);
      throw new BadGatewayException('Failed to store the app bundle');
    }

    // Apps that went through the draft flow keep their stored secrets across
    // agent-initiated redeploys.
    return this.proxyDeploy(memberUid, app, dto.deploymentId, s3Key, app.providedEnvVars);
  }

  /**
   * Registers a DRAFT app for the agent (deploy-token auth): the app needs
   * runtime secrets, so instead of deploying we store the bundle in S3 and the
   * required env var NAMES, and hand back the LabOS app page URL where the
   * member enters the values and triggers the deploy.
   */
  async registerDraft(
    memberUid: string,
    dto: RegisterDraftDto,
    file: Express.Multer.File,
    agentClient?: string | null
  ): Promise<WithMember<AiApp> & { appPageUrl: string; missingEnvVars: string[] }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing app ZIP file');
    }
    if (!AI_APPS_S3_BUCKET) {
      throw new InternalServerErrorException('AI_APPS_S3_BUCKET is not configured');
    }

    // Don't clobber an in-flight deploy's bundle/status by re-registering the app
    // as a DRAFT while it's mid-deploy.
    const existing = await this.prisma.aiApp.findUnique({
      where: { memberUid_appId: { memberUid, appId: dto.appId } },
    });
    if (existing) {
      this.assertNoDeployInProgress(existing);
    }

    const s3Key = buildAppS3Key(dto.appId, dto.deploymentId);
    try {
      await this.awsService.uploadFileToS3(
        { buffer: file.buffer, mimetype: 'application/zip' },
        AI_APPS_S3_BUCKET,
        s3Key
      );
    } catch (error) {
      this.logger.error(`AI App draft upload failed for ${dto.appId}: ${(error as Error).message}`);
      throw new BadGatewayException('Failed to store the app bundle');
    }

    // `providedEnvVars` is intentionally left untouched on update: values the
    // member already stored on the runner stay valid across draft re-registrations.
    const app = await this.prisma.aiApp.upsert({
      where: { memberUid_appId: { memberUid, appId: dto.appId } },
      create: {
        memberUid,
        appId: dto.appId,
        name: dto.name,
        description: dto.description,
        status: 'DRAFT',
        deploymentId: dto.deploymentId,
        s3Key,
        requiredEnvVars: dto.requiredEnvVars,
        kitVersion: dto.kitVersion ?? null,
        agentClient: agentClient ?? null,
        agentModel: dto.agentModel ?? null,
      },
      update: {
        name: dto.name,
        description: dto.description,
        status: 'DRAFT',
        deploymentId: dto.deploymentId,
        s3Key,
        requiredEnvVars: dto.requiredEnvVars,
        kitVersion: dto.kitVersion ?? null,
        agentClient: agentClient ?? null,
        agentModel: dto.agentModel ?? null,
        notes: null,
      },
    });

    await this.recordEvent('DRAFT_CREATED', memberUid, {
      appUid: app.uid,
      appId: dto.appId,
      deploymentId: dto.deploymentId,
      message: `Required env vars: ${dto.requiredEnvVars.join(', ')}`,
    });

    const provided = new Set(app.providedEnvVars);
    return {
      ...(await this.withMember([app]))[0],
      appPageUrl: buildAppPageUrl(app.uid),
      missingEnvVars: app.requiredEnvVars.filter((name) => !provided.has(name)),
    };
  }

  /**
   * Member-triggered deploy from the LabOS app page (draft flow + redeploys).
   * Optionally saves the submitted secret values to the sandbox runner first
   * (merge/upsert — values never touch our DB), validates every required env
   * var has a value, then redeploys the stored bundle.
   */
  async deployDraft(requesterUid: string, uid: string, secrets?: Record<string, string>): Promise<WithMember<AiApp>> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app) {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    if (!(await this.isCreatorOrDirectoryAdmin(requesterUid, app))) {
      throw new ForbiddenException('Only the app creator or a directory admin can deploy this app');
    }
    if (app.status === 'DELETED' || app.status === 'DELETING') {
      throw new BadRequestException('This app has been deleted');
    }
    this.assertNoDeployInProgress(app);
    if (!app.s3Key || !app.deploymentId) {
      throw new BadRequestException('This app has no uploaded bundle yet — ask your AI agent to register it first');
    }

    const submittedNames = Object.keys(secrets ?? {});
    const provided = new Set([...app.providedEnvVars, ...submittedNames]);
    const missing = app.requiredEnvVars.filter((name) => !provided.has(name));
    if (missing.length) {
      throw new BadRequestException(`Missing values for required environment variables: ${missing.join(', ')}`);
    }

    if (secrets && submittedNames.length) {
      await this.saveSecrets(requesterUid, app, secrets);
    }

    await this.recordEvent('DEPLOY_STARTED', requesterUid, {
      appUid: app.uid,
      appId: app.appId,
      deploymentId: app.deploymentId,
    });
    return this.proxyDeploy(requesterUid, app, app.deploymentId, app.s3Key, Array.from(provided));
  }

  /**
   * Saves secret VALUES to the sandbox runner's secret store (merge/upsert per
   * the runner's `/v1/projects/<project>/secrets` contract) and remembers only
   * the NAMES on the app record. Never log or persist the values.
   */
  private async saveSecrets(memberUid: string, app: AiApp, secrets: Record<string, string>): Promise<void> {
    const names = Object.keys(secrets);
    try {
      this.logger.log(`Runner secrets request for ${app.appId}: POST ${buildRunnerSecretsUrl()} (${names.join(', ')})`);
      const response = await axios.post(
        buildRunnerSecretsUrl(),
        { appId: app.appId, environment: AI_APPS_RUNNER_ENVIRONMENT, secrets },
        { headers: { 'Content-Type': 'application/json', 'x-runner-token': AI_APPS_RUNNER_TOKEN } }
      );
      // Log only the status — the request/response may echo secret values.
      this.logger.log(`Runner secrets response for ${app.appId}: status=${response.status}`);
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      this.logger.error(`Runner secrets error for ${app.appId}: status=${status ?? 'n/a'}`);
      throw new BadGatewayException('Failed to store secrets on the sandbox runner');
    }

    await this.prisma.aiApp.update({
      where: { uid: app.uid },
      data: { providedEnvVars: Array.from(new Set([...app.providedEnvVars, ...names])) },
    });
    await this.recordEvent('SECRETS_UPDATED', memberUid, {
      appUid: app.uid,
      appId: app.appId,
      message: `Updated: ${names.join(', ')}`,
    });
  }

  /**
   * Shared deploy proxy: flips the app to DEPLOYING, asks the runner to build
   * and start the bundle at `s3Key`, then — when the app has stored secrets —
   * redeploys the built image with those secrets injected (the legacy `/deploy`
   * build does NOT inject them), and settles READY/ERROR (with the timeout
   * verification below). Callers record DEPLOY_STARTED themselves.
   */
  private async proxyDeploy(
    memberUid: string,
    app: Pick<AiApp, 'uid' | 'appId'>,
    deploymentId: string,
    s3Key: string,
    secretNames: string[] = []
  ): Promise<WithMember<AiApp>> {
    const host = buildAppHost(app.appId);
    const url = buildAppUrl(app.appId);
    const httpUrl = buildAppHttpUrl(app.appId);
    await this.prisma.aiApp.update({
      where: { uid: app.uid },
      data: { status: 'DEPLOYING', deploymentId, s3Key, url, httpUrl, host, notes: null },
    });

    const eventContext = { appUid: app.uid, appId: app.appId, deploymentId };

    const markReady = async (port: number | null) => {
      const updated = await this.prisma.aiApp.update({
        where: { uid: app.uid },
        data: { status: 'READY', url, httpUrl, host, port, notes: null },
      });
      await this.recordEvent('DEPLOY_SUCCEEDED', memberUid, { ...eventContext, message: url });
      return (await this.withMember([updated]))[0];
    };

    let port: number | null = null;
    try {
      this.logger.log(
        `Runner deploy request for ${app.appId}: POST ${AI_APPS_RUNNER_URL}/deploy ` +
          `(deploymentId=${deploymentId}, s3Key=${s3Key})`
      );
      const response = await axios.post<RunnerDeployResponse>(
        `${AI_APPS_RUNNER_URL}/deploy`,
        { appId: app.appId, deploymentId, s3Key },
        { headers: { 'Content-Type': 'application/json', 'x-runner-token': AI_APPS_RUNNER_TOKEN } }
      );
      this.logRunnerResponse('deploy', app.appId, response.status, response.data);
      port = response.data.port ?? null;
    } catch (error) {
      this.logRunnerError('deploy', app.appId, error);
      const message = axios.isAxiosError(error)
        ? `Runner error: ${error.response?.status ?? ''} ${JSON.stringify(error.response?.data ?? error.message)}`
        : `Deploy failed: ${(error as Error).message}`;

      // A gateway timeout (Cloudflare 504/524, etc.) or no response doesn't mean the
      // deploy failed — the long-running build often completes on the origin. Verify
      // by checking whether the app is actually reachable before declaring failure.
      let survivedTimeout = false;
      if (this.isUncertainRunnerError(error)) {
        this.logger.warn(`Runner timed out for ${app.appId}; verifying app at ${url}. (${message})`);
        survivedTimeout = await this.verifyAppLive(url);
      }
      if (!survivedTimeout) {
        this.logger.error(`AI App deploy failed for ${app.appId}: ${message}`);
        await this.failDeploy(app.uid, memberUid, eventContext, message);
        throw new BadGatewayException('Failed to deploy app to the sandbox runner');
      }
      this.logger.log(`AI App ${app.appId} is live despite runner timeout — continuing`);
    }

    // The build ran the app WITHOUT its secrets — redeploy the built image with
    // the stored secret names injected. A secrets app that can't get its values
    // must fail loudly rather than go READY in a broken state.
    if (secretNames.length) {
      try {
        await this.deployImageWithSecrets(app.appId, secretNames, url);
      } catch (error) {
        const message = `Secrets injection failed: ${(error as Error).message}`;
        this.logger.error(`AI App deploy failed for ${app.appId}: ${message}`);
        await this.failDeploy(app.uid, memberUid, eventContext, message);
        throw new BadGatewayException('Failed to inject secrets on the sandbox runner');
      }
    }

    return markReady(port);
  }

  /**
   * Redeploys an app's already-built image with the named stored secrets
   * injected (`POST /v1/projects/<project>/deployments`). The image reference
   * comes from the runner's own app registry (`GET /apps`).
   */
  private async deployImageWithSecrets(appId: string, secretNames: string[], appUrl: string): Promise<void> {
    const headers = { 'Content-Type': 'application/json', 'x-runner-token': AI_APPS_RUNNER_TOKEN };

    const registry = await axios.get<{ apps?: Array<{ app_id?: string; image?: string }> }>(
      `${AI_APPS_RUNNER_URL}/apps`,
      { headers: { 'x-runner-token': AI_APPS_RUNNER_TOKEN } }
    );
    const image = registry.data?.apps?.find((entry) => entry.app_id === appId)?.image;
    if (!image) {
      throw new Error(`runner /apps has no image for ${appId}`);
    }

    for (let attempt = 0; ; attempt++) {
      try {
        this.logger.log(
          `Runner secrets-deploy request for ${appId}: POST ${buildRunnerDeploymentsUrl()} ` +
            `(image=${image}, secretNames=${secretNames.join(', ')})`
        );
        const response = await axios.post(
          buildRunnerDeploymentsUrl(),
          { appId, environment: AI_APPS_RUNNER_ENVIRONMENT, image, secretNames },
          { headers }
        );
        this.logRunnerResponse('secrets-deploy', appId, response.status, response.data);
        return;
      } catch (error) {
        this.logRunnerError('secrets-deploy', appId, error);
        // 409 helm_release_locked: another Helm operation (typically the /deploy
        // build's own upgrade, still finishing after a gateway timeout) holds
        // the release. The lock clears when it completes — wait and retry.
        if (this.isHelmReleaseLocked(error) && attempt < AI_APPS_HELM_LOCK_RETRIES) {
          this.logger.warn(
            `Helm release locked for ${appId}; retrying secrets deploy in ${AI_APPS_HELM_LOCK_RETRY_INTERVAL_MS}ms ` +
              `(attempt ${attempt + 1}/${AI_APPS_HELM_LOCK_RETRIES})`
          );
          await new Promise((resolve) => setTimeout(resolve, AI_APPS_HELM_LOCK_RETRY_INTERVAL_MS));
          continue;
        }
        // Same edge-timeout caveat as the build: verify before declaring failure.
        if (this.isUncertainRunnerError(error) && (await this.verifyAppLive(appUrl))) {
          this.logger.warn(`Secrets deploy timed out for ${appId} but the app is reachable — continuing`);
          return;
        }
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        throw new Error(`runner deployments call failed (status=${status ?? 'n/a'})`);
      }
    }
  }

  /** True when the runner refused the deployment because the Helm release is mid-modification. */
  private isHelmReleaseLocked(error: unknown): boolean {
    if (!axios.isAxiosError(error) || error.response?.status !== 409) {
      return false;
    }
    return this.safeStringify(error.response.data).includes('helm_release_locked');
  }

  /** Marks a failed deploy: status ERROR with the trimmed message + DEPLOY_FAILED event. */
  private async failDeploy(
    appUid: string,
    memberUid: string,
    eventContext: { appUid: string; appId: string; deploymentId: string },
    message: string
  ): Promise<void> {
    await this.prisma.aiApp.update({
      where: { uid: appUid },
      data: { status: 'ERROR', notes: message.slice(0, 2000) },
    });
    await this.recordEvent('DEPLOY_FAILED', memberUid, { ...eventContext, message: message.slice(0, 2000) });
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
   * becomes reachable within the verification window (~6 min by default — must
   * cover the pod-up → domain-registration gap, observed at 1–5 minutes).
   */
  private async verifyAppLive(url: string): Promise<boolean> {
    for (let attempt = 1; attempt <= AI_APPS_VERIFY_ATTEMPTS; attempt++) {
      try {
        const res = await axios.get(url, { timeout: 10000, validateStatus: () => true, maxRedirects: 0 });
        if (res.status && !GATEWAY_TIMEOUT_STATUSES.includes(res.status)) {
          return true;
        }
      } catch {
        // Not reachable yet — keep polling.
      }
      if (attempt < AI_APPS_VERIFY_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, AI_APPS_VERIFY_INTERVAL_MS));
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
