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
import DOMPurify from 'isomorphic-dompurify';
import {
  AiApp,
  AiAppEvent,
  AiAppEventType,
  AiAppFeedback,
  AiAppFeedbackStatus,
  Prisma,
  PushNotificationCategory,
} from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { isDirectoryAdmin } from '../utils/constants';
import { AwsService } from '../utils/aws/aws.service';
import { AI_APPS_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { DeployAppDto } from './dto/deploy-app.dto';
import { RegisterDraftDto } from './dto/register-draft.dto';
import { UpdateAppMetadataDto } from './dto/update-app-metadata.dto';
import {
  AiAppLogPhase,
  AI_APP_ANON_ID_REGEX,
  AI_APPS_APP_DOMAIN,
  AI_APPS_DEPLOY_STUCK_MINUTES,
  AI_APPS_DEPLOY_STUCK_MS,
  AI_APPS_HELM_LOCK_RETRIES,
  AI_APPS_HELM_LOCK_RETRY_INTERVAL_MS,
  AI_APPS_LOGS_DESC_CACHE_MAX_ENTRIES,
  AI_APPS_LOGS_DESC_CACHE_STALE_TTL_MS,
  AI_APPS_LOGS_DESC_CACHE_TTL_MS,
  AI_APPS_LOGS_DESC_DEFAULT_LIMIT,
  AI_APPS_LOGS_DESC_MAX_LIMIT,
  AI_APPS_LOGS_DESC_MAX_RUNNER_CALLS,
  AI_APPS_LOGS_DESC_NARROWINGS,
  AI_APPS_LOGS_DESC_RETAIN,
  AI_APPS_LOGS_DESC_RUNNER_LIMIT,
  AI_APPS_LOGS_DESC_TIME_BUDGET_MS,
  AI_APPS_NOTIFICATION_MESSAGES,
  AI_APPS_NOTIFICATION_TRIGGERS,
  AI_APPS_RUNNER_ENVIRONMENT,
  AI_APPS_RUNNER_TOKEN,
  AI_APPS_RUNNER_URL,
  AI_APPS_S3_BUCKET,
  AI_APPS_PRD_S3_BUCKET,
  AI_APPS_STARTER_KIT_VERSION,
  AI_APPS_TRACK_MAX_BATCH_EVENTS,
  AI_APPS_TRACK_MAX_PROPERTIES_BYTES,
  AI_APPS_VERIFY_ATTEMPTS,
  AI_APPS_VERIFY_INTERVAL_MS,
  AI_APPS_WAU_WINDOW_MS,
  aiAppDetailPath,
  buildAppHost,
  buildAppHttpUrl,
  buildAppPageUrl,
  buildAppS3Key,
  buildAppUrl,
  buildPrdPublicUrl,
  buildPrdS3Key,
  buildRunnerDeploymentsUrl,
  buildRunnerLogsUrl,
  buildRunnerMetricsUrl,
  buildRunnerSecretsUrl,
  normalizeAiAppEventName,
} from './ai-apps.constants';

/**
 * Edge/gateway statuses that mean "the app isn't reachable (yet)" — verify,
 * don't fail. 530 is Cloudflare's origin-DNS error, served while the app's
 * subdomain isn't registered yet.
 */
const GATEWAY_TIMEOUT_STATUSES = [408, 502, 503, 504, 521, 522, 523, 524, 530];

function isBlankFeedbackHtml(html: string): boolean {
  const stripped = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return stripped.length === 0 && !/<img\b/i.test(html);
}

/** Non-sensitive database metadata the runner returns once it provisions one. Never a password. */
interface RunnerDeployDatabaseInfo {
  host?: string;
  port?: number;
  name?: string;
  user?: string;
  type?: string;
  credentialsInjected?: boolean;
}

interface RunnerDeployResponse {
  status?: string;
  host?: string;
  url?: string;
  httpUrl?: string;
  port?: number;
  database?: RunnerDeployDatabaseInfo;
}

type AiAppMember = { uid: string; name: string; image: string | null };

/** Response shape across all AI Apps endpoints: `memberUid` replaced by `member`. */
type WithMember<T extends { memberUid: string }> = Omit<T, 'memberUid'> & { member: AiAppMember | null };

/** What is actually serving traffic — independent of whether the LATEST deploy succeeded. */
type AiAppServing = 'latest' | 'previous' | 'none';

/**
 * Deploy-outcome block on app responses (contract shared with the frontend).
 * `failureReason`/`failureStream` are manager-only: the runner's failure text
 * can carry stack fragments, image names, and internal hostnames.
 */
interface AiAppDeploymentInfo {
  serving: AiAppServing;
  failureReason?: string;
  failureStream?: 'build' | 'runtime';
}

/**
 * Database block on app responses: everyone sees whether a database was
 * requested; connection metadata (never the password) appears once the
 * Deployment Orchestrator reports it provisioned. Also the exact shape stored
 * in the `AiApp.database` JSON column — no separate storage/response shapes.
 */
interface AiAppDatabaseInfo {
  enabled: boolean;
  type?: string | null;
  host?: string | null;
  port?: number | null;
  name?: string | null;
  user?: string | null;
  credentialsInjected?: boolean | null;
}

/** App responses: the raw `failureStream`/`database` columns replaced by requester-facing `deployment`/`database` blocks. */
type ApiAiApp<T extends { memberUid: string }> = Omit<WithMember<T>, 'failureStream' | 'database'> & {
  deployment: AiAppDeploymentInfo;
  database: AiAppDatabaseInfo;
  weeklyActiveUsers: number;
};

@Injectable()
export class AiAppsService {
  private readonly logger = new Logger(AiAppsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly awsService: AwsService,
    private readonly pushNotifications: PushNotificationsService,
    private readonly analyticsService: AnalyticsService
  ) {}

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

  /**
   * Custom event ingestion from a deployed AI App (`POST /v1/ai-apps/track`).
   * Guests count — auth is optional and never rejecting. Attribution
   * (`source`, `appId`, `appUid`, `appName`, `memberUid`) is always resolved
   * server-side from the request and overwrites anything client-sent. Every
   * drop path (unknown origin, no usable identity, oversized payload, batch
   * limit) is silent — the controller always answers 204, so a scripted
   * caller gets no signal about which check it hit.
   */
  async trackAppEvent(params: {
    origin: string | undefined;
    token: string | undefined;
    anonId: string | undefined;
    event: string | undefined;
    properties: Record<string, unknown> | undefined;
    events: Array<{ event?: string; properties?: Record<string, unknown> }> | undefined;
  }): Promise<void> {
    const app = await this.resolveAppFromOrigin(params.origin);
    if (!app) {
      return;
    }

    const items = params.events?.length
      ? params.events
      : params.event
      ? [{ event: params.event, properties: params.properties }]
      : [];
    if (!items.length || items.length > AI_APPS_TRACK_MAX_BATCH_EVENTS) {
      return;
    }

    const memberUid = await this.resolveOptionalMemberUid(params.token);
    const distinctId = memberUid ?? (params.anonId && AI_APP_ANON_ID_REGEX.test(params.anonId) ? params.anonId : null);
    if (!distinctId) {
      return;
    }

    const attribution: Record<string, unknown> = {
      source: 'ai-app',
      appId: app.appId,
      appUid: app.uid,
      appName: app.name,
    };
    if (memberUid) {
      attribution.memberUid = memberUid;
    }

    await Promise.all(
      items.map(async (item) => {
        if (typeof item.event !== 'string' || !item.event.trim()) {
          return;
        }
        const properties = this.sanitizeTrackProperties(item.properties);
        if (properties === null) {
          return;
        }
        await this.analyticsService.trackEvent({
          name: normalizeAiAppEventName(item.event),
          distinctId,
          properties: { ...properties, ...attribution },
        });
      })
    );
  }

  /**
   * Resolve the live (non-`DELETED`) app for a track request's `Origin`
   * header host (`<appId>.<AI_APPS_APP_DOMAIN>`). `appId` is only unique
   * per-member, so a global hostname can match several rows — pick the most
   * recently deployed one and log rather than guess.
   */
  private async resolveAppFromOrigin(origin: string | undefined): Promise<AiApp | null> {
    if (!origin) {
      return null;
    }
    let hostname: string;
    try {
      hostname = new URL(origin).hostname.toLowerCase();
    } catch {
      return null;
    }
    const suffix = `.${AI_APPS_APP_DOMAIN}`;
    if (!hostname.endsWith(suffix)) {
      return null;
    }
    const appId = hostname.slice(0, -suffix.length);
    if (!appId) {
      return null;
    }

    const candidates = await this.prisma.aiApp.findMany({ where: { appId, status: { not: 'DELETED' } } });
    if (!candidates.length) {
      return null;
    }
    if (candidates.length === 1) {
      return candidates[0];
    }
    this.logger.warn(`Multiple live AiApp rows found for appId=${appId}; using the most recently deployed`);
    return candidates.reduce((latest, candidate) => {
      const latestTime = (latest.lastDeployedAt ?? latest.updatedAt).getTime();
      const candidateTime = (candidate.lastDeployedAt ?? candidate.updatedAt).getTime();
      return candidateTime > latestTime ? candidate : latest;
    });
  }

  /**
   * Optional identity check for `trackAppEvent`: a valid Bearer/cookie token
   * resolves to a memberUid; a missing/invalid/expired token (or an
   * introspection failure) resolves to `null` — this must never throw, guest
   * usage has to keep counting.
   */
  private async resolveOptionalMemberUid(token: string | undefined): Promise<string | null> {
    if (!token) {
      return null;
    }
    try {
      const { data } = await axios.post(`${process.env.AUTH_API_URL}/auth/introspect`, { token });
      if (!data?.active || !data?.email) {
        return null;
      }
      const member = await this.prisma.member.findFirst({
        where: { email: { equals: data.email, mode: 'insensitive' } },
        select: { uid: true },
      });
      return member?.uid ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Strips PostHog-reserved (`$…`), PII-shaped (`email`/`name`), and
   * attribution-shaped (`memberUid`) keys from an app's event properties,
   * then enforces the per-event size cap. `memberUid` is stripped even for
   * guests — otherwise a spoofed value would survive attribution stamping
   * (which only sets `memberUid` when identity was actually verified) and
   * let an app attach events to an arbitrary member's profile. Returns
   * `null` when the cleaned payload is still oversized — the caller drops
   * the whole event rather than truncating it.
   */
  private sanitizeTrackProperties(raw: unknown): Record<string, unknown> | null {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (key.startsWith('$')) continue;
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'email' || lowerKey === 'name' || lowerKey === 'memberuid') continue;
      cleaned[key] = value;
    }
    if (Buffer.byteLength(JSON.stringify(cleaned)) > AI_APPS_TRACK_MAX_PROPERTIES_BYTES) {
      return null;
    }
    return cleaned;
  }

  /**
   * The requester-gated response shape: the raw `failureStream` column never
   * leaves the API, `notes` is nulled for non-managers (runner failure text is
   * internal), and both reappear inside `deployment` for managers.
   * `deployment.serving` goes to everyone — it's derived state, not detail:
   * 'latest' = the current build serves; 'previous' = it last shipped
   * successfully at `lastDeployedAt` and the runner keeps the old release
   * serving through a failed rollout; 'none' = never shipped (strict — the
   * only writer of `lastDeployedAt` is markReady).
   */
  private toApiApp<T extends AiApp>(app: WithMember<T>, isManager: boolean, weeklyActiveUsers = 0): ApiAiApp<T> {
    const { failureStream, database: storedDatabase, ...rest } = app;
    const serving: AiAppServing = app.status === 'READY' ? 'latest' : app.lastDeployedAt ? 'previous' : 'none';
    const deployment: AiAppDeploymentInfo = { serving };
    if (isManager) {
      if (app.notes) {
        deployment.failureReason = app.notes;
      }
      if (failureStream === 'build' || failureStream === 'runtime') {
        deployment.failureStream = failureStream;
      }
    }
    const parsedDatabase = storedDatabase as AiAppDatabaseInfo | null;
    const database: AiAppDatabaseInfo = parsedDatabase?.enabled ? parsedDatabase : { enabled: false };
    return {
      ...rest,
      notes: isManager ? app.notes : null,
      deployment,
      database,
      viewCount: app.viewCount ?? 0,
      weeklyActiveUsers,
    };
  }

  private wauSince(): Date {
    return new Date(Date.now() - AI_APPS_WAU_WINDOW_MS);
  }

  /** Distinct members who loaded an app's iframe within the rolling WAU window. */
  private async weeklyActiveUsersByApp(appUids: string[]): Promise<Map<string, number>> {
    if (!appUids.length) {
      return new Map();
    }
    const rows = await this.prisma.aiAppActiveMember.groupBy({
      by: ['appUid'],
      where: { appUid: { in: appUids }, lastSeenAt: { gte: this.wauSince() } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.appUid, row._count._all]));
  }

  /**
   * Record a Directory iframe load: increment all-time views without bumping
   * `updatedAt` (a view must not reshuffle the dashboard list) and stamp the
   * member as active for WAU.
   */
  async recordView(memberUid: string, uid: string): Promise<void> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }

    const updated = await this.prisma.$executeRaw`
      UPDATE "AiApp" SET "viewCount" = "viewCount" + 1
      WHERE uid = ${uid} AND status <> 'DELETED'
    `;
    if (updated === 0) {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }

    await this.prisma.aiAppActiveMember.upsert({
      where: { appUid_memberUid: { appUid: uid, memberUid } },
      create: { appUid: uid, memberUid, lastSeenAt: new Date() },
      update: { lastSeenAt: new Date() },
    });
  }

  /** Dashboard list — all non-deleted apps across PL Infra users, newest first, with owner info. */
  async listApps(requesterUid?: string): Promise<Array<ApiAiApp<AiApp>>> {
    const apps = await this.prisma.aiApp.findMany({
      where: { status: { not: 'DELETED' } },
      orderBy: { updatedAt: 'desc' },
    });
    const settled = await Promise.all(apps.map((app) => this.settleStuckDeploy(app)));
    // One admin lookup for the requester, then a per-row creator compare —
    // never a per-row query.
    const isAdmin = !!requesterUid && (await this.isRequesterDirectoryAdmin(requesterUid));
    const withMembers = await this.withMember(settled);
    const wau = await this.weeklyActiveUsersByApp(settled.map((app) => app.uid));
    return withMembers.map((app, index) =>
      this.toApiApp(
        app,
        isAdmin || (!!requesterUid && settled[index].memberUid === requesterUid),
        wau.get(settled[index].uid) ?? 0
      )
    );
  }

  /**
   * Single app detail. When the requester is known, the response carries
   * `canManage` (creator or directory admin) — computed server-side so the UI
   * never has to compare member uids from a possibly stale login cookie.
   */
  async getApp(uid: string, requesterUid?: string): Promise<ApiAiApp<AiApp> & { canManage?: boolean }> {
    let app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app) {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    app = await this.settleStuckDeploy(app);
    const result = (await this.withMember([app]))[0];
    const wau = await this.weeklyActiveUsersByApp([app.uid]);
    const weeklyActiveUsers = wau.get(app.uid) ?? 0;
    if (!requesterUid) {
      return this.toApiApp(result, false, weeklyActiveUsers);
    }
    const canManage = await this.isCreatorOrDirectoryAdmin(requesterUid, app);
    return { ...this.toApiApp(result, canManage, weeklyActiveUsers), canManage };
  }

  /** Updates dashboard metadata only; this never invokes the sandbox runner or starts a deploy. */
  async updateMetadata(
    requesterUid: string,
    uid: string,
    dto: UpdateAppMetadataDto,
    ownerOnly = false
  ): Promise<ApiAiApp<AiApp>> {
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
    return this.toApiApp((await this.withMember([updated]))[0], true);
  }

  /** Update metadata from JSON or multipart; a PRD file overrides body.prd. */
  async updateMetadataWithOptionalPrdFile(
    requesterUid: string,
    uid: string,
    dto: UpdateAppMetadataDto,
    file?: Express.Multer.File
  ): Promise<ApiAiApp<AiApp>> {
    if (!file) {
      return this.updateMetadata(requesterUid, uid, dto);
    }
    if (dto.prd !== undefined) {
      throw new BadRequestException('Send either prd text or a PRD file, not both');
    }
    return this.storePrdFile(requesterUid, uid, file, dto);
  }

  /** File-only PRD upload used by POST /:uid/prd. */
  async uploadPrd(requesterUid: string, uid: string, file: Express.Multer.File): Promise<ApiAiApp<AiApp>> {
    return this.storePrdFile(requesterUid, uid, file, {} as UpdateAppMetadataDto);
  }

  /** Validate a Markdown/HTML PRD file, upload it, and persist only its S3 key. */
  private async storePrdFile(
    requesterUid: string,
    uid: string,
    file: Express.Multer.File,
    metadata: UpdateAppMetadataDto
  ): Promise<ApiAiApp<AiApp>> {
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
   * CloudWatch logs for one app + phase for the connected member's agent
   * (deploy-token auth) to debug failed builds and runtime errors — owner-only,
   * like the agent metadata route. Delegates the runner proxy to
   * `fetchRunnerLogs`.
   */
  async getAgentLogs(
    requesterUid: string,
    uid: string,
    phase: AiAppLogPhase,
    query: { limit?: number; sinceMinutes?: number; nextToken?: string }
  ): Promise<unknown> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    if (app.memberUid !== requesterUid) {
      throw new ForbiddenException('The agent may read logs only for apps owned by its connected member');
    }
    return this.fetchRunnerLogs(app, phase, query);
  }

  /**
   * Same runner logs for a signed-in member from the LabOS dashboard (member
   * JWT + `ai_apps.read`), but gated to the app's creator OR a directory admin
   * — so an admin can debug any app's build/runtime logs without holding a
   * deploy token. The stricter agent route stays owner-only.
   */
  async getMemberLogs(
    requesterUid: string,
    uid: string,
    phase: AiAppLogPhase,
    query: { limit?: number; sinceMinutes?: number; nextToken?: string }
  ): Promise<unknown> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    if (!(await this.isCreatorOrDirectoryAdmin(requesterUid, app))) {
      throw new ForbiddenException('Only the app creator or a directory admin can view logs');
    }
    return this.fetchRunnerLogs(app, phase, query);
  }

  /**
   * Newest-first member log reads (`order=desc`) — what the dashboard's
   * deployment-logs modal shows. The runner (CloudWatch behind it) only pages
   * FORWARD from the window start, so the tail is assembled here: walk every
   * runner page server-side keeping the newest AI_APPS_LOGS_DESC_RETAIN lines,
   * then serve descending slices. The opaque nextToken encodes an offset from
   * the newest line plus the window the walk used, so "load earlier" pages
   * read a consistent slice of history. Unlike the forward routes, the
   * response here is allowlisted to `{ events, nextToken }` with numeric
   * epoch-ms timestamps (the runner has been seen sending strings).
   */
  async getMemberLogsDesc(
    requesterUid: string,
    uid: string,
    phase: AiAppLogPhase,
    query: { limit?: number; sinceMinutes?: number; nextToken?: string }
  ): Promise<{ events: { timestamp: number; message: string }[]; nextToken?: string }> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    if (!(await this.isCreatorOrDirectoryAdmin(requesterUid, app))) {
      throw new ForbiddenException('Only the app creator or a directory admin can view logs');
    }

    const limit = Math.min(Math.max(query.limit ?? AI_APPS_LOGS_DESC_DEFAULT_LIMIT, 1), AI_APPS_LOGS_DESC_MAX_LIMIT);
    const cursor = this.decodeDescCursor(query.nextToken);
    // A cursor pins the window its first page walked; later pages must read
    // the same slice of history (and hit the same cache entry).
    let windowMinutes = cursor ? cursor.w : query.sinceMinutes;

    let walk = await this.walkRunnerLogsTail(app, phase, windowMinutes);
    if (!walk.complete && !cursor && query.sinceMinutes !== undefined) {
      // The window is too chatty to walk in one budget. Narrowing keeps the
      // tail — it's the end of any window that reaches "now" — so retry with
      // progressively smaller windows before giving up.
      for (const divisor of AI_APPS_LOGS_DESC_NARROWINGS) {
        windowMinutes = Math.max(1, Math.floor(query.sinceMinutes / divisor));
        walk = await this.walkRunnerLogsTail(app, phase, windowMinutes);
        if (walk.complete) break;
      }
    }
    if (!walk.complete) {
      throw new BadGatewayException(
        'Log volume is too large to assemble a newest-first view — retry with a narrower sinceMinutes window'
      );
    }

    const all = walk.events; // ascending, at most AI_APPS_LOGS_DESC_RETAIN newest lines
    const offset = cursor?.o ?? 0;
    const end = Math.max(0, all.length - offset);
    const start = Math.max(0, end - limit);
    const events = all.slice(start, end).reverse(); // newest-first within the page
    const hasEarlier = start > 0;

    return {
      events,
      nextToken: hasEarlier ? this.encodeDescCursor({ o: offset + events.length, w: windowMinutes }) : undefined,
    };
  }

  /**
   * Walk the runner's forward pages to the end of the stream, keeping only the
   * newest lines (ascending). `complete: false` means a bound tripped before
   * the end — the buffer then holds the OLDEST part of the window and must
   * never be served as "newest", so the caller narrows or fails.
   *
   * The cold walk is sequential runner→CloudWatch paging and can take many
   * seconds even over a sparse window (empty pages still carry tokens that
   * must be chased to the true end), so reads are cached and coalesced:
   * - FRESH cache entry → answered from cache.
   * - STALE-but-recent entry → ALSO answered from cache instantly, while one
   *   background walk revalidates it (stale-while-revalidate).
   * - miss → concurrent identical requests share a single in-flight walk
   *   instead of each paging the runner through the same chain.
   */
  private walkRunnerLogsTail(
    app: Pick<AiApp, 'appId'>,
    phase: AiAppLogPhase,
    sinceMinutes: number | undefined
  ): Promise<{ events: { timestamp: number; message: string }[]; complete: boolean }> {
    const cacheKey = `${app.appId}:${phase}:${sinceMinutes ?? 'all'}`;
    const entry = this.logsTailCache.get(cacheKey);
    const now = Date.now();
    if (entry && entry.evictAt <= now) {
      this.logsTailCache.delete(cacheKey);
    } else if (entry) {
      if (entry.staleAt <= now) {
        // Revalidation failure only logs — the stale copy stays valid until
        // evictAt, and the read after that pays the cold walk (and its error).
        this.startLogsTailWalk(app, phase, sinceMinutes, cacheKey).catch((error) => {
          this.logger.warn(
            `Background ${phase}-logs revalidation failed for ${app.appId}: ${(error as Error).message}`
          );
        });
      }
      return Promise.resolve({ events: entry.events, complete: true });
    }
    return this.startLogsTailWalk(app, phase, sinceMinutes, cacheKey);
  }

  /** One walk per key at a time: concurrent identical requests await the same promise. */
  private startLogsTailWalk(
    app: Pick<AiApp, 'appId'>,
    phase: AiAppLogPhase,
    sinceMinutes: number | undefined,
    cacheKey: string
  ): Promise<{ events: { timestamp: number; message: string }[]; complete: boolean }> {
    const inFlight = this.logsTailWalks.get(cacheKey);
    if (inFlight) return inFlight;
    const walk = this.runLogsTailWalk(app, phase, sinceMinutes, cacheKey).finally(() => {
      this.logsTailWalks.delete(cacheKey);
    });
    this.logsTailWalks.set(cacheKey, walk);
    return walk;
  }

  private async runLogsTailWalk(
    app: Pick<AiApp, 'appId'>,
    phase: AiAppLogPhase,
    sinceMinutes: number | undefined,
    cacheKey: string
  ): Promise<{ events: { timestamp: number; message: string }[]; complete: boolean }> {
    const startedAt = Date.now();
    let token: string | undefined;
    let buffer: { timestamp: number; message: string }[] = [];

    for (let call = 0; call < AI_APPS_LOGS_DESC_MAX_RUNNER_CALLS; call++) {
      const body = (await this.fetchRunnerLogs(app, phase, {
        limit: AI_APPS_LOGS_DESC_RUNNER_LIMIT,
        sinceMinutes,
        nextToken: token,
      })) as { events?: unknown; nextToken?: unknown } | null;

      const pageEvents = Array.isArray(body?.events) ? body!.events : [];
      for (const raw of pageEvents) {
        const entry = raw as { timestamp?: unknown; message?: unknown };
        if (typeof entry?.message !== 'string') continue;
        buffer.push({ timestamp: this.toEpochMs(entry.timestamp), message: entry.message });
      }
      // The walk is chronological, so trimming the front keeps the newest.
      if (buffer.length > AI_APPS_LOGS_DESC_RETAIN * 2) {
        buffer.sort((a, b) => a.timestamp - b.timestamp);
        buffer = buffer.slice(-AI_APPS_LOGS_DESC_RETAIN);
      }

      const next = typeof body?.nextToken === 'string' ? body.nextToken : undefined;
      // CloudWatch never nulls the token at end-of-stream; the real end is no
      // token or the token we just sent echoed back.
      if (!next || next === token) {
        buffer.sort((a, b) => a.timestamp - b.timestamp);
        const events = buffer.slice(-AI_APPS_LOGS_DESC_RETAIN);
        this.writeLogsTailCache(cacheKey, app.appId, startedAt, events);
        return { events, complete: true };
      }
      token = next;

      if (Date.now() - startedAt > AI_APPS_LOGS_DESC_TIME_BUDGET_MS) {
        return { events: [], complete: false };
      }
    }

    return { events: [], complete: false };
  }

  /** Runner timestamps arrive as numbers, ISO strings, or numeric strings; anything else sorts as 0. */
  private toEpochMs(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value !== '') {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
    }
    return 0;
  }

  private encodeDescCursor(cursor: { o: number; w?: number }): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeDescCursor(token: string | undefined): { o: number; w?: number } | undefined {
    if (token === undefined) return undefined;
    try {
      const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
      const offset = parsed?.o;
      const window = parsed?.w;
      if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) throw new Error('bad offset');
      if (window !== undefined && (typeof window !== 'number' || !Number.isInteger(window) || window < 1)) {
        throw new Error('bad window');
      }
      return { o: offset, w: window };
    } catch {
      throw new BadRequestException('Invalid nextToken for order=desc — use the token from a previous desc response');
    }
  }

  /** Per-instance cache of completed tail walks, so scrolling history doesn't re-walk the runner per page. */
  private readonly logsTailCache = new Map<
    string,
    { staleAt: number; evictAt: number; events: { timestamp: number; message: string }[] }
  >();

  /** In-flight walks by cache key — concurrent identical requests share one runner walk. */
  private readonly logsTailWalks = new Map<
    string,
    Promise<{ events: { timestamp: number; message: string }[]; complete: boolean }>
  >();

  /** When each app's walks were last invalidated by a deploy — see writeLogsTailCache. */
  private readonly logsTailDroppedAt = new Map<string, number>();

  private writeLogsTailCache(
    key: string,
    appId: string,
    walkStartedAt: number,
    events: { timestamp: number; message: string }[]
  ): void {
    // A walk that began before the app's last deploy captured the PREVIOUS
    // deployment's stream — never cache it (returning it once is fine; the
    // next read re-walks fresh).
    if ((this.logsTailDroppedAt.get(appId) ?? 0) > walkStartedAt) return;
    if (!this.logsTailCache.has(key) && this.logsTailCache.size >= AI_APPS_LOGS_DESC_CACHE_MAX_ENTRIES) {
      // Maps iterate in insertion order — dropping the first key is a cheap FIFO.
      const oldest = this.logsTailCache.keys().next().value;
      if (oldest !== undefined) this.logsTailCache.delete(oldest);
    }
    const now = Date.now();
    this.logsTailCache.set(key, {
      staleAt: now + AI_APPS_LOGS_DESC_CACHE_TTL_MS,
      evictAt: now + AI_APPS_LOGS_DESC_CACHE_STALE_TTL_MS,
      events,
    });
  }

  /**
   * A new deploy invalidates every cached walk for the app — serve-stale must
   * never show the previous deployment's lines to someone watching the new one.
   */
  private dropLogsTailCache(appId: string): void {
    this.logsTailDroppedAt.set(appId, Date.now());
    const prefix = `${appId}:`;
    for (const key of this.logsTailCache.keys()) {
      if (key.startsWith(prefix)) this.logsTailCache.delete(key);
    }
  }

  /**
   * Proxies one app + phase's CloudWatch logs verbatim from the sandbox runner
   * (`GET /v1/apps/<appId>/<phase>/logs`), keeping the runner token server-side.
   * The response envelope (`events`, `nextToken`, `logGroup`, …) is the runner's
   * own; CloudWatch may return an empty `events` page WITH a `nextToken`, so
   * pagination is the caller's job. Access checks are the caller's job.
   */
  private async fetchRunnerLogs(
    app: Pick<AiApp, 'appId'>,
    phase: AiAppLogPhase,
    query: { limit?: number; sinceMinutes?: number; nextToken?: string }
  ): Promise<unknown> {
    const params: Record<string, string | number> = {};
    if (query.limit !== undefined) params.limit = query.limit;
    if (query.sinceMinutes !== undefined) params.sinceMinutes = query.sinceMinutes;
    if (query.nextToken !== undefined) params.nextToken = query.nextToken;

    try {
      const response = await axios.get(buildRunnerLogsUrl(app.appId, phase), {
        headers: { 'x-runner-token': AI_APPS_RUNNER_TOKEN },
        params,
        timeout: 30000,
      });
      this.logger.log(`Runner ${phase}-logs response for ${app.appId}: status=${response.status}`);
      return response.data;
    } catch (error) {
      this.logRunnerError(`${phase}-logs`, app.appId, error);
      throw new BadGatewayException(`Failed to fetch ${phase} logs from the sandbox runner`);
    }
  }

  /**
   * Admin-only live metrics snapshot (no history) for one app: current
   * per-container CPU/memory from the runner (metrics-server) alongside the
   * configured resource limits, so PL Infra can sanity-check the limits
   * against real usage. Restricted to directory admins — unlike the log
   * routes (creator-or-admin), this is capacity planning, not member-facing
   * debugging.
   */
  async getMetrics(requesterUid: string, appUid: string): Promise<unknown> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid: appUid } });
    if (!app) {
      throw new NotFoundException(`AI App not found: ${appUid}`);
    }
    if (!(await this.isRequesterDirectoryAdmin(requesterUid))) {
      throw new ForbiddenException('Only a directory admin can view app metrics');
    }

    try {
      const response = await axios.get(buildRunnerMetricsUrl(app.appId), {
        headers: { 'x-runner-token': AI_APPS_RUNNER_TOKEN },
        timeout: 15000,
      });
      return response.data;
    } catch (error) {
      this.logRunnerError('metrics', app.appId, error);
      throw new BadGatewayException('Failed to fetch metrics from the sandbox runner');
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
      // failureStream stays null: an interrupted deploy's failing phase is
      // genuinely unknown (and a stale value from an older failure must not leak).
      data: { status: 'ERROR', notes: message, failureStream: null },
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
      await this.notifyDeployFailed(app);
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
   * Stores feedback from a member viewing the app's detail page. Text may be
   * Quill HTML (headings, links, images). Any member with AI Apps access may
   * submit, and may do so more than once per app.
   */
  async submitFeedback(memberUid: string, appUid: string, text: string): Promise<WithMember<AiAppFeedback>> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid: appUid } });
    if (!app) {
      throw new NotFoundException(`AI App not found: ${appUid}`);
    }
    const sanitized = DOMPurify.sanitize(text);
    if (isBlankFeedbackHtml(sanitized)) {
      throw new BadRequestException('Feedback text is required');
    }
    const feedback = await this.prisma.aiAppFeedback.create({
      data: { appUid: app.uid, memberUid, text: sanitized },
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

  /**
   * All feedback the requester can review, newest first, tagged with `appName`.
   * Directory admins see every non-deleted app; everyone else only apps they
   * created. Skips deleted apps so the list matches the dashboard catalog.
   */
  async listAccessibleFeedback(requesterUid: string): Promise<Array<WithMember<AiAppFeedback> & { appName: string }>> {
    const isAdmin = await this.isRequesterDirectoryAdmin(requesterUid);
    const apps = await this.prisma.aiApp.findMany({
      where: isAdmin ? { status: { not: 'DELETED' } } : { memberUid: requesterUid, status: { not: 'DELETED' } },
      select: { uid: true, name: true },
    });
    if (apps.length === 0) {
      return [];
    }
    const appNameByUid = new Map(apps.map((app) => [app.uid, app.name]));
    const feedback = await this.prisma.aiAppFeedback.findMany({
      where: { appUid: { in: apps.map((app) => app.uid) } },
      orderBy: { createdAt: 'desc' },
    });
    const withMembers = await this.withMember(feedback);
    return withMembers.map((row) => ({ ...row, appName: appNameByUid.get(row.appUid) ?? '' }));
  }

  /**
   * Sets the shared review status on one feedback row. Any of NEW / VIEWED /
   * IMPLEMENTED is always allowed (skips and backwards moves included). Restricted
   * to the app's creator and directory admins; no notification is sent.
   */
  async updateFeedbackStatus(
    requesterUid: string,
    appUid: string,
    feedbackUid: string,
    status: AiAppFeedbackStatus
  ): Promise<WithMember<AiAppFeedback>> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid: appUid } });
    if (!app) {
      throw new NotFoundException(`AI App not found: ${appUid}`);
    }
    if (!(await this.isCreatorOrDirectoryAdmin(requesterUid, app))) {
      throw new ForbiddenException('Only the app creator or a directory admin can update feedback status');
    }
    const feedback = await this.prisma.aiAppFeedback.findUnique({ where: { uid: feedbackUid } });
    if (!feedback || feedback.appUid !== app.uid) {
      throw new NotFoundException(`AI App feedback not found: ${feedbackUid}`);
    }
    const updated = await this.prisma.aiAppFeedback.update({
      where: { uid: feedbackUid },
      data: { status },
    });
    return (await this.withMember([updated]))[0];
  }

  /** True when the requester created the app or is a directory admin. */
  private async isCreatorOrDirectoryAdmin(requesterUid: string, app: Pick<AiApp, 'memberUid'>): Promise<boolean> {
    if (app.memberUid === requesterUid) {
      return true;
    }
    return this.isRequesterDirectoryAdmin(requesterUid);
  }

  /**
   * The sandbox runner namespaces everything by appId ALONE (helm release
   * `<environment>-<appId>`, host `<appId>.<domain>`, secret store, provisioned
   * database), while our rows are unique per (memberUid, appId) — so two members
   * holding the same appId would share ONE physical deployment: each deploy
   * overwrites the other's live app, and a delete tears the other's down. Block
   * claiming an appId that is live under another member. A DELETED row releases
   * the claim (its runner deployment is already torn down).
   */
  private async assertAppIdNotClaimedByAnotherMember(memberUid: string, appId: string): Promise<void> {
    const claimedByOther = await this.prisma.aiApp.findFirst({
      where: { appId, memberUid: { not: memberUid }, status: { not: 'DELETED' } },
      select: { uid: true },
    });
    if (claimedByOther) {
      throw new ConflictException(
        `The appId "${appId}" is already in use by another member's app — pick a different appId`
      );
    }
  }

  /** Requester-only admin check — computed once and reused per row on list responses. */
  private async isRequesterDirectoryAdmin(requesterUid: string): Promise<boolean> {
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
  ): Promise<ApiAiApp<AiApp>> {
    if (!file?.buffer?.length) {
      throw new BadGatewayException('Missing app ZIP file');
    }
    if (!AI_APPS_S3_BUCKET) {
      throw new InternalServerErrorException('AI_APPS_S3_BUCKET is not configured');
    }

    await this.assertAppIdNotClaimedByAnotherMember(memberUid, dto.appId);

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
        database: dto.database ? { enabled: true, type: dto.database.type } : Prisma.DbNull,
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
        // Same "reflects the last upload" rule applies to database provisioning
        // — the kit resends `database` on every deploy once the member opts in.
        database: dto.database ? { enabled: true, type: dto.database.type } : Prisma.DbNull,
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
      // Bundle never reached storage — nothing was built, a build-log story.
      await this.failDeploy(app, memberUid, eventContext, message, 'build');
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
  ): Promise<ApiAiApp<AiApp> & { appPageUrl: string; missingEnvVars: string[] }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing app ZIP file');
    }
    if (!AI_APPS_S3_BUCKET) {
      throw new InternalServerErrorException('AI_APPS_S3_BUCKET is not configured');
    }

    await this.assertAppIdNotClaimedByAnotherMember(memberUid, dto.appId);

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
        database: dto.database ? { enabled: true, type: dto.database.type } : Prisma.DbNull,
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
        database: dto.database ? { enabled: true, type: dto.database.type } : Prisma.DbNull,
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
      ...this.toApiApp((await this.withMember([app]))[0], true),
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
  async deployDraft(requesterUid: string, uid: string, secrets?: Record<string, string>): Promise<ApiAiApp<AiApp>> {
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
    // Legacy duplicate rows (created before the claim guard existed) share one
    // runner deployment — don't let a redeploy clobber the other member's live
    // app. The claim belongs to the app's owner, not the requester (an admin
    // may trigger the deploy on the creator's behalf).
    await this.assertAppIdNotClaimedByAnotherMember(app.memberUid, app.appId);
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
    app: Pick<AiApp, 'uid' | 'appId' | 'name' | 'memberUid' | 'database' | 'lastDeployedAt'>,
    deploymentId: string,
    s3Key: string,
    secretNames: string[] = []
  ): Promise<ApiAiApp<AiApp>> {
    const host = buildAppHost(app.appId);
    const url = buildAppUrl(app.appId);
    const httpUrl = buildAppHttpUrl(app.appId);
    const requestedDatabase = app.database as AiAppDatabaseInfo | null;
    // Snapshot taken before this deploy touches the row — `lastDeployedAt` is
    // only ever set by a PRIOR successful deploy, so null here means this is
    // the app's first ship (only then do we broadcast the deploy-succeeded
    // notification; redeploys/updates stay silent per the PRD).
    const isFirstDeploy = app.lastDeployedAt === null;
    await this.prisma.aiApp.update({
      where: { uid: app.uid },
      data: { status: 'DEPLOYING', deploymentId, s3Key, url, httpUrl, host, notes: null, failureStream: null },
    });
    this.dropLogsTailCache(app.appId);

    const eventContext = { appUid: app.uid, appId: app.appId, deploymentId };

    const markReady = async (port: number | null, databaseInfo?: RunnerDeployDatabaseInfo) => {
      const updated = await this.prisma.aiApp.update({
        where: { uid: app.uid },
        // The ONLY writer of lastDeployedAt — it must strictly mean "last
        // successful ship" (deployment.serving derives 'none' from its absence).
        data: {
          status: 'READY',
          url,
          httpUrl,
          host,
          port,
          notes: null,
          failureStream: null,
          lastDeployedAt: new Date(),
          // Non-sensitive connection metadata the orchestrator reports once it
          // provisions the database, merged into the same JSON blob we asked
          // it to provision from. Never the password — that lives only in the
          // app's injected runtime env vars.
          ...(databaseInfo && requestedDatabase?.enabled
            ? {
                database: {
                  enabled: true,
                  type: requestedDatabase.type ?? null,
                  host: databaseInfo.host ?? null,
                  port: databaseInfo.port ?? null,
                  name: databaseInfo.name ?? null,
                  user: databaseInfo.user ?? null,
                  credentialsInjected: databaseInfo.credentialsInjected ?? null,
                },
              }
            : {}),
        },
      });
      await this.recordEvent('DEPLOY_SUCCEEDED', memberUid, { ...eventContext, message: url });
      if (isFirstDeploy) {
        await this.notifyDeploySucceeded(app);
      }
      return this.toApiApp((await this.withMember([updated]))[0], true);
    };

    let port: number | null = null;
    let databaseInfo: RunnerDeployDatabaseInfo | undefined;
    try {
      this.logger.log(
        `Runner deploy request for ${app.appId}: POST ${AI_APPS_RUNNER_URL}/deploy ` +
          `(deploymentId=${deploymentId}, s3Key=${s3Key}${
            requestedDatabase?.enabled ? `, database=${requestedDatabase.type}` : ''
          })`
      );
      const response = await axios.post<RunnerDeployResponse>(
        `${AI_APPS_RUNNER_URL}/deploy`,
        { appId: app.appId, deploymentId, s3Key },
        { headers: { 'Content-Type': 'application/json', 'x-runner-token': AI_APPS_RUNNER_TOKEN } }
      );
      this.logRunnerResponse('deploy', app.appId, response.status, response.data);
      // The runner sometimes reports failure inside a 2xx body (see
      // logRunnerResponse) — treating that as success would mark a dead deploy
      // READY and corrupt lastDeployedAt/serving.
      if (typeof response.data?.status === 'string' && response.data.status.toLowerCase() === 'failed') {
        const message = `Runner reported failure: ${this.safeStringify(response.data)}`;
        this.logger.error(`AI App deploy failed for ${app.appId}: ${message}`);
        await this.failDeploy(app, memberUid, eventContext, message, 'build');
        throw new BadGatewayException('Failed to deploy app to the sandbox runner');
      }
      port = response.data.port ?? null;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }
      this.logRunnerError('deploy', app.appId, error);
      // Prefer the runner's own classified message (e.g. container_oom_killed's
      // actionable text) verbatim over the full JSON body, so `notes` reads as
      // a clear error instead of an escaped JSON blob.
      const runnerErrorText =
        axios.isAxiosError(error) && typeof error.response?.data?.error === 'string'
          ? error.response.data.error
          : undefined;
      const message = axios.isAxiosError(error)
        ? `Runner error: ${error.response?.status ?? ''} ${
            runnerErrorText ?? JSON.stringify(error.response?.data ?? error.message)
          }`
        : `Deploy failed: ${(error as Error).message}`;

      // A gateway timeout (Cloudflare 504/524, etc.) or no response doesn't mean the
      // deploy failed — the long-running build often completes on the origin. Verify
      // by checking whether the app is actually reachable before declaring failure.
      const uncertain = this.isUncertainRunnerError(error);
      let survivedTimeout = false;
      if (uncertain) {
        this.logger.warn(`Runner timed out for ${app.appId}; verifying app at ${url}. (${message})`);
        survivedTimeout = await this.verifyAppLive(url);
      }
      if (!survivedTimeout) {
        this.logger.error(`AI App deploy failed for ${app.appId}: ${message}`);
        // A hard runner error is a build-phase failure; a timeout with the app
        // never becoming reachable is genuinely unknown (build may have hung OR
        // the pod may have crashed) — leave the stream unclassified.
        await this.failDeploy(app, memberUid, eventContext, message, uncertain ? null : 'build');
        throw new BadGatewayException('Failed to deploy app to the sandbox runner');
      }
      this.logger.log(`AI App ${app.appId} is live despite runner timeout — continuing`);
    }

    // The build ran the app WITHOUT its secrets or database — redeploy the
    // built image through the runner's secret-aware endpoint, which is the
    // only one that actually injects env vars into the running pod (the
    // legacy /deploy build never does, for either secrets or a database). A
    // secrets/database app that can't get its values must fail loudly rather
    // than go READY in a broken state.
    if (secretNames.length || requestedDatabase?.enabled) {
      try {
        databaseInfo = await this.deployImageWithRuntimeConfig(app.appId, secretNames, url, requestedDatabase);
      } catch (error) {
        const message = `Runtime config injection failed: ${(error as Error).message}`;
        this.logger.error(`AI App deploy failed for ${app.appId}: ${message}`);
        // The image already built — injecting/starting it is a runtime story.
        await this.failDeploy(app, memberUid, eventContext, message, 'runtime');
        throw new BadGatewayException('Failed to inject secrets/database on the sandbox runner');
      }
    }

    return markReady(port, databaseInfo);
  }

  /**
   * Redeploys an app's already-built image through the runner's secret-aware
   * endpoint (`POST /v1/projects/<project>/deployments`) — the only one that
   * actually injects env vars (secrets and/or a provisioned database) into
   * the running pod; the legacy `/deploy` build endpoint injects neither. The
   * image reference comes from the runner's own app registry (`GET /apps`).
   * Returns the non-sensitive database metadata the runner reports, if any.
   */
  private async deployImageWithRuntimeConfig(
    appId: string,
    secretNames: string[],
    appUrl: string,
    database?: Pick<AiAppDatabaseInfo, 'enabled' | 'type'> | null
  ): Promise<RunnerDeployDatabaseInfo | undefined> {
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
            `(image=${image}, secretNames=${secretNames.join(', ')}${
              database?.enabled ? `, database=${database.type}` : ''
            })`
        );
        const response = await axios.post<{ database?: RunnerDeployDatabaseInfo }>(
          buildRunnerDeploymentsUrl(),
          {
            appId,
            environment: AI_APPS_RUNNER_ENVIRONMENT,
            image,
            secretNames,
            ...(database?.enabled ? { database: { enabled: true, type: database.type } } : {}),
          },
          { headers }
        );
        this.logRunnerResponse('secrets-deploy', appId, response.status, response.data);
        return response.data?.database;
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
          return undefined;
        }
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        // Prefer the runner's classified message (e.g. container_oom_killed's
        // actionable text) over a bare status code, same as the build-phase path.
        const runnerMessage =
          axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : undefined;
        throw new Error(runnerMessage ?? `runner deployments call failed (status=${status ?? 'n/a'})`);
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

  /**
   * Marks a failed deploy: status ERROR with the trimmed message + DEPLOY_FAILED
   * event. `failureStream` says which log stream holds the failure ('build' |
   * 'runtime'), classified by the caller from where in the deploy flow the
   * failure was caught — the runner's log endpoints only cover the latest
   * SUCCESSFUL phase, so this cannot be derived after the fact. Null = unknown.
   * `lastDeployedAt` is deliberately untouched: a failed deploy never moves it.
   * `actorUid` is who triggered this deploy attempt (audited on DEPLOY_FAILED) —
   * for a member-triggered redeploy that may be a directory admin, not the app
   * owner, so the failure bell notification always goes to `app.memberUid`.
   */
  private async failDeploy(
    app: Pick<AiApp, 'uid' | 'name' | 'memberUid'>,
    actorUid: string,
    eventContext: { appUid: string; appId: string; deploymentId: string },
    message: string,
    failureStream: 'build' | 'runtime' | null = null
  ): Promise<void> {
    await this.prisma.aiApp.update({
      where: { uid: app.uid },
      data: { status: 'ERROR', notes: message.slice(0, 2000), failureStream },
    });
    await this.recordEvent('DEPLOY_FAILED', actorUid, { ...eventContext, message: message.slice(0, 2000) });
    await this.notifyDeployFailed(app);
  }

  /**
   * Broadcasts that a new app just went live, to everyone with AI Apps access
   * (read or write — either grants dashboard visibility). Fired only on an
   * app's FIRST successful deploy (see `isFirstDeploy` in `proxyDeploy`); a
   * later redeploy/update never re-fires this.
   */
  private async notifyDeploySucceeded(app: Pick<AiApp, 'uid' | 'name'>): Promise<void> {
    try {
      await this.pushNotifications.create({
        category: PushNotificationCategory.AI_APP,
        ...AI_APPS_NOTIFICATION_MESSAGES.deploySucceeded(app.name),
        link: aiAppDetailPath(app.uid),
        isPublic: false,
        requiredPermissions: [AI_APPS_PERMISSIONS.READ, AI_APPS_PERMISSIONS.WRITE],
        metadata: {
          eventType: 'ai_app_deploy',
          appUid: app.uid,
          trigger: AI_APPS_NOTIFICATION_TRIGGERS.DEPLOY_SUCCEEDED,
        },
      });
    } catch (error) {
      this.logger.warn(
        `AI App deploy-succeeded notification failed for ${app.uid}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  /** Tells the app's owner (only) that their deploy failed — never a redeploy actor who isn't the owner. */
  private async notifyDeployFailed(app: Pick<AiApp, 'uid' | 'name' | 'memberUid'>): Promise<void> {
    try {
      await this.pushNotifications.create({
        category: PushNotificationCategory.AI_APP,
        ...AI_APPS_NOTIFICATION_MESSAGES.deployFailed(app.name),
        link: aiAppDetailPath(app.uid),
        recipientUid: app.memberUid,
        isPublic: false,
        metadata: {
          eventType: 'ai_app_deploy',
          appUid: app.uid,
          trigger: AI_APPS_NOTIFICATION_TRIGGERS.DEPLOY_FAILED,
        },
      });
    } catch (error) {
      this.logger.warn(
        `AI App deploy-failed notification failed for ${app.uid}: ${error instanceof Error ? error.message : error}`
      );
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
   * trail survives. A runner 404 counts as success — the app has no deployment
   * to tear down (e.g. a draft registered but never deployed, or one already
   * removed on the runner side). `memberUid` is the member performing the
   * deletion.
   */
  async deleteApp(memberUid: string, uid: string): Promise<ApiAiApp<AiApp>> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app) {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    if (!(await this.isCreatorOrDirectoryAdmin(memberUid, app))) {
      throw new ForbiddenException('Only the app creator or a directory admin can delete this app');
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
      return await this.finalizeDelete(memberUid, app.uid, eventContext);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        this.logRunnerResponse('delete', app.appId, error.response.status, error.response.data);
        return await this.finalizeDelete(memberUid, app.uid, eventContext);
      }
      this.logRunnerError('delete', app.appId, error);
      const message = axios.isAxiosError(error)
        ? `Runner error: ${error.response?.status ?? ''} ${JSON.stringify(error.response?.data ?? error.message)}`
        : `Delete failed: ${(error as Error).message}`;
      this.logger.error(`AI App delete failed for ${app.appId}: ${message}`);
      await this.prisma.aiApp.update({
        where: { uid: app.uid },
        data: { status: app.status === 'DELETING' ? 'ERROR' : app.status, notes: message.slice(0, 2000) },
      });
      await this.recordEvent('DELETE_FAILED', memberUid, { ...eventContext, message: message.slice(0, 2000) });
      throw new BadGatewayException('Failed to delete app on the sandbox runner');
    }
  }

  /** Marks the row `DELETED` (keeping it for the audit trail) and records the success event. */
  private async finalizeDelete(
    memberUid: string,
    uid: string,
    eventContext: { appUid: string; appId: string; deploymentId?: string }
  ): Promise<ApiAiApp<AiApp>> {
    const updated = await this.prisma.aiApp.update({
      where: { uid },
      data: { status: 'DELETED', url: null, httpUrl: null, host: null, port: null, notes: null },
    });
    await this.recordEvent('DELETE_SUCCEEDED', memberUid, eventContext);
    return this.toApiApp((await this.withMember([updated]))[0], true);
  }
}
