import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import axios from 'axios';
import { Queue } from 'bull';
import { createHash, randomBytes, randomUUID } from 'crypto';
import DOMPurify from 'isomorphic-dompurify';
import {
  AiApp,
  AiAppEvent,
  AiAppEventType,
  AiAppFeedback,
  AiAppFeedbackComment,
  AiAppFeedbackItemKind,
  AiAppFeedbackPriority,
  AiAppFeedbackReportKind,
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
import { assertValidPublicPaths, samePublicPaths } from './ai-apps-public-paths';
import {
  MAX_PINS_PER_RESPONSE,
  PIN_PUBLIC_SELECT,
  rebuildCommentText,
  toPinCreateData,
  type OverlayFeedbackPin,
  type PublicFeedbackPin,
} from './ai-app-feedback-pins';
import type { FeedbackContext, FeedbackPinInput } from './dto/submit-feedback.dto';
import {
  AiAppLogPhase,
  AiAppTargetEnvironment,
  AI_APP_ANON_ID_REGEX,
  AI_APPS_AGENT_FEEDBACK_LISTED,
  AI_APPS_AGENT_FEEDBACK_STATUS_CHANGED,
  AI_APPS_APP_DOMAIN,
  AI_APPS_DEPLOY_JOB_TIMEOUT_MS,
  AI_APPS_DEPLOY_POLL_DEADLINE_MS,
  AI_APPS_DEPLOY_POLL_INTERVAL_MS,
  AI_APPS_DEPLOY_POLL_INTERVAL_SEC,
  AI_APPS_DEPLOY_QUEUE,
  AI_APPS_DEPLOYMENT_STATUS_ENDPOINT,
  AI_APPS_RUNNER_DEPLOY_TIMEOUT_MS,
  AI_APPS_DEPLOY_REGISTER_GRACE_MS,
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
  aiAppFeedbackPath,
  buildAppHost,
  buildAppHttpUrl,
  buildAppPageUrl,
  buildAppS3Key,
  buildAppUrl,
  releaseNameForTarget,
  buildPrdPublicUrl,
  buildPrdS3Key,
  buildRunnerDeploymentUrl,
  buildRunnerDeploymentsUrl,
  buildRunnerLogsUrl,
  AiAppLogsQuery,
  AI_APPS_LOG_DEPLOYMENT_ID_PATTERN,
  buildRunnerMetricsUrl,
  buildRunnerSecretsUrl,
  normalizeAiAppEventName,
  isReservedAppId,
  normalizeAppTarget,
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
  /** Auth gate (sidecar) version the runner deployed; reported by orchestrators with gate v2 and later. */
  authGateVersion?: number;
  /** The orchestrator's finished deployment record for this build. */
  deployment?: RunnerDeploymentRecord;
}

/** A deployment record as the orchestrator stores and lists it (`GET /v1/projects/<project>/deployments`). */
interface RunnerDeploymentRecord {
  id?: string;
  /** The caller's `deploymentId` for `/deploy` build attempts. */
  deployment_id?: string | null;
  release_name?: string;
  status?: string;
  error?: string | null;
  /** Helm values; `runtimeSecrets.keys` lists the secret keys the deployment attached. */
  values?: unknown;
  created_at?: string;
}

type OrchestratorDeployOutcome =
  | { outcome: 'success' | 'failed'; record: RunnerDeploymentRecord }
  | { outcome: 'unregistered' | 'timeout'; record?: RunnerDeploymentRecord };

/** How far before the attempt a record's `created_at` may be and still belong to it (clock skew). */
const DEPLOYMENT_RECORD_CLOCK_SKEW_MS = 2 * 60 * 1000;

/** The orchestrator's Helm-release-lock error text (a concurrent operation on the same release). */
const HELM_RELEASE_LOCKED_TEXT = 'is already being modified';

/** Runtime secret key present whenever the orchestrator attached a provisioned database's credentials. */
const DATABASE_CREDENTIALS_KEY = 'DATABASE_URL';

const DEPLOY_IN_PROGRESS_MESSAGE =
  'Another deploy of this app is still in progress — wait for it to finish, then deploy again.';

const DEPLOY_NOT_STARTED_MESSAGE =
  'Deploy could not be started: the deploy queue is unavailable. Retry the deploy in a minute.';

/** Coarse progress of a deploy attempt; the background job's resume checkpoint. */
type DeployPhase = 'queued' | 'building' | 'injecting_runtime_config' | 'done' | 'failed';

/** Row state a lock-rejected attempt restores: what the row held before the attempt's DEPLOYING write. */
type DeployRowSnapshot = Pick<
  AiApp,
  'status' | 'deploymentId' | 's3Key' | 'url' | 'httpUrl' | 'host' | 'notes' | 'failureStream' | 'deployPhase'
>;

/** Payload of one queued deploy attempt. Ids only — the bundle is already in S3. */
export interface AiAppDeployJobData {
  attemptId: string;
  /** Who triggered the attempt (audited on the outcome events). */
  actorUid: string;
  appUid: string;
  environment: AiAppTargetEnvironment;
  deploymentId: string;
  s3Key: string;
  secretNames: string[];
  previous: DeployRowSnapshot | null;
  /** Set right before the runner `/deploy` call; a resumed job settles from the orchestrator record from this time. */
  attemptStartedAt?: number;
}

/** The part of a Bull job the deploy job uses. */
export interface AiAppDeployJob {
  data: AiAppDeployJobData;
  update?(data: AiAppDeployJobData): Promise<void>;
}

/** How the pipeline runs for one attempt: which attempt owns the row, and whether it resumes after a restart. */
interface DeployAttempt {
  attemptId: string;
  previous: DeployRowSnapshot | null;
  /** The runner `/deploy` call already went out in an earlier run: settle from the orchestrator record instead. */
  resumeFromRecord: boolean;
  attemptStartedAt?: number;
  recordStart(startedAt: number): Promise<void>;
}

/** Fields the 202 deploy response adds to the app payload. */
interface DeployAcceptedFields {
  statusEndpoint: string;
  pollIntervalSec: number;
}

/** One deployment as the agent's status endpoint reports it. */
export interface AiAppDeploymentStatus {
  uid: string;
  appId: string;
  environment: AiAppTargetEnvironment;
  deploymentId: string | null;
  status: string;
  phase: DeployPhase | null;
  notes: string | null;
  failureStream: 'build' | 'runtime' | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  stale: boolean;
}

function deployRowSnapshot(row: DeployRowSnapshot): DeployRowSnapshot {
  return {
    status: row.status,
    deploymentId: row.deploymentId,
    s3Key: row.s3Key,
    url: row.url,
    httpUrl: row.httpUrl,
    host: row.host,
    notes: row.notes,
    failureStream: row.failureStream,
    deployPhase: row.deployPhase ?? null,
  };
}

/** Absolute status URL for one deployment (preview adds `?environment=preview`). */
function buildDeploymentStatusUrl(appUid: string, deploymentId: string, environment: AiAppTargetEnvironment): string {
  const url = AI_APPS_DEPLOYMENT_STATUS_ENDPOINT.replace('{appUid}', encodeURIComponent(appUid)).replace(
    '{deploymentId}',
    encodeURIComponent(deploymentId)
  );
  return environment === 'preview' ? `${url}?environment=preview` : url;
}

/** Secret keys a deployment record's Helm values attach to the app, or undefined when it attaches none. */
function attachedRuntimeSecretKeys(values: unknown): string[] | undefined {
  const runtimeSecrets = (values as { runtimeSecrets?: { enabled?: unknown; keys?: unknown } } | null | undefined)
    ?.runtimeSecrets;
  if (runtimeSecrets?.enabled !== true || !Array.isArray(runtimeSecrets.keys)) {
    return undefined;
  }
  return runtimeSecrets.keys.filter((key): key is string => typeof key === 'string');
}

/** True when the attached keys already cover every required secret and, if requested, the database credentials. */
function runtimeConfigAlreadyAttached(
  secretNames: string[],
  database: Pick<AiAppDatabaseInfo, 'enabled'> | null | undefined,
  attachedKeys: string[] | undefined
): boolean {
  if (!attachedKeys) {
    return false;
  }
  const attached = new Set(attachedKeys);
  const secretsAttached = secretNames.every((name) => attached.has(name));
  return secretsAttached && (!database?.enabled || attached.has(DATABASE_CREDENTIALS_KEY));
}

type AiAppMember = { uid: string; name: string; image: string | null };

/** Feedback as the feedback reads return it: with its pinned elements, in order, and its reply count. */
type FeedbackWithPins = AiAppFeedback & { pins: PublicFeedbackPin[]; commentCount: number };

/** A reply or closing note as the API returns it (before `memberUid` becomes `member`). */
type FeedbackComment = Pick<AiAppFeedbackComment, 'uid' | 'text' | 'kind' | 'createdAt' | 'editedAt' | 'memberUid'>;
const COMMENT_PUBLIC_SELECT = {
  uid: true,
  text: true,
  kind: true,
  createdAt: true,
  editedAt: true,
  memberUid: true,
} as const;

/** What the read rules need to know about an item. */
type FeedbackItemAccess = Pick<AiAppFeedback, 'uid' | 'appUid' | 'memberUid' | 'kind'>;

/** Most comments one feedback item may hold, so a runaway client or agent can't fill the table. */
export const MAX_COMMENTS_PER_FEEDBACK = 200;

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

/** One environment on the app response. `preview` is null until that target exists. */
interface AiAppTargetView {
  environment: AiAppTargetEnvironment;
  status: string;
  url: string | null;
  httpUrl: string | null;
  host: string | null;
  lastDeployedAt: Date | null;
  serving: AiAppServing;
  requiredEnvVars: string[];
  providedEnvVars: string[];
  hasBuild: boolean;
  kitVersion?: string | null;
  agentClient?: string | null;
  database: AiAppDatabaseInfo;
  failureReason?: string;
  failureStream?: 'build' | 'runtime';
}

/** Set by AiAppTokenGuard when the caller presented a LabOS deployment key. */
export type AiAppKeyScope = { appUid: string; environment: AiAppTargetEnvironment };

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

/**
 * App responses: the raw `failureStream`/`database` columns replaced by
 * requester-facing `deployment`/`database` blocks. `announcedAt` never leaves
 * the API; `directLinkGateReady`, `publicPaths` and `publicPathsGateReady` are
 * manager-only.
 */
type ApiAiApp<T extends { memberUid: string }> = Omit<
  WithMember<T>,
  | 'failureStream'
  | 'database'
  | 'announcedAt'
  | 'directLinkGateReady'
  | 'publicPaths'
  | 'publicPathsGateReady'
  | 'previewAccess'
  | 'deployPhase'
  | 'deployAttemptId'
> & {
  canViewPreview?: boolean;
  deployment: AiAppDeploymentInfo;
  deployments: { prod: AiAppTargetView; preview: AiAppTargetView | null };
  database: AiAppDatabaseInfo;
  weeklyActiveUsers: number;
  directLinkGateReady?: boolean;
  publicPaths?: string[];
  publicPathsGateReady?: boolean;
};

/** One newest-first (`order=desc`) log line as served to the dashboard. */
type DescLogEvent = { timestamp: number; message: string; deploymentId?: string };

@Injectable()
export class AiAppsService {
  private readonly logger = new Logger(AiAppsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly awsService: AwsService,
    private readonly pushNotifications: PushNotificationsService,
    private readonly analyticsService: AnalyticsService,
    @Optional() @InjectQueue(AI_APPS_DEPLOY_QUEUE) private readonly deployQueue?: Queue<AiAppDeployJobData>
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
    /** Member of a verified app session token (the controller checked it against the request origin). */
    sessionMemberUid?: string;
    /** Set for a testing session: the app is the token's audience, not the preview hostname. */
    testingAppId?: string;
    anonId: string | undefined;
    event: string | undefined;
    properties: Record<string, unknown> | undefined;
    events: Array<{ event?: string; properties?: Record<string, unknown> }> | undefined;
  }): Promise<void> {
    const app = params.testingAppId
      ? await this.resolveLiveAppByAppId(params.testingAppId)
      : await this.resolveAppFromOrigin(params.origin);
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

    const memberUid = params.sessionMemberUid ?? (await this.resolveOptionalMemberUid(params.token));
    const distinctId =
      params.testingAppId && memberUid
        ? `testing:${memberUid}`
        : memberUid ?? (params.anonId && AI_APP_ANON_ID_REGEX.test(params.anonId) ? params.anonId : null);
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
    if (params.testingAppId) {
      attribution.testingUser = true;
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

  /** Live app for a testing session's token audience. Same multi-row pick as the origin resolver. */
  private async resolveLiveAppByAppId(appId: string): Promise<AiApp | null> {
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
  private toApiApp<T extends AiApp>(
    app: WithMember<T>,
    isManager: boolean,
    weeklyActiveUsers = 0,
    targetRows: Array<Record<string, any>> = []
  ): ApiAiApp<T> {
    const {
      failureStream,
      database: storedDatabase,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      announcedAt,
      directLinkGateReady,
      publicPaths,
      publicPathsGateReady,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      previewAccess,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      deployPhase,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      deployAttemptId,
      ...rest
    } = app;
    const serving: AiAppServing = this.servingOf(app.status, app.lastDeployedAt);
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
      deployments: {
        prod: this.targetViewFromApp(app, isManager),
        preview: this.previewTargetView(targetRows, isManager),
      },
      database,
      viewCount: app.viewCount ?? 0,
      weeklyActiveUsers,
      ...(isManager ? { directLinkGateReady, publicPaths: publicPaths ?? [], publicPathsGateReady } : {}),
    };
  }

  private servingOf(status: string, lastDeployedAt: Date | null | undefined): AiAppServing {
    return status === 'READY' ? 'latest' : lastDeployedAt ? 'previous' : 'none';
  }

  private databaseView(stored: unknown): AiAppDatabaseInfo {
    const parsed = stored as AiAppDatabaseInfo | null;
    return parsed?.enabled ? parsed : { enabled: false };
  }

  private targetViewFromApp(
    app: Pick<
      AiApp,
      | 'status'
      | 'url'
      | 'httpUrl'
      | 'host'
      | 'lastDeployedAt'
      | 'requiredEnvVars'
      | 'providedEnvVars'
      | 's3Key'
      | 'database'
      | 'notes'
      | 'failureStream'
      | 'kitVersion'
      | 'agentClient'
    >,
    isManager: boolean
  ): AiAppTargetView {
    return this.targetView(
      'prod',
      app.status,
      app.url,
      app.httpUrl,
      app.host,
      app.lastDeployedAt,
      app.requiredEnvVars,
      app.providedEnvVars,
      app.s3Key,
      app.database,
      isManager ? app.notes : null,
      isManager ? app.failureStream : null,
      app.kitVersion,
      app.agentClient
    );
  }

  private previewTargetView(rows: Array<Record<string, any>>, isManager: boolean): AiAppTargetView | null {
    const row = rows.find((entry) => entry.environment === 'preview');
    if (!row) return null;
    return this.targetView(
      'preview',
      row.status,
      row.url ?? null,
      row.httpUrl ?? null,
      row.host ?? null,
      row.lastDeployedAt ?? null,
      row.requiredEnvVars ?? [],
      row.providedEnvVars ?? [],
      row.s3Key ?? null,
      row.database,
      isManager ? row.notes ?? null : null,
      isManager ? row.failureStream ?? null : null,
      row.kitVersion ?? null,
      row.agentClient ?? null
    );
  }

  private targetView(
    environment: AiAppTargetEnvironment,
    status: string,
    url: string | null,
    httpUrl: string | null,
    host: string | null,
    lastDeployedAt: Date | null,
    requiredEnvVars: string[],
    providedEnvVars: string[],
    s3Key: string | null,
    database: unknown,
    notes: string | null,
    failureStream: string | null,
    kitVersion: string | null = null,
    agentClient: string | null = null
  ): AiAppTargetView {
    const view: AiAppTargetView = {
      environment,
      status,
      url,
      httpUrl,
      host,
      lastDeployedAt,
      serving: this.servingOf(status, lastDeployedAt),
      requiredEnvVars,
      providedEnvVars,
      hasBuild: !!s3Key,
      kitVersion,
      agentClient,
      database: this.databaseView(database),
    };
    if (notes) view.failureReason = notes;
    if (failureStream === 'build' || failureStream === 'runtime') view.failureStream = failureStream;
    return view;
  }

  /**
   * Records the auth gate version a deploy (or gate refresh) reported for one target of an app. Kept in its own table
   * so it never bumps the app's `updatedAt`. No-op when the runner reports none (orchestrators before gate v2) or
   * the table isn't generated (specs that stub Prisma); never fails the deploy.
   */
  async recordAuthGateVersion(appUid: string, environment: AiAppTargetEnvironment, version: number | undefined) {
    const table = (this.prisma as any).aiAppAuthGate;
    if (version === undefined || !table?.upsert) return;
    try {
      await table.upsert({
        where: { appUid_environment: { appUid, environment } },
        create: { appUid, environment, version },
        update: { version, lastError: null },
      });
    } catch (error) {
      this.logger.warn(
        `Could not record auth gate v${version} for ${appUid}/${environment}: ${(error as Error).message}`
      );
    }
  }

  /** Present only after `prisma generate`. Specs that stub Prisma omit it. */
  private targetTable(): {
    findMany: (args: any) => Promise<any[]>;
    findUnique: (args: any) => Promise<any | null>;
    upsert: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
    updateMany?: (args: any) => Promise<{ count: number }>;
    deleteMany: (args: any) => Promise<{ count: number }>;
  } | null {
    const table = (this.prisma as any).aiAppTarget;
    return table?.findMany ? table : null;
  }

  private async loadTargetRows(appUids: string[]): Promise<Map<string, any[]>> {
    const grouped = new Map<string, any[]>();
    const table = this.targetTable();
    if (!appUids.length || !table) return grouped;
    const rows = await table.findMany({ where: { appUid: { in: appUids } } });
    for (const row of rows) {
      const list = grouped.get(row.appUid) ?? [];
      list.push(row);
      grouped.set(row.appUid, list);
    }
    return grouped;
  }

  private resolveTargetEnvironment(requested: string | undefined, scope?: AiAppKeyScope): AiAppTargetEnvironment {
    const environment = normalizeAppTarget(requested);
    if (scope && scope.environment !== environment) {
      throw new ForbiddenException('This deployment key is not valid for that environment');
    }
    return environment;
  }

  private assertKeyCanAccessApp(scope: AiAppKeyScope | undefined, appUid: string): void {
    if (scope && scope.appUid !== appUid) {
      throw new ForbiddenException('This deployment key cannot access that app');
    }
  }

  private async mirrorProdTarget(app: AiApp): Promise<void> {
    const table = this.targetTable();
    if (!table) return;
    await table.upsert({
      where: { appUid_environment: { appUid: app.uid, environment: 'prod' } },
      create: this.prodTargetData(app),
      update: this.prodTargetData(app),
    });
  }

  private prodTargetData(app: AiApp) {
    return {
      appUid: app.uid,
      environment: 'prod' as const,
      status: app.status,
      notes: app.notes,
      url: app.url,
      httpUrl: app.httpUrl,
      host: app.host,
      port: app.port,
      deploymentId: app.deploymentId,
      s3Key: app.s3Key,
      requiredEnvVars: app.requiredEnvVars ?? [],
      providedEnvVars: app.providedEnvVars ?? [],
      kitVersion: app.kitVersion,
      agentClient: app.agentClient,
      agentModel: app.agentModel,
      lastDeployedAt: app.lastDeployedAt,
      failureStream: app.failureStream,
      database: app.database ?? Prisma.DbNull,
      directLinkGateReady: app.directLinkGateReady,
      publicPathsGateReady: app.publicPathsGateReady,
      deployPhase: app.deployPhase ?? null,
      deployAttemptId: app.deployAttemptId ?? null,
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
   * member as active for WAU. The creator's own views don't count toward
   * `viewCount` (it's meant to signal outside interest), but still stamp WAU.
   */
  async recordView(memberUid: string, uid: string): Promise<void> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    await this.assertCanViewApp(memberUid, app);

    if (memberUid !== app.memberUid) {
      const updated = await this.prisma.$executeRaw`
        UPDATE "AiApp" SET "viewCount" = "viewCount" + 1
        WHERE uid = ${uid} AND status <> 'DELETED'
      `;
      if (updated === 0) {
        throw new NotFoundException(`AI App not found: ${uid}`);
      }
    }

    await this.prisma.aiAppActiveMember.upsert({
      where: { appUid_memberUid: { appUid: uid, memberUid } },
      create: { appUid: uid, memberUid, lastSeenAt: new Date() },
      update: { lastSeenAt: new Date() },
    });
  }

  /**
   * Dashboard list — non-deleted apps the requester may view (OPEN apps, their
   * own, and private apps they are whitelisted on; directory admins see all),
   * newest first, with owner info.
   */
  async listApps(requesterUid?: string): Promise<Array<ApiAiApp<AiApp>>> {
    // One admin lookup for the requester, then a per-row creator compare —
    // never a per-row query.
    const isAdmin = !!requesterUid && (await this.isRequesterDirectoryAdmin(requesterUid));
    const visible = await this.visibleAppsWhere(requesterUid, isAdmin);
    const apps = await this.prisma.aiApp.findMany({
      where: { status: { not: 'DELETED' }, ...(visible ? { AND: [visible] } : {}) },
      orderBy: { updatedAt: 'desc' },
    });
    const settled = await Promise.all(apps.map((app) => this.settleStuckDeploy(app)));
    await Promise.all(settled.map((app) => this.settleStuckDevTarget(app)));
    const withMembers = await this.withMember(settled);
    const wau = await this.weeklyActiveUsersByApp(settled.map((app) => app.uid));
    const targets = await this.loadTargetRows(settled.map((app) => app.uid));
    const previewVisible = await this.previewVisibleUids(requesterUid, settled, isAdmin);
    return withMembers.map((app, index) => ({
      ...this.toApiApp(
        app,
        isAdmin || (!!requesterUid && settled[index].memberUid === requesterUid),
        wau.get(settled[index].uid) ?? 0,
        targets.get(settled[index].uid) ?? []
      ),
      canViewPreview: previewVisible.has(settled[index].uid),
    }));
  }

  /**
   * Single app detail. When the requester is known, the response carries
   * `canManage` (creator or directory admin) — computed server-side so the UI
   * never has to compare member uids from a possibly stale login cookie.
   * 403 for a private app the requester may not view (an unresolved requester
   * only sees OPEN apps).
   */
  async getApp(uid: string, requesterUid?: string): Promise<ApiAiApp<AiApp> & { canManage?: boolean }> {
    let app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app) {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    await this.assertCanViewApp(requesterUid, app);
    app = await this.settleStuckDeploy(app);
    await this.settleStuckDevTarget(app);
    const result = (await this.withMember([app]))[0];
    const wau = await this.weeklyActiveUsersByApp([app.uid]);
    const weeklyActiveUsers = wau.get(app.uid) ?? 0;
    const targets = (await this.loadTargetRows([app.uid])).get(app.uid) ?? [];
    const canViewPreview = await this.canViewPreview(requesterUid, app);
    if (!requesterUid) {
      return { ...this.toApiApp(result, false, weeklyActiveUsers, targets), canViewPreview };
    }
    const canManage = await this.isCreatorOrDirectoryAdmin(requesterUid, app);
    return { ...this.toApiApp(result, canManage, weeklyActiveUsers, targets), canManage, canViewPreview };
  }

  /** Updates dashboard metadata only; this never invokes the sandbox runner or starts a deploy. */
  async updateMetadata(
    requesterUid: string,
    uid: string,
    dto: UpdateAppMetadataDto,
    ownerOnly = false,
    scope?: AiAppKeyScope
  ): Promise<ApiAiApp<AiApp>> {
    if (
      dto.name === undefined &&
      dto.description === undefined &&
      dto.prd === undefined &&
      dto.tags === undefined &&
      dto.feedbackEnabled === undefined
    ) {
      throw new BadRequestException(
        'At least one of name, description, prd, tags, or feedbackEnabled must be provided'
      );
    }

    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    if (ownerOnly && app.memberUid !== requesterUid) {
      throw new ForbiddenException('The agent may edit only apps owned by its connected member');
    }
    if (!ownerOnly) {
      await this.assertCanEditMetadata(requesterUid, app);
    }
    this.assertKeyCanAccessApp(scope, app.uid);

    const data: {
      name?: string;
      description?: string | null;
      prd?: string | null;
      tags?: string[];
      feedbackEnabled?: boolean;
    } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.prd !== undefined) data.prd = dto.prd?.trim() || null;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.feedbackEnabled !== undefined) data.feedbackEnabled = dto.feedbackEnabled;

    const updated = await this.prisma.aiApp.update({ where: { uid }, data });
    return this.toApiApp((await this.withMember([updated]))[0], true);
  }

  /** Dashboard metadata/PRD edits: the app's creator or a directory admin (the LabOS edit UI is gated on canManage). */
  private async assertCanEditMetadata(requesterUid: string, app: Pick<AiApp, 'memberUid'>): Promise<void> {
    if (!(await this.isCreatorOrDirectoryAdmin(requesterUid, app))) {
      throw new ForbiddenException('Only the app creator or a directory admin can edit this app');
    }
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
    // Checked before the upload so a rejected edit stores nothing in S3.
    await this.assertCanEditMetadata(requesterUid, app);

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
  async checkAppLive(
    uid: string,
    requesterUid?: string,
    environment: AiAppTargetEnvironment = 'prod'
  ): Promise<{ live: boolean }> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app) {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    await this.assertCanViewApp(requesterUid, app);
    let url = app.url;
    if (environment === 'preview') {
      const row = ((await this.loadTargetRows([uid])).get(uid) ?? []).find((entry) => entry.environment === 'preview');
      url = row?.url ?? null;
    }
    if (!url) {
      return { live: false };
    }
    try {
      const res = await axios.get(url, { timeout: 8000, validateStatus: () => true, maxRedirects: 0 });
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
    query: AiAppLogsQuery,
    scope?: AiAppKeyScope
  ): Promise<unknown> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    if (app.memberUid !== requesterUid) {
      throw new ForbiddenException('The agent may read logs only for apps owned by its connected member');
    }
    this.assertKeyCanAccessApp(scope, app.uid);
    const environment = this.resolveTargetEnvironment(query.environment, scope);
    return this.fetchRunnerLogs(app, phase, { ...query, environment });
  }

  /**
   * Status of one deployment for the connected member's agent (deploy token or
   * deployment key; owner-only, like the agent log routes). `latest` or the
   * target's current `deploymentId` → the live row (stuck deploys settled on
   * read). An earlier deployment of this target → its own outcome from the
   * event log, `stale: true`. Never returns the app URL/host or secrets.
   */
  async getDeploymentStatus(
    requesterUid: string,
    uid: string,
    deploymentId: string,
    requestedEnvironment?: string,
    scope?: AiAppKeyScope
  ): Promise<AiAppDeploymentStatus> {
    let app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    if (app.memberUid !== requesterUid) {
      throw new ForbiddenException('The agent may read deployments only for apps owned by its connected member');
    }
    this.assertKeyCanAccessApp(scope, app.uid);
    const environment = this.resolveTargetEnvironment(requestedEnvironment ?? scope?.environment, scope);

    let row: {
      status: string;
      deploymentId: string | null;
      notes: string | null;
      failureStream: string | null;
      deployPhase?: string | null;
    } | null;
    if (environment === 'preview') {
      await this.settleStuckDevTarget(app);
      row =
        (await this.targetTable()?.findUnique({
          where: { appUid_environment: { appUid: app.uid, environment: 'preview' } },
        })) ?? null;
    } else {
      app = await this.settleStuckDeploy(app);
      row = app;
    }

    const base = { uid: app.uid, appId: app.appId, environment };
    const isCurrent = deploymentId === 'latest' || (!!row?.deploymentId && row.deploymentId === deploymentId);
    if (isCurrent) {
      if (!row?.deploymentId) {
        throw new NotFoundException('This app has no deployment in that environment yet');
      }
      const { startedAt, finishedAt } = await this.deploymentEventTimes(app.uid, row.deploymentId, environment);
      const deploying = row.status === 'DEPLOYING';
      return {
        ...base,
        deploymentId: row.deploymentId,
        status: row.status,
        phase: this.deploymentPhaseOf(row.status, row.deployPhase),
        notes: row.notes ?? null,
        failureStream: this.failureStreamOf(row.failureStream),
        startedAt,
        finishedAt: deploying ? null : finishedAt,
        stale: false,
      };
    }

    const { startedAt, finishedAt, terminal } = await this.deploymentEventTimes(app.uid, deploymentId, environment);
    if (!startedAt) {
      throw new NotFoundException(`Deployment not found: ${deploymentId}`);
    }
    const succeeded = terminal?.type === 'DEPLOY_SUCCEEDED';
    const notes = succeeded
      ? null
      : terminal
      ? (terminal.message ?? '').replace(/^preview: /, '') || null
      : 'This deploy was superseded by a newer deploy before it reported a result.';
    return {
      ...base,
      deploymentId,
      status: succeeded ? 'READY' : 'ERROR',
      phase: succeeded ? 'done' : 'failed',
      notes,
      failureStream: null,
      startedAt,
      finishedAt,
      stale: true,
    };
  }

  /**
   * Start/finish of the newest attempt of `deploymentId` on one target, from the
   * event log. Only DEPLOY_STARTED carries the environment (`environment=preview`
   * vs no message), so starts are filtered by it and the first outcome event of
   * that deploymentId after the newest start is the attempt's outcome.
   */
  private async deploymentEventTimes(
    appUid: string,
    deploymentId: string,
    environment: AiAppTargetEnvironment
  ): Promise<{ startedAt: Date | null; finishedAt: Date | null; terminal: AiAppEvent | null }> {
    const events = await this.prisma.aiAppEvent.findMany({
      where: { appUid, deploymentId, type: { in: ['DEPLOY_STARTED', 'DEPLOY_SUCCEEDED', 'DEPLOY_FAILED'] } },
      orderBy: { createdAt: 'asc' },
    });
    const isPreviewStart = (event: AiAppEvent) => event.message === 'environment=preview';
    const start = [...events]
      .reverse()
      .find((event) => event.type === 'DEPLOY_STARTED' && isPreviewStart(event) === (environment === 'preview'));
    if (!start) {
      return { startedAt: null, finishedAt: null, terminal: null };
    }
    const terminal =
      events.find(
        (event) =>
          event.type !== 'DEPLOY_STARTED' && event.createdAt.getTime() >= start.createdAt.getTime() && event !== start
      ) ?? null;
    return { startedAt: start.createdAt, finishedAt: terminal?.createdAt ?? null, terminal };
  }

  /** The row's phase, or one derived from its status for rows that predate the phase column. */
  private deploymentPhaseOf(status: string, phase: string | null | undefined): DeployPhase | null {
    if (phase === 'queued' || phase === 'building' || phase === 'injecting_runtime_config') {
      return status === 'DEPLOYING' ? phase : status === 'READY' ? 'done' : 'failed';
    }
    if (phase === 'done' || phase === 'failed') {
      return phase;
    }
    return status === 'READY' ? 'done' : status === 'ERROR' ? 'failed' : null;
  }

  private failureStreamOf(value: string | null | undefined): 'build' | 'runtime' | null {
    return value === 'build' || value === 'runtime' ? value : null;
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
    query: AiAppLogsQuery
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
   * the newest line plus the window and deployment filter the walk used, so
   * "load earlier" pages read a consistent slice of history. Unlike the forward routes, the
   * response here is allowlisted to `{ events, nextToken }` — each event
   * `{ timestamp, message, deploymentId? }` with numeric epoch-ms timestamps
   * (the runner has been seen sending strings). Like the forward routes, the
   * window spans every deployment unless `deploymentId` narrows it; the
   * dashboard uses the per-event deploymentId to mark redeploy boundaries.
   */
  async getMemberLogsDesc(
    requesterUid: string,
    uid: string,
    phase: AiAppLogPhase,
    query: AiAppLogsQuery
  ): Promise<{ events: DescLogEvent[]; nextToken?: string }> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    if (!(await this.isCreatorOrDirectoryAdmin(requesterUid, app))) {
      throw new ForbiddenException('Only the app creator or a directory admin can view logs');
    }

    const limit = Math.min(Math.max(query.limit ?? AI_APPS_LOGS_DESC_DEFAULT_LIMIT, 1), AI_APPS_LOGS_DESC_MAX_LIMIT);
    const cursor = this.decodeDescCursor(query.nextToken);
    // A cursor pins the window and deployment filter its first page walked;
    // later pages must read the same slice of history (and hit the same
    // cache entry).
    let windowMinutes = cursor ? cursor.w : query.sinceMinutes;
    const deploymentId = cursor ? cursor.d : query.deploymentId;

    const environment = query.environment ?? 'prod';
    let walk = await this.walkRunnerLogsTail(app, phase, windowMinutes, deploymentId, environment);
    if (!walk.complete && !cursor && query.sinceMinutes !== undefined) {
      // The window is too chatty to walk in one budget. Narrowing keeps the
      // tail — it's the end of any window that reaches "now" — so retry with
      // progressively smaller windows before giving up.
      for (const divisor of AI_APPS_LOGS_DESC_NARROWINGS) {
        windowMinutes = Math.max(1, Math.floor(query.sinceMinutes / divisor));
        walk = await this.walkRunnerLogsTail(app, phase, windowMinutes, deploymentId, environment);
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
      nextToken: hasEarlier
        ? this.encodeDescCursor({ o: offset + events.length, w: windowMinutes, d: deploymentId })
        : undefined,
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
    sinceMinutes: number | undefined,
    deploymentId: string | undefined,
    environment: AiAppTargetEnvironment = 'prod'
  ): Promise<{ events: DescLogEvent[]; complete: boolean }> {
    const cacheKey = `${app.appId}:${environment}:${phase}:${sinceMinutes ?? 'all'}:${deploymentId ?? 'all'}`;
    const entry = this.logsTailCache.get(cacheKey);
    const now = Date.now();
    if (entry && entry.evictAt <= now) {
      this.logsTailCache.delete(cacheKey);
    } else if (entry) {
      if (entry.staleAt <= now) {
        // Revalidation failure only logs — the stale copy stays valid until
        // evictAt, and the read after that pays the cold walk (and its error).
        this.startLogsTailWalk(app, phase, sinceMinutes, deploymentId, environment, cacheKey).catch((error) => {
          this.logger.warn(
            `Background ${phase}-logs revalidation failed for ${app.appId}: ${(error as Error).message}`
          );
        });
      }
      return Promise.resolve({ events: entry.events, complete: true });
    }
    return this.startLogsTailWalk(app, phase, sinceMinutes, deploymentId, environment, cacheKey);
  }

  /** One walk per key at a time: concurrent identical requests await the same promise. */
  private startLogsTailWalk(
    app: Pick<AiApp, 'appId'>,
    phase: AiAppLogPhase,
    sinceMinutes: number | undefined,
    deploymentId: string | undefined,
    environment: AiAppTargetEnvironment,
    cacheKey: string
  ): Promise<{ events: DescLogEvent[]; complete: boolean }> {
    const inFlight = this.logsTailWalks.get(cacheKey);
    if (inFlight) return inFlight;
    const walk = this.runLogsTailWalk(app, phase, sinceMinutes, deploymentId, environment, cacheKey).finally(() => {
      this.logsTailWalks.delete(cacheKey);
    });
    this.logsTailWalks.set(cacheKey, walk);
    return walk;
  }

  private async runLogsTailWalk(
    app: Pick<AiApp, 'appId'>,
    phase: AiAppLogPhase,
    sinceMinutes: number | undefined,
    deploymentId: string | undefined,
    environment: AiAppTargetEnvironment,
    cacheKey: string
  ): Promise<{ events: DescLogEvent[]; complete: boolean }> {
    const startedAt = Date.now();
    let token: string | undefined;
    let buffer: DescLogEvent[] = [];

    for (let call = 0; call < AI_APPS_LOGS_DESC_MAX_RUNNER_CALLS; call++) {
      const body = (await this.fetchRunnerLogs(app, phase, {
        limit: AI_APPS_LOGS_DESC_RUNNER_LIMIT,
        sinceMinutes,
        nextToken: token,
        deploymentId,
        environment,
      })) as { events?: unknown; nextToken?: unknown } | null;

      const pageEvents = Array.isArray(body?.events) ? body!.events : [];
      for (const raw of pageEvents) {
        const entry = raw as { timestamp?: unknown; message?: unknown; deploymentId?: unknown };
        if (typeof entry?.message !== 'string') continue;
        buffer.push({
          timestamp: this.toEpochMs(entry.timestamp),
          message: entry.message,
          ...(typeof entry.deploymentId === 'string' ? { deploymentId: entry.deploymentId } : {}),
        });
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
        this.writeLogsTailCache(cacheKey, app.appId, environment, startedAt, events);
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

  private encodeDescCursor(cursor: { o: number; w?: number; d?: string }): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeDescCursor(token: string | undefined): { o: number; w?: number; d?: string } | undefined {
    if (token === undefined) return undefined;
    try {
      const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
      const offset = parsed?.o;
      const window = parsed?.w;
      const deploymentId = parsed?.d;
      if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) throw new Error('bad offset');
      if (window !== undefined && (typeof window !== 'number' || !Number.isInteger(window) || window < 1)) {
        throw new Error('bad window');
      }
      if (deploymentId !== undefined && !AI_APPS_LOG_DEPLOYMENT_ID_PATTERN.test(String(deploymentId))) {
        throw new Error('bad deploymentId');
      }
      return { o: offset, w: window, d: deploymentId };
    } catch {
      throw new BadRequestException('Invalid nextToken for order=desc — use the token from a previous desc response');
    }
  }

  /** Per-instance cache of completed tail walks, so scrolling history doesn't re-walk the runner per page. */
  private readonly logsTailCache = new Map<string, { staleAt: number; evictAt: number; events: DescLogEvent[] }>();

  /** In-flight walks by cache key — concurrent identical requests share one runner walk. */
  private readonly logsTailWalks = new Map<string, Promise<{ events: DescLogEvent[]; complete: boolean }>>();

  /** When each app's walks were last invalidated by a deploy — see writeLogsTailCache. */
  private readonly logsTailDroppedAt = new Map<string, number>();

  private writeLogsTailCache(
    key: string,
    appId: string,
    environment: AiAppTargetEnvironment,
    walkStartedAt: number,
    events: DescLogEvent[]
  ): void {
    // A walk that began before the app's last deploy predates the new pods'
    // output — never cache it (returning it once is fine; the next read
    // re-walks fresh and picks the new lines up).
    if ((this.logsTailDroppedAt.get(`${appId}:${environment}`) ?? 0) > walkStartedAt) return;
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
   * A new deploy invalidates every cached walk for the app, so whoever is
   * watching sees the new deployment's lines as soon as they land instead of a
   * stale tail (earlier deployments' lines stay in the window regardless).
   */
  private dropLogsTailCache(appId: string, environment: AiAppTargetEnvironment = 'prod'): void {
    this.logsTailDroppedAt.set(`${appId}:${environment}`, Date.now());
    const prefix = `${appId}:${environment}:`;
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
    query: AiAppLogsQuery
  ): Promise<unknown> {
    const params: Record<string, string | number> = {};
    if (query.limit !== undefined) params.limit = query.limit;
    if (query.sinceMinutes !== undefined) params.sinceMinutes = query.sinceMinutes;
    if (query.nextToken !== undefined) params.nextToken = query.nextToken;
    if (query.deploymentId !== undefined) params.deploymentId = query.deploymentId;
    params.environment = query.environment ?? 'prod';

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
   * background deploy job settles a legitimate one to READY/ERROR within
   * minutes. Mid-deploy phase writes skip `updatedAt` (raw SQL), so
   * `updatedAt` is exactly "deploy started at".
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
      data: { status: 'ERROR', notes: message, failureStream: null, deployPhase: 'failed' },
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
    const settled = (await this.prisma.aiApp.findUnique({ where: { uid: app.uid } })) ?? app;
    await this.mirrorProdTarget(settled);
    return settled;
  }

  private async settleStuckDevTarget(app: AiApp): Promise<void> {
    const table = this.targetTable();
    if (!table) return;
    const rows = await table.findMany({ where: { appUid: app.uid, environment: 'preview', status: 'DEPLOYING' } });
    const stuck = rows.find((row) => this.isDeployStuck(row));
    if (!stuck) return;
    const message =
      `Deploy timed out: no result after ${AI_APPS_DEPLOY_STUCK_MINUTES} minutes — the deploy was interrupted ` +
      'or the sandbox runner is unavailable. Retry the deploy once the runner is healthy.';
    await table.update({
      where: { uid: stuck.uid },
      data: { status: 'ERROR', notes: message, failureStream: null, deployPhase: 'failed' },
    });
    await this.recordEvent('DEPLOY_FAILED', app.memberUid, {
      appUid: app.uid,
      appId: app.appId,
      deploymentId: stuck.deploymentId ?? undefined,
      message: `preview: ${message}`,
    });
  }

  /**
   * Append an event to the audit log. Never throws — event logging must not
   * break the primary flow (download/deploy).
   */
  /** Audits a change of the app's public path list (from LabOS or an agent upload). */
  async recordPublicPathsUpdated(memberUid: string, app: Pick<AiApp, 'uid' | 'appId' | 'publicPaths'>): Promise<void> {
    await this.recordEvent('PUBLIC_PATHS_UPDATED', memberUid, {
      appUid: app.uid,
      appId: app.appId,
      message: `Public paths: ${JSON.stringify(app.publicPaths ?? [])}`,
    });
  }

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

  /** An agent pulled the kit-update bundle into an existing project. */
  async logKitUpdateDownloaded(memberUid: string): Promise<void> {
    await this.recordEvent('KIT_DOWNLOADED', memberUid, {
      message: `Starter kit v${AI_APPS_STARTER_KIT_VERSION} (agent update)`,
    });
  }

  /**
   * Event log (audit feed) — newest first, optionally scoped to one app
   * (callers check access to that app first). The unscoped feed leaves out
   * events of private apps the requester may not view; events tied to no app
   * (kit downloads, connect approvals) stay in.
   */
  async listEvents(appUid?: string, limit = 100, requesterUid?: string): Promise<Array<WithMember<AiAppEvent>>> {
    let where: Prisma.AiAppEventWhereInput | undefined = appUid ? { appUid } : undefined;
    if (!appUid) {
      const isAdmin = !!requesterUid && (await this.isRequesterDirectoryAdmin(requesterUid));
      const visible = await this.visibleAppsWhere(requesterUid, isAdmin);
      if (visible) {
        const hidden = await this.prisma.aiApp.findMany({ where: { NOT: visible }, select: { uid: true } });
        if (hidden.length) {
          where = { OR: [{ appUid: null }, { appUid: { notIn: hidden.map((app) => app.uid) } }] };
        }
      }
    }
    const events = await this.prisma.aiAppEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
    return this.withMember(events);
  }

  /**
   * Stores feedback from a member viewing the app's detail page. Text may be
   * Quill HTML (headings, links, images). Any member with AI Apps access may
   * submit, and may do so more than once per app.
   *
   * `pins` and `context` are optional (older clients send neither). Pins are
   * created in the same statement as the feedback, so a submission is stored
   * whole or not at all.
   *
   * `kind` COMMENT is a public comment pinned in the live app: exactly one pin,
   * and the app's creator is told about it. Omitted means FEEDBACK (private).
   * Nothing is accepted while the creator has feedback turned off.
   */
  async submitFeedback(
    memberUid: string,
    appUid: string,
    text: string,
    extras: {
      pins?: FeedbackPinInput[];
      context?: FeedbackContext;
      kind?: AiAppFeedbackItemKind;
      reportKind?: AiAppFeedbackReportKind;
      priority?: AiAppFeedbackPriority;
    } = {}
  ): Promise<WithMember<AiAppFeedback>> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid: appUid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${appUid}`);
    }
    await this.assertCanViewApp(memberUid, app);
    this.assertFeedbackOpen(app);
    const isComment = extras.kind === 'COMMENT';
    if (isComment && extras.pins?.length !== 1) {
      throw new BadRequestException('A comment points at exactly one element (one pin)');
    }
    const withoutDataUris = text.replace(/<img\b[^>]*\bsrc=["']data:[^"']+["'][^>]*>/gi, '');
    const sanitized = DOMPurify.sanitize(withoutDataUris);
    if (isBlankFeedbackHtml(sanitized)) {
      throw new BadRequestException('Feedback text is required');
    }
    const feedback = await this.prisma.aiAppFeedback.create({
      data: {
        appUid: app.uid,
        memberUid,
        text: sanitized,
        ...(extras.context ? { context: extras.context } : {}),
        ...(extras.pins?.length ? { pins: { create: extras.pins.map(toPinCreateData) } } : {}),
        ...(isComment ? { kind: 'COMMENT' as const } : {}),
        ...(extras.reportKind ? { reportKind: extras.reportKind } : {}),
        ...(extras.priority ? { priority: extras.priority } : {}),
      },
    });
    const [withAuthor] = await this.withMember([feedback]);
    if (isComment && app.memberUid !== memberUid) {
      await this.notifyFeedbackConversation(app, { ...feedback, hasPins: true }, app.memberUid, {
        ...AI_APPS_NOTIFICATION_MESSAGES.commentNew(
          app.name,
          withAuthor.member?.name ?? null,
          extras.pins?.[0]?.note || sanitized
        ),
        trigger: AI_APPS_NOTIFICATION_TRIGGERS.COMMENT_NEW,
      });
    }
    return withAuthor;
  }

  /** New items and replies are refused while the app's creator has LabOS feedback turned off (reads stay open). */
  private assertFeedbackOpen(app: Pick<AiApp, 'feedbackEnabled'>): void {
    if (app.feedbackEnabled === false) {
      throw new ForbiddenException('Feedback is turned off for this app');
    }
  }

  /**
   * All feedback for one app, newest first, with submitter info. Visible only
   * to the app's creator and directory admins.
   */
  async listFeedback(requesterUid: string, appUid: string): Promise<Array<WithMember<FeedbackWithPins>>> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid: appUid } });
    if (!app) {
      throw new NotFoundException(`AI App not found: ${appUid}`);
    }
    if (!(await this.isCreatorOrDirectoryAdmin(requesterUid, app))) {
      throw new ForbiddenException('Only the app creator or a directory admin can view feedback');
    }
    return this.queryFeedback(app.uid);
  }

  /**
   * All feedback for one app for the agent (deploy token or deployment key),
   * newest first, optionally narrowed to one status. Owner-only; a deployment
   * key must belong to this app (either environment — feedback is app-level).
   */
  async listAgentFeedback(
    requesterUid: string,
    uid: string,
    status?: AiAppFeedbackStatus,
    scope?: AiAppKeyScope
  ): Promise<Array<WithMember<FeedbackWithPins> & { comments?: Array<WithMember<FeedbackComment>> }>> {
    const app = await this.findAgentFeedbackApp(requesterUid, uid, scope);
    const rows = await this.queryFeedback(app.uid, status, { withComments: true });
    this.trackAgentFeedback(AI_APPS_AGENT_FEEDBACK_LISTED, requesterUid, {
      appUid: app.uid,
      status: status ?? null,
      resultCount: rows.length,
    });
    return rows;
  }

  /**
   * Sets the shared review status on one feedback row for the agent. The DTO
   * limits agents to VIEWED / IMPLEMENTED; same ownership rules as the list.
   *
   * With IMPLEMENTED the agent may leave a closing note — what changed. It is
   * stored in the item's conversation as written by the app's creator (the
   * agent acts for them) and tells the member who left the feedback. A bare
   * status change still notifies nobody.
   */
  async updateAgentFeedbackStatus(
    requesterUid: string,
    uid: string,
    feedbackUid: string,
    status: AiAppFeedbackStatus,
    scope?: AiAppKeyScope,
    note?: string
  ): Promise<WithMember<AiAppFeedback>> {
    if (note && status !== 'IMPLEMENTED') {
      throw new UnprocessableEntityException('A closing note is only accepted with status IMPLEMENTED');
    }
    const app = await this.findAgentFeedbackApp(requesterUid, uid, scope);
    const { updated, from } = await this.applyFeedbackStatus(app.uid, feedbackUid, status);
    if (note) {
      await this.prisma.aiAppFeedbackComment.create({
        data: { feedbackUid, memberUid: app.memberUid, text: note, kind: 'CLOSING_NOTE' },
      });
      const feedback = await this.prisma.aiAppFeedback.findUnique({
        where: { uid: feedbackUid },
        select: { uid: true, appUid: true, memberUid: true, kind: true, _count: { select: { pins: true } } },
      });
      if (feedback) {
        /* A comment's closing note reaches everyone in its thread; feedback's, only its author. */
        const recipients = new Set([feedback.memberUid]);
        if (feedback.kind === 'COMMENT') {
          const repliers = await this.prisma.aiAppFeedbackComment.findMany({
            where: { feedbackUid, kind: 'REPLY' },
            select: { memberUid: true },
          });
          repliers.forEach((r) => recipients.add(r.memberUid));
        }
        recipients.delete(app.memberUid);
        const item = { ...feedback, hasPins: feedback._count.pins > 0 };
        for (const recipientUid of recipients) {
          if (!(await this.canReadItem(recipientUid, app, feedback))) continue;
          await this.notifyFeedbackConversation(app, item, recipientUid, {
            ...AI_APPS_NOTIFICATION_MESSAGES.feedbackShipped(
              app.name,
              note,
              feedback.kind,
              recipientUid === feedback.memberUid
            ),
            trigger: AI_APPS_NOTIFICATION_TRIGGERS.FEEDBACK_SHIPPED,
          });
        }
      }
    }
    this.trackAgentFeedback(AI_APPS_AGENT_FEEDBACK_STATUS_CHANGED, requesterUid, {
      appUid: app.uid,
      feedbackUid,
      from,
      to: status,
      hasNote: Boolean(note),
    });
    return updated;
  }

  private trackAgentFeedback(name: string, distinctId: string, properties: Record<string, unknown>): void {
    void this.analyticsService.trackEvent({ name, distinctId, properties });
  }

  private async findAgentFeedbackApp(requesterUid: string, uid: string, scope?: AiAppKeyScope): Promise<AiApp> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    if (app.memberUid !== requesterUid) {
      throw new ForbiddenException('The agent may access feedback only for apps owned by its connected member');
    }
    this.assertKeyCanAccessApp(scope, app.uid);
    return app;
  }

  /**
   * `withComments` adds each item's conversation, oldest first — the agent reads
   * it before acting. Every read carries `commentCount`.
   */
  private async queryFeedback(
    appUid: string,
    status?: AiAppFeedbackStatus,
    options: { withComments?: boolean } = {}
  ): Promise<Array<WithMember<FeedbackWithPins> & { comments?: Array<WithMember<FeedbackComment>> }>> {
    const feedback = await this.prisma.aiAppFeedback.findMany({
      where: status ? { appUid, status } : { appUid },
      orderBy: { createdAt: 'desc' },
      include: {
        pins: { select: PIN_PUBLIC_SELECT, orderBy: { n: 'asc' } },
        _count: { select: { comments: true } },
        ...(options.withComments
          ? { comments: { select: COMMENT_PUBLIC_SELECT, orderBy: { createdAt: 'asc' as const } } }
          : {}),
      },
    });
    const rows = feedback as Array<
      AiAppFeedback & {
        pins: PublicFeedbackPin[];
        _count?: { comments: number };
        comments?: FeedbackComment[];
      }
    >;
    const withMembers = await this.withMember(rows);
    const comments = options.withComments ? await this.withMember(rows.flatMap((row) => row.comments ?? [])) : [];
    let offset = 0;
    return withMembers.map(({ _count, comments: own, ...row }) => {
      const count = own?.length ?? 0;
      const thread = options.withComments ? { comments: comments.slice(offset, offset + count) } : {};
      offset += count;
      return { ...row, ...thread, commentCount: _count?.comments ?? 0 };
    });
  }

  /**
   * Pins for the live-app overlay. The app's creator and directory admins get
   * every item's; anyone else who may open the app gets every COMMENT's plus
   * their own FEEDBACK's — never another member's private feedback. Pins of
   * IMPLEMENTED items are left out unless asked for; `env` narrows to one
   * environment, and both are returned when it is omitted.
   */
  async listAppFeedbackPins(
    requesterUid: string,
    appUid: string,
    options: { includeResolved?: boolean; env?: 'prod' | 'preview' } = {}
  ): Promise<OverlayFeedbackPin[]> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid: appUid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${appUid}`);
    }
    const seesAll = await this.isCreatorOrDirectoryAdmin(requesterUid, app);
    if (!seesAll) {
      await this.assertCanViewApp(requesterUid, app);
    }
    return this.queryOverlayPins({
      appUid: app.uid,
      env: options.env,
      excludeStatus: options.includeResolved ? undefined : 'IMPLEMENTED',
      ...(seesAll ? {} : { visibleTo: requesterUid }),
    });
  }

  /**
   * The requester's own pins on the app, resolved ones included: seeing their
   * report marked Implemented is the point. Anyone who may open the app may ask;
   * it never returns another member's feedback.
   */
  async listMyAppFeedbackPins(requesterUid: string, appUid: string): Promise<OverlayFeedbackPin[]> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid: appUid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${appUid}`);
    }
    await this.assertCanViewApp(requesterUid, app);
    return this.queryOverlayPins({ appUid: app.uid, memberUid: requesterUid });
  }

  /**
   * `visibleTo` is the read rule for a viewer who isn't the creator or an
   * admin: COMMENT items, plus that viewer's own FEEDBACK.
   */
  private async queryOverlayPins(filter: {
    appUid: string;
    memberUid?: string;
    visibleTo?: string;
    env?: 'prod' | 'preview';
    excludeStatus?: AiAppFeedbackStatus;
  }): Promise<OverlayFeedbackPin[]> {
    const pins = await this.prisma.aiAppFeedbackPin.findMany({
      where: {
        ...(filter.env ? { env: filter.env } : {}),
        feedback: {
          appUid: filter.appUid,
          ...(filter.memberUid ? { memberUid: filter.memberUid } : {}),
          ...(filter.visibleTo ? { OR: [{ kind: 'COMMENT' as const }, { memberUid: filter.visibleTo }] } : {}),
          ...(filter.excludeStatus ? { status: { not: filter.excludeStatus } } : {}),
        },
      },
      select: {
        ...PIN_PUBLIC_SELECT,
        feedback: {
          select: {
            uid: true,
            status: true,
            kind: true,
            createdAt: true,
            editedAt: true,
            memberUid: true,
            _count: { select: { comments: true } },
          },
        },
      },
      orderBy: [{ feedback: { createdAt: 'desc' } }, { n: 'asc' }],
      take: MAX_PINS_PER_RESPONSE,
    });
    if (pins.length === MAX_PINS_PER_RESPONSE) {
      this.logger.warn(`AI App ${filter.appUid}: feedback pins response hit the ${MAX_PINS_PER_RESPONSE} cap`);
    }
    const feedbacks = await this.withMember(pins.map((pin) => pin.feedback));
    return pins.map((pin, index) => {
      const { _count, ...feedback } = feedbacks[index];
      return { ...pin, feedback: { ...feedback, commentCount: _count?.comments ?? 0 } };
    });
  }

  private async applyFeedbackStatus(
    appUid: string,
    feedbackUid: string,
    status: AiAppFeedbackStatus
  ): Promise<{ updated: WithMember<AiAppFeedback>; from: AiAppFeedbackStatus }> {
    const feedback = await this.prisma.aiAppFeedback.findUnique({ where: { uid: feedbackUid } });
    if (!feedback || feedback.appUid !== appUid) {
      throw new NotFoundException(`AI App feedback not found: ${feedbackUid}`);
    }
    const updated = await this.prisma.aiAppFeedback.update({
      where: { uid: feedbackUid },
      data: { status },
    });
    return { updated: (await this.withMember([updated]))[0], from: feedback.status };
  }

  /**
   * All feedback the requester can review, newest first, tagged with `appName`.
   * Directory admins see every non-deleted app; everyone else only apps they
   * created. Skips deleted apps so the list matches the dashboard catalog.
   */
  async listAccessibleFeedback(
    requesterUid: string
  ): Promise<Array<WithMember<AiAppFeedback> & { appName: string; pinCount: number; commentCount: number }>> {
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
      include: { _count: { select: { pins: true, comments: true } } },
    });
    const withMembers = await this.withMember(feedback);
    // `pinCount` lets the list offer "Show on page" without sending every pin.
    return withMembers.map(({ _count, ...row }) => ({
      ...row,
      appName: appNameByUid.get(row.appUid) ?? '',
      pinCount: _count?.pins ?? 0,
      commentCount: _count?.comments ?? 0,
    }));
  }

  /**
   * Only what the requester submitted themselves, on any non-deleted app, in the
   * same row shape as listAccessibleFeedback. Owning an app or being a directory
   * admin adds nobody else's.
   */
  async listMyFeedback(
    requesterUid: string
  ): Promise<Array<WithMember<AiAppFeedback> & { appName: string; pinCount: number; commentCount: number }>> {
    const feedback = await this.prisma.aiAppFeedback.findMany({
      where: { memberUid: requesterUid },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { pins: true, comments: true } } },
    });
    if (feedback.length === 0) {
      return [];
    }
    const apps = await this.prisma.aiApp.findMany({
      where: { uid: { in: Array.from(new Set(feedback.map((row) => row.appUid))) }, status: { not: 'DELETED' } },
      select: { uid: true, name: true },
    });
    const appNameByUid = new Map(apps.map((app) => [app.uid, app.name]));
    const withMembers = await this.withMember(feedback.filter((row) => appNameByUid.has(row.appUid)));
    return withMembers.map(({ _count, ...row }) => ({
      ...row,
      appName: appNameByUid.get(row.appUid) ?? '',
      pinCount: _count?.pins ?? 0,
      commentCount: _count?.comments ?? 0,
    }));
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
    return (await this.applyFeedbackStatus(app.uid, feedbackUid, status)).updated;
  }

  // ── Feedback conversation (phase 2): replies under each item ─────────────

  /**
   * The item's conversation, oldest first. A COMMENT's is readable by anyone
   * who may open the app; FEEDBACK's by the app's creator, directory admins and
   * the item's author.
   */
  async listFeedbackComments(
    requesterUid: string,
    appUid: string,
    feedbackUid: string
  ): Promise<Array<WithMember<FeedbackComment>>> {
    const { feedback } = await this.findFeedbackConversation(requesterUid, appUid, feedbackUid);
    const comments = await this.prisma.aiAppFeedbackComment.findMany({
      where: { feedbackUid: feedback.uid },
      select: COMMENT_PUBLIC_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    return this.withMember(comments);
  }

  /**
   * A reply from anyone who may read the item. Tells everyone else in the
   * conversation who can still read it: the item's author and the app's
   * creator always, anyone else (an admin, another viewer) once they have
   * written in it. A failed notification never fails the reply.
   */
  async addFeedbackComment(
    requesterUid: string,
    appUid: string,
    feedbackUid: string,
    text: string
  ): Promise<WithMember<FeedbackComment>> {
    const { app, feedback } = await this.findFeedbackConversation(requesterUid, appUid, feedbackUid);
    this.assertFeedbackOpen(app);
    const earlier = await this.prisma.aiAppFeedbackComment.findMany({
      where: { feedbackUid: feedback.uid },
      select: { memberUid: true },
    });
    if (earlier.length >= MAX_COMMENTS_PER_FEEDBACK) {
      throw new ConflictException(`This feedback already has ${MAX_COMMENTS_PER_FEEDBACK} replies`);
    }
    const comment = await this.prisma.aiAppFeedbackComment.create({
      data: { feedbackUid: feedback.uid, memberUid: requesterUid, text },
      select: COMMENT_PUBLIC_SELECT,
    });

    const recipients = new Set([feedback.memberUid, app.memberUid, ...earlier.map((c) => c.memberUid)]);
    recipients.delete(requesterUid);
    const item = { ...feedback, hasPins: feedback._count.pins > 0 };
    for (const recipientUid of recipients) {
      if (!(await this.canReadItem(recipientUid, app, feedback))) continue;
      await this.notifyFeedbackConversation(app, item, recipientUid, {
        ...AI_APPS_NOTIFICATION_MESSAGES.feedbackReply(
          app.name,
          text,
          recipientUid === feedback.memberUid,
          feedback.kind
        ),
        trigger: AI_APPS_NOTIFICATION_TRIGGERS.FEEDBACK_REPLY,
      });
    }
    return (await this.withMember([comment]))[0];
  }

  /** A reply's new text. Its author only, while they can still read the item. */
  async editFeedbackComment(
    requesterUid: string,
    appUid: string,
    feedbackUid: string,
    commentUid: string,
    text: string
  ): Promise<WithMember<FeedbackComment>> {
    const { feedback } = await this.findFeedbackConversation(requesterUid, appUid, feedbackUid);
    const comment = await this.prisma.aiAppFeedbackComment.findUnique({
      where: { uid: commentUid },
      select: { uid: true, memberUid: true, feedbackUid: true },
    });
    if (!comment || comment.feedbackUid !== feedback.uid) {
      throw new NotFoundException(`Feedback reply not found: ${commentUid}`);
    }
    if (comment.memberUid !== requesterUid) {
      throw new ForbiddenException('Only its author can edit a reply');
    }
    const updated = await this.prisma.aiAppFeedbackComment.update({
      where: { uid: comment.uid },
      data: { text, editedAt: new Date() },
      select: COMMENT_PUBLIC_SELECT,
    });
    return (await this.withMember([updated]))[0];
  }

  /**
   * A COMMENT's new note, by its author while they can still open the app. The
   * item's text is rebuilt from it (keeping the screenshot) and the pin's note
   * set to it in one transaction, so the two never disagree. FEEDBACK items
   * can't be edited.
   */
  async editFeedbackNote(
    requesterUid: string,
    appUid: string,
    feedbackUid: string,
    note: string
  ): Promise<WithMember<AiAppFeedback>> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid: appUid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${appUid}`);
    }
    const feedback = await this.prisma.aiAppFeedback.findUnique({ where: { uid: feedbackUid } });
    if (!feedback || feedback.appUid !== app.uid) {
      throw new NotFoundException(`AI App feedback not found: ${feedbackUid}`);
    }
    if (feedback.memberUid !== requesterUid) {
      throw new ForbiddenException('Only its author can edit a comment');
    }
    if (feedback.kind !== 'COMMENT') {
      throw new ForbiddenException('Only comments can be edited');
    }
    await this.assertCanViewApp(requesterUid, app);
    const text = DOMPurify.sanitize(rebuildCommentText(note, feedback.text));
    const [updated] = await this.prisma.$transaction([
      this.prisma.aiAppFeedback.update({ where: { uid: feedback.uid }, data: { text, editedAt: new Date() } }),
      this.prisma.aiAppFeedbackPin.updateMany({ where: { feedbackUid: feedback.uid }, data: { note } }),
    ]);
    return (await this.withMember([updated]))[0];
  }

  /**
   * Removes an item with its pins and replies (they cascade). Its author may;
   * so may a directory admin (moderation). The app's creator may not delete
   * other people's items.
   */
  async deleteFeedbackItem(requesterUid: string, appUid: string, feedbackUid: string): Promise<void> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid: appUid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${appUid}`);
    }
    const feedback = await this.prisma.aiAppFeedback.findUnique({
      where: { uid: feedbackUid },
      select: { uid: true, appUid: true, memberUid: true },
    });
    if (!feedback || feedback.appUid !== app.uid) {
      throw new NotFoundException(`AI App feedback not found: ${feedbackUid}`);
    }
    if (feedback.memberUid !== requesterUid && !(await this.isRequesterDirectoryAdmin(requesterUid))) {
      throw new ForbiddenException('Only its author or a directory admin can delete it');
    }
    await this.prisma.aiAppFeedback.delete({ where: { uid: feedback.uid } });
  }

  /** Removes a reply. Its author may; so may a directory admin (moderation). */
  async deleteFeedbackComment(
    requesterUid: string,
    appUid: string,
    feedbackUid: string,
    commentUid: string
  ): Promise<void> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid: appUid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${appUid}`);
    }
    const comment = await this.prisma.aiAppFeedbackComment.findUnique({
      where: { uid: commentUid },
      select: { uid: true, memberUid: true, feedbackUid: true, feedback: { select: { appUid: true } } },
    });
    if (!comment || comment.feedbackUid !== feedbackUid || comment.feedback.appUid !== app.uid) {
      throw new NotFoundException(`Feedback reply not found: ${commentUid}`);
    }
    if (comment.memberUid !== requesterUid && !(await this.isRequesterDirectoryAdmin(requesterUid))) {
      throw new ForbiddenException('Only its author or a directory admin can delete a reply');
    }
    await this.prisma.aiAppFeedbackComment.delete({ where: { uid: comment.uid } });
  }

  private async findFeedbackConversation(requesterUid: string, appUid: string, feedbackUid: string) {
    const app = await this.prisma.aiApp.findUnique({ where: { uid: appUid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${appUid}`);
    }
    const feedback = await this.prisma.aiAppFeedback.findUnique({
      where: { uid: feedbackUid },
      select: { uid: true, appUid: true, memberUid: true, kind: true, _count: { select: { pins: true } } },
    });
    if (!feedback || feedback.appUid !== app.uid) {
      throw new NotFoundException(`AI App feedback not found: ${feedbackUid}`);
    }
    if (!(await this.canReadItem(requesterUid, app, feedback))) {
      throw new ForbiddenException(
        feedback.kind === 'COMMENT'
          ? 'This AI App is private'
          : 'Only the app creator, a directory admin, or the member who left this feedback can see its replies'
      );
    }
    return { app, feedback };
  }

  /**
   * The read rule, checked on every request (and for every notification): a
   * COMMENT by anyone who may open the app; FEEDBACK by its author, the app's
   * creator and directory admins.
   */
  private async canReadItem(
    memberUid: string,
    app: Pick<AiApp, 'uid' | 'memberUid' | 'access'>,
    item: Pick<FeedbackItemAccess, 'memberUid' | 'kind'>
  ): Promise<boolean> {
    if (item.kind === 'COMMENT') {
      return this.canViewApp(memberUid, app);
    }
    return item.memberUid === memberUid || this.isCreatorOrDirectoryAdmin(memberUid, app);
  }

  private async notifyFeedbackConversation(
    app: Pick<AiApp, 'uid' | 'name'>,
    item: { uid: string; kind: AiAppFeedbackItemKind; hasPins: boolean },
    recipientUid: string,
    message: { title: string; description: string; trigger: string }
  ): Promise<void> {
    const { trigger, ...copy } = message;
    const feedbackUid = item.uid;
    try {
      await this.pushNotifications.create({
        category: PushNotificationCategory.AI_APP,
        ...copy,
        link: aiAppFeedbackPath(app.uid, feedbackUid, item.hasPins, item.kind),
        recipientUid,
        isPublic: false,
        metadata: { eventType: 'ai_app_feedback', appUid: app.uid, feedbackUid, trigger },
      });
    } catch (error) {
      this.logger.warn(
        `AI App feedback notification (${trigger}) failed for ${app.uid}/${feedbackUid} → ${recipientUid}: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }

  /** True when the requester created the app or is a directory admin. */
  async isCreatorOrDirectoryAdmin(requesterUid: string, app: Pick<AiApp, 'memberUid'>): Promise<boolean> {
    if (app.memberUid === requesterUid) {
      return true;
    }
    return this.isRequesterDirectoryAdmin(requesterUid);
  }

  /**
   * Whether the requester may find and open the app: it is OPEN, or they own
   * it, are a directory admin, or are on its whitelist. The PL Infra
   * permission itself is checked by the caller (RbacGuard on dashboard routes,
   * explicitly in the sidecar access check).
   */
  async canViewApp(
    requesterUid: string | undefined,
    app: Pick<AiApp, 'uid' | 'memberUid' | 'access'>
  ): Promise<boolean> {
    if (app.access === 'OPEN') {
      return true;
    }
    if (!requesterUid) {
      return false;
    }
    if (await this.isCreatorOrDirectoryAdmin(requesterUid, app)) {
      return true;
    }
    const allowed = await this.prisma.aiAppAllowedMember.findUnique({
      where: { appUid_environment_memberUid: { appUid: app.uid, environment: 'prod', memberUid: requesterUid } },
      select: { memberUid: true },
    });
    return !!allowed;
  }

  private async previewLastDeployedAt(appUid: string): Promise<Date | null> {
    const table = this.targetTable();
    if (!table) return null;
    const row = await table.findUnique({
      where: { appUid_environment: { appUid, environment: 'preview' } },
    });
    return row?.lastDeployedAt ?? null;
  }

  private async previewVisibleUids(
    requesterUid: string | undefined,
    apps: Array<Pick<AiApp, 'uid' | 'memberUid' | 'previewAccess'>>,
    isAdmin: boolean
  ): Promise<Set<string>> {
    const visible = new Set<string>();
    for (const app of apps) {
      if (isAdmin || (!!requesterUid && app.memberUid === requesterUid) || app.previewAccess === 'OPEN') {
        visible.add(app.uid);
      }
    }
    const rest = apps.filter((app) => !visible.has(app.uid)).map((app) => app.uid);
    const table = this.prisma.aiAppAllowedMember;
    if (requesterUid && rest.length && table?.findMany) {
      const rows = await table.findMany({
        where: { memberUid: requesterUid, environment: 'preview', appUid: { in: rest } },
        select: { appUid: true },
      });
      for (const row of rows) visible.add(row.appUid);
    }
    return visible;
  }

  /** Preview is private unless opened. The owner and directory admins can always open it. */
  async canViewPreview(
    requesterUid: string | undefined,
    app: Pick<AiApp, 'uid' | 'memberUid' | 'previewAccess'>
  ): Promise<boolean> {
    if (app.previewAccess === 'OPEN') {
      return true;
    }
    if (!requesterUid) {
      return false;
    }
    if (await this.isCreatorOrDirectoryAdmin(requesterUid, app)) {
      return true;
    }
    const table = this.prisma.aiAppAllowedMember;
    if (!table?.findUnique) return false;
    const allowed = await table.findUnique({
      where: { appUid_environment_memberUid: { appUid: app.uid, environment: 'preview', memberUid: requesterUid } },
      select: { memberUid: true },
    });
    return !!allowed;
  }

  private async assertCanViewApp(
    requesterUid: string | undefined,
    app: Pick<AiApp, 'uid' | 'memberUid' | 'access'>
  ): Promise<void> {
    if (!(await this.canViewApp(requesterUid, app))) {
      throw new ForbiddenException('This AI App is private');
    }
  }

  /**
   * Filter matching the apps the requester may view, or undefined when they
   * may view all of them (directory admins).
   */
  private async visibleAppsWhere(
    requesterUid: string | undefined,
    isAdmin: boolean
  ): Promise<Prisma.AiAppWhereInput | undefined> {
    if (isAdmin) {
      return undefined;
    }
    if (!requesterUid) {
      return { access: 'OPEN' };
    }
    const allowed = await this.prisma.aiAppAllowedMember.findMany({
      where: { memberUid: requesterUid, environment: 'prod' },
      select: { appUid: true },
    });
    return {
      OR: [
        { access: 'OPEN' },
        { memberUid: requesterUid },
        ...(allowed.length ? [{ uid: { in: allowed.map((row) => row.appUid) } }] : []),
      ],
    };
  }

  /**
   * "Shared with you" notification for members on a PRIVATE app's whitelist,
   * once the app has shipped (so the link opens a live app). Each member is
   * notified at most once while on the list: the per-row stamp is conditional,
   * so a deploy finishing while the owner saves can't double-send.
   */
  async notifyAllowedMembers(
    app: Pick<AiApp, 'uid' | 'name' | 'memberUid' | 'access' | 'lastDeployedAt' | 'previewAccess'>,
    environment: AiAppTargetEnvironment = 'prod'
  ): Promise<void> {
    const access = environment === 'preview' ? app.previewAccess : app.access;
    const shipped = environment === 'preview' ? await this.previewLastDeployedAt(app.uid) : app.lastDeployedAt;
    if (access !== 'PRIVATE' || !shipped) {
      return;
    }
    const pending = await this.prisma.aiAppAllowedMember.findMany({
      where: { appUid: app.uid, environment, notifiedAt: null },
      select: { memberUid: true },
    });
    if (!pending.length) {
      return;
    }
    const owner = await this.prisma.member.findUnique({ where: { uid: app.memberUid }, select: { name: true } });
    for (const { memberUid } of pending) {
      const { count } = await this.prisma.aiAppAllowedMember.updateMany({
        where: { appUid: app.uid, environment, memberUid, notifiedAt: null },
        data: { notifiedAt: new Date() },
      });
      if (count === 1) {
        await this.notifyAccessGranted(app, memberUid, owner?.name ?? null);
      }
    }
  }

  /**
   * The one-time "new AI App" broadcast to PL Infra members, for an app that
   * is OPEN, has shipped, and was never announced. The stamp is conditional
   * so concurrent callers (a deploy finishing while the owner opens the app)
   * can't both send.
   */
  async announceIfEligible(
    app: Pick<AiApp, 'uid' | 'name' | 'access' | 'announcedAt' | 'lastDeployedAt'>
  ): Promise<void> {
    if (app.access !== 'OPEN' || app.announcedAt || !app.lastDeployedAt) {
      return;
    }
    const { count } = await this.prisma.aiApp.updateMany({
      where: { uid: app.uid, access: 'OPEN', announcedAt: null },
      data: { announcedAt: new Date() },
    });
    if (count === 1) {
      await this.notifyDeploySucceeded(app);
    }
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

  /**
   * Reserved appIds (see AI_APPS_RESERVED_APP_IDS) can't be claimed. The member's own existing, non-DELETED row keeps
   * working (none existed when the list was introduced), so only a new claim is refused. `existing` skips the lookup
   * when the caller already holds the row.
   */
  private async assertAppIdNotReserved(memberUid: string, appId: string, existing?: Pick<AiApp, 'status'> | null) {
    if (!isReservedAppId(appId)) return;
    const own =
      existing !== undefined
        ? existing
        : await this.prisma.aiApp.findUnique({
            where: { memberUid_appId: { memberUid, appId } },
            select: { status: true },
          });
    if (own && own.status !== 'DELETED') return;
    throw new BadRequestException(`The appId "${appId}" is reserved for a platform service — pick a different appId`);
  }

  /** Directory-admin check for admin-only AI Apps routes. */
  isRequesterAdmin(requesterUid: string): Promise<boolean> {
    return this.isRequesterDirectoryAdmin(requesterUid);
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
  /**
   * Upload-time tags only fill an empty list: once the app is tagged (by an
   * earlier upload or a creator/admin edit) redeploys leave the tags alone.
   */
  private tagsForUpload(existing: AiApp | null, uploaded: string[] | undefined): string[] | undefined {
    if (existing?.tags?.length) {
      return undefined;
    }
    return uploaded ?? [];
  }

  /**
   * Upload-time public paths replace the stored list when the agent sends the
   * field (`[]` clears it) and leave it alone when it doesn't, so LabOS edits
   * survive redeploys. Validated before anything is stored or uploaded.
   */
  private publicPathsForUpload(uploaded: string[] | undefined): string[] | undefined {
    return uploaded === undefined ? undefined : assertValidPublicPaths(uploaded);
  }

  private async auditUploadedPublicPaths(memberUid: string, existing: AiApp | null, app: AiApp): Promise<void> {
    if (!samePublicPaths(existing?.publicPaths, app.publicPaths)) {
      await this.recordPublicPathsUpdated(memberUid, app);
    }
  }

  async deploy(
    memberUid: string,
    dto: DeployAppDto,
    file: Express.Multer.File,
    agentClient?: string | null,
    scope?: AiAppKeyScope
  ): Promise<ApiAiApp<AiApp> & DeployAcceptedFields> {
    if (!file?.buffer?.length) {
      throw new BadGatewayException('Missing app ZIP file');
    }
    if (!AI_APPS_S3_BUCKET) {
      throw new InternalServerErrorException('AI_APPS_S3_BUCKET is not configured');
    }

    const publicPaths = this.publicPathsForUpload(dto.publicPaths);
    await this.assertAppIdNotReserved(memberUid, dto.appId);
    await this.assertAppIdNotClaimedByAnotherMember(memberUid, dto.appId);

    // Block a second concurrent deploy: if a deploy is already in flight for this
    // app (from another agent run or a member-triggered deploy), reject before we
    // overwrite its bundle/status. First-ever deploys have no row yet, so skip.
    const existing = await this.prisma.aiApp.findUnique({
      where: { memberUid_appId: { memberUid, appId: dto.appId } },
    });
    const environment = this.resolveTargetEnvironment(dto.environment, scope);
    if (scope && (!existing || existing.uid !== scope.appUid)) {
      throw new ForbiddenException('This deployment key cannot access that app');
    }
    if (environment === 'preview') {
      return this.deployDev(memberUid, dto, file, agentClient, existing);
    }
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
        tags: dto.tags ?? [],
        database: dto.database ? { enabled: true, type: dto.database.type } : Prisma.DbNull,
        publicPaths: publicPaths ?? [],
        // New apps are open to all PL Infra members unless the member chose
        // PRIVATE at deploy time.
        access: dto.access ?? 'OPEN',
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
        tags: this.tagsForUpload(existing, dto.tags),
        publicPaths,
        // Absent → kept, so a LabOS access change survives redeploys.
        access: dto.access,
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

    await this.auditUploadedPublicPaths(memberUid, existing, app);
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
    return this.startDeployAttempt(
      memberUid,
      app,
      dto.deploymentId,
      s3Key,
      app.providedEnvVars,
      'prod',
      existing ? deployRowSnapshot(existing) : null
    );
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
    agentClient?: string | null,
    scope?: AiAppKeyScope
  ): Promise<ApiAiApp<AiApp> & { appPageUrl: string; missingEnvVars: string[] }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing app ZIP file');
    }
    if (!AI_APPS_S3_BUCKET) {
      throw new InternalServerErrorException('AI_APPS_S3_BUCKET is not configured');
    }

    const publicPaths = this.publicPathsForUpload(dto.publicPaths);
    await this.assertAppIdNotReserved(memberUid, dto.appId);
    await this.assertAppIdNotClaimedByAnotherMember(memberUid, dto.appId);

    // Don't clobber an in-flight deploy's bundle/status by re-registering the app
    // as a DRAFT while it's mid-deploy.
    const existing = await this.prisma.aiApp.findUnique({
      where: { memberUid_appId: { memberUid, appId: dto.appId } },
    });
    const environment = this.resolveTargetEnvironment(dto.environment, scope);
    if (scope && (!existing || existing.uid !== scope.appUid)) {
      throw new ForbiddenException('This deployment key cannot access that app');
    }
    if (environment === 'preview') {
      return this.registerDevDraft(memberUid, dto, file, agentClient, existing);
    }
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
        tags: dto.tags ?? [],
        database: dto.database ? { enabled: true, type: dto.database.type } : Prisma.DbNull,
        publicPaths: publicPaths ?? [],
        // New apps are open to all PL Infra members unless the member chose
        // PRIVATE at deploy time.
        access: dto.access ?? 'OPEN',
      },
      update: {
        name: dto.name,
        description: dto.description,
        status: 'DRAFT',
        deploymentId: dto.deploymentId,
        s3Key,
        requiredEnvVars: dto.requiredEnvVars,
        tags: this.tagsForUpload(existing, dto.tags),
        publicPaths,
        // Absent → kept, so a LabOS access change survives redeploys.
        access: dto.access,
        kitVersion: dto.kitVersion ?? null,
        agentClient: agentClient ?? null,
        agentModel: dto.agentModel ?? null,
        database: dto.database ? { enabled: true, type: dto.database.type } : Prisma.DbNull,
        notes: null,
      },
    });

    await this.auditUploadedPublicPaths(memberUid, existing, app);
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
  private async ensureAppShell(
    memberUid: string,
    dto: DeployAppDto,
    fileFields: { publicPaths?: string[] },
    agentClient: string | null | undefined,
    existing: AiApp | null
  ): Promise<AiApp> {
    if (existing) {
      return this.prisma.aiApp.update({
        where: { uid: existing.uid },
        data: {
          name: dto.name,
          description: dto.description,
          tags: this.tagsForUpload(existing, dto.tags),
          publicPaths: fileFields.publicPaths,
          access: dto.access,
        },
      });
    }
    return this.prisma.aiApp.create({
      data: {
        memberUid,
        appId: dto.appId,
        name: dto.name,
        description: dto.description,
        status: 'IN_DEVELOPMENT',
        tags: dto.tags ?? [],
        publicPaths: fileFields.publicPaths ?? [],
        access: dto.access ?? 'OPEN',
        kitVersion: dto.kitVersion ?? null,
        agentClient: agentClient ?? null,
        agentModel: dto.agentModel ?? null,
      },
    });
  }

  private async deployDev(
    memberUid: string,
    dto: DeployAppDto,
    file: Express.Multer.File,
    agentClient: string | null | undefined,
    existing: AiApp | null
  ): Promise<ApiAiApp<AiApp> & DeployAcceptedFields> {
    const table = this.targetTable();
    if (!table) throw new InternalServerErrorException('AI App targets are not available');
    const publicPaths = this.publicPathsForUpload(dto.publicPaths);
    if (existing) {
      const current = await table.findUnique({
        where: { appUid_environment: { appUid: existing.uid, environment: 'preview' } },
      });
      if (current) this.assertNoDeployInProgress(current);
    }
    const app = await this.ensureAppShell(memberUid, dto, { publicPaths }, agentClient, existing);
    await this.auditUploadedPublicPaths(memberUid, existing, app);
    const s3Key = buildAppS3Key(dto.appId, dto.deploymentId);
    const target = await table.upsert({
      where: { appUid_environment: { appUid: app.uid, environment: 'preview' } },
      create: {
        appUid: app.uid,
        environment: 'preview',
        status: 'DEPLOYING',
        deploymentId: dto.deploymentId,
        s3Key,
        url: buildAppUrl(dto.appId, 'preview'),
        httpUrl: buildAppHttpUrl(dto.appId, 'preview'),
        host: buildAppHost(dto.appId, 'preview'),
        kitVersion: dto.kitVersion ?? null,
        agentClient: agentClient ?? null,
        agentModel: dto.agentModel ?? null,
        database: dto.database ? { enabled: true, type: dto.database.type } : Prisma.DbNull,
        requiredEnvVars: [],
        providedEnvVars: [],
      },
      update: {
        status: 'DEPLOYING',
        deploymentId: dto.deploymentId,
        s3Key,
        url: buildAppUrl(dto.appId, 'preview'),
        httpUrl: buildAppHttpUrl(dto.appId, 'preview'),
        host: buildAppHost(dto.appId, 'preview'),
        kitVersion: dto.kitVersion ?? null,
        agentClient: agentClient ?? null,
        agentModel: dto.agentModel ?? null,
        database: dto.database ? { enabled: true, type: dto.database.type } : Prisma.DbNull,
        notes: null,
        failureStream: null,
      },
    });
    try {
      await this.awsService.uploadFileToS3(
        { buffer: file.buffer, mimetype: 'application/zip' },
        AI_APPS_S3_BUCKET,
        s3Key
      );
    } catch (error) {
      const message = `Deploy failed: ${(error as Error).message}`;
      await this.failDeploy(
        app,
        memberUid,
        { appUid: app.uid, appId: dto.appId, deploymentId: dto.deploymentId },
        message,
        'build',
        'preview'
      );
      throw new BadGatewayException('Failed to store the app bundle');
    }
    await this.recordEvent('DEPLOY_STARTED', memberUid, {
      appUid: app.uid,
      appId: dto.appId,
      deploymentId: dto.deploymentId,
      message: 'environment=preview',
    });
    return this.startDeployAttempt(
      memberUid,
      app,
      dto.deploymentId,
      s3Key,
      target.providedEnvVars ?? [],
      'preview',
      null
    );
  }

  private async registerDevDraft(
    memberUid: string,
    dto: RegisterDraftDto,
    file: Express.Multer.File,
    agentClient: string | null | undefined,
    existing: AiApp | null
  ): Promise<ApiAiApp<AiApp> & { appPageUrl: string; missingEnvVars: string[] }> {
    const table = this.targetTable();
    if (!table) throw new InternalServerErrorException('AI App targets are not available');
    const publicPaths = this.publicPathsForUpload(dto.publicPaths);
    if (existing) {
      const current = await table.findUnique({
        where: { appUid_environment: { appUid: existing.uid, environment: 'preview' } },
      });
      if (current) this.assertNoDeployInProgress(current);
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
    const app = await this.ensureAppShell(memberUid, dto, { publicPaths }, agentClient, existing);
    await this.auditUploadedPublicPaths(memberUid, existing, app);
    const previous = await table.findUnique({
      where: { appUid_environment: { appUid: app.uid, environment: 'preview' } },
    });
    const target = await table.upsert({
      where: { appUid_environment: { appUid: app.uid, environment: 'preview' } },
      create: {
        appUid: app.uid,
        environment: 'preview',
        status: 'DRAFT',
        deploymentId: dto.deploymentId,
        s3Key,
        requiredEnvVars: dto.requiredEnvVars,
        providedEnvVars: [],
        kitVersion: dto.kitVersion ?? null,
        agentClient: agentClient ?? null,
        agentModel: dto.agentModel ?? null,
        database: dto.database ? { enabled: true, type: dto.database.type } : Prisma.DbNull,
      },
      update: {
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
      message: `preview required env vars: ${dto.requiredEnvVars.join(', ')}`,
    });
    const provided = new Set<string>(target.providedEnvVars ?? previous?.providedEnvVars ?? []);
    const targets = (await this.loadTargetRows([app.uid])).get(app.uid) ?? [target];
    return {
      ...this.toApiApp((await this.withMember([app]))[0], true, 0, targets),
      appPageUrl: buildAppPageUrl(app.uid),
      missingEnvVars: dto.requiredEnvVars.filter((name) => !provided.has(name)),
    };
  }

  async deployDraft(
    requesterUid: string,
    uid: string,
    secrets?: Record<string, string>,
    environment: AiAppTargetEnvironment = 'prod'
  ): Promise<ApiAiApp<AiApp> & DeployAcceptedFields> {
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
    await this.assertAppIdNotReserved(app.memberUid, app.appId, app);
    await this.assertAppIdNotClaimedByAnotherMember(app.memberUid, app.appId);
    if (environment === 'preview') {
      return this.deployDevDraft(requesterUid, app, secrets);
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
      await this.saveSecrets(requesterUid, app, secrets, 'prod');
    }

    await this.recordEvent('DEPLOY_STARTED', requesterUid, {
      appUid: app.uid,
      appId: app.appId,
      deploymentId: app.deploymentId,
    });
    return this.startDeployAttempt(
      requesterUid,
      app,
      app.deploymentId,
      app.s3Key,
      Array.from(provided),
      'prod',
      deployRowSnapshot(app)
    );
  }

  private async deployDevDraft(
    requesterUid: string,
    app: AiApp,
    secrets?: Record<string, string>
  ): Promise<ApiAiApp<AiApp> & DeployAcceptedFields> {
    const table = this.targetTable();
    if (!table) throw new InternalServerErrorException('AI App targets are not available');
    const target = await table.findUnique({
      where: { appUid_environment: { appUid: app.uid, environment: 'preview' } },
    });
    if (!target?.s3Key || !target.deploymentId) {
      throw new BadRequestException(
        'This environment has no uploaded bundle yet — ask your AI agent to register it first'
      );
    }
    this.assertNoDeployInProgress(target);
    const submittedNames = Object.keys(secrets ?? {});
    const provided = new Set([...(target.providedEnvVars ?? []), ...submittedNames]);
    const missing = (target.requiredEnvVars ?? []).filter((name: string) => !provided.has(name));
    if (missing.length) {
      throw new BadRequestException(`Missing values for required environment variables: ${missing.join(', ')}`);
    }
    if (secrets && submittedNames.length) {
      await this.saveSecrets(requesterUid, app, secrets, 'preview');
    }
    await this.recordEvent('DEPLOY_STARTED', requesterUid, {
      appUid: app.uid,
      appId: app.appId,
      deploymentId: target.deploymentId,
      message: 'environment=preview',
    });
    return this.startDeployAttempt(
      requesterUid,
      app,
      target.deploymentId,
      target.s3Key,
      Array.from(provided),
      'preview',
      null
    );
  }

  /**
   * Saves secret VALUES to the sandbox runner's secret store (merge/upsert per
   * the runner's `/v1/projects/<project>/secrets` contract) and remembers only
   * the NAMES on the app record. Never log or persist the values.
   */
  private async saveSecrets(
    memberUid: string,
    app: AiApp,
    secrets: Record<string, string>,
    environment: AiAppTargetEnvironment = 'prod'
  ): Promise<void> {
    const names = Object.keys(secrets);
    try {
      this.logger.log(`Runner secrets request for ${app.appId}: POST ${buildRunnerSecretsUrl()} (${names.join(', ')})`);
      const response = await axios.post(
        buildRunnerSecretsUrl(),
        { appId: app.appId, environment, secrets },
        { headers: { 'Content-Type': 'application/json', 'x-runner-token': AI_APPS_RUNNER_TOKEN } }
      );
      // Log only the status — the request/response may echo secret values.
      this.logger.log(`Runner secrets response for ${app.appId}: status=${response.status}`);
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      this.logger.error(`Runner secrets error for ${app.appId}: status=${status ?? 'n/a'}`);
      throw new BadGatewayException('Failed to store secrets on the sandbox runner');
    }

    if (environment === 'preview') {
      const table = this.targetTable();
      const current = table
        ? await table.findUnique({ where: { appUid_environment: { appUid: app.uid, environment: 'preview' } } })
        : null;
      await table?.update({
        where: { appUid_environment: { appUid: app.uid, environment: 'preview' } },
        data: { providedEnvVars: Array.from(new Set([...(current?.providedEnvVars ?? []), ...names])) },
      });
    } else {
      const updated = await this.prisma.aiApp.update({
        where: { uid: app.uid },
        data: { providedEnvVars: Array.from(new Set([...app.providedEnvVars, ...names])) },
      });
      await this.mirrorProdTarget(updated);
    }
    await this.recordEvent('SECRETS_UPDATED', memberUid, {
      appUid: app.uid,
      appId: app.appId,
      message: `${environment}: ${names.join(', ')}`,
    });
  }

  /**
   * Starts one deploy attempt and hands the pipeline to the background job:
   * flips the app/target to DEPLOYING under a fresh attempt id (phase `queued`),
   * queues the job, and returns the app payload plus where to poll. Callers
   * run the synchronous checks, store the bundle and record DEPLOY_STARTED
   * first. If the job can't be queued the attempt fails at once (the bundle
   * stays in S3, so a retry works).
   */
  private async startDeployAttempt(
    actorUid: string,
    app: Pick<AiApp, 'uid' | 'appId' | 'name' | 'memberUid'>,
    deploymentId: string,
    s3Key: string,
    secretNames: string[],
    environment: AiAppTargetEnvironment,
    previous: DeployRowSnapshot | null
  ): Promise<ApiAiApp<AiApp> & DeployAcceptedFields> {
    const attemptId = randomUUID();
    const deployingData = {
      status: 'DEPLOYING' as const,
      deploymentId,
      s3Key,
      url: buildAppUrl(app.appId, environment),
      httpUrl: buildAppHttpUrl(app.appId, environment),
      host: buildAppHost(app.appId, environment),
      notes: null,
      failureStream: null,
      deployPhase: 'queued',
      deployAttemptId: attemptId,
    };
    if (environment === 'prod') {
      const updated = await this.prisma.aiApp.update({ where: { uid: app.uid }, data: deployingData });
      await this.mirrorProdTarget(updated);
    } else {
      await this.targetTable()?.update({
        where: { appUid_environment: { appUid: app.uid, environment: 'preview' } },
        data: deployingData,
      });
    }
    this.dropLogsTailCache(app.appId, environment);

    const data: AiAppDeployJobData = {
      attemptId,
      actorUid,
      appUid: app.uid,
      environment,
      deploymentId,
      s3Key,
      secretNames: secretNames ?? [],
      previous,
    };
    try {
      if (!this.deployQueue) {
        throw new Error('the deploy queue is not configured');
      }
      await this.deployQueue.add('deploy', data, {
        jobId: attemptId,
        // A blind re-run could double-deploy; retries go through the member/agent deploy endpoints.
        attempts: 1,
        timeout: AI_APPS_DEPLOY_JOB_TIMEOUT_MS,
        removeOnComplete: true,
        removeOnFail: 1000,
      });
    } catch (error) {
      this.logger.error(`Could not queue the deploy of ${app.appId} (${deploymentId}): ${(error as Error).message}`);
      await this.failDeploy(
        app,
        actorUid,
        { appUid: app.uid, appId: app.appId, deploymentId },
        DEPLOY_NOT_STARTED_MESSAGE,
        null,
        environment,
        attemptId
      );
      throw new ServiceUnavailableException('The deploy could not be started — try again in a minute.');
    }

    const fresh = (await this.prisma.aiApp.findUnique({ where: { uid: app.uid } })) ?? (app as AiApp);
    const targets = (await this.loadTargetRows([app.uid])).get(app.uid) ?? [];
    return {
      ...this.toApiApp((await this.withMember([fresh]))[0], true, 0, targets),
      statusEndpoint: buildDeploymentStatusUrl(app.uid, deploymentId, environment),
      pollIntervalSec: AI_APPS_DEPLOY_POLL_INTERVAL_SEC,
    };
  }

  /**
   * Bull entry point for one queued deploy attempt. The outcome is recorded on
   * the row by the pipeline itself, so handled failures resolve normally; an
   * unexpected error fails the attempt instead of waiting for the stuck sweep.
   */
  async runDeployJob(job: AiAppDeployJob): Promise<void> {
    try {
      await this.executeDeployJob(job);
    } catch (error) {
      if (error instanceof HttpException) {
        return;
      }
      const { data } = job;
      this.logger.error(
        `AI App deploy job ${data.attemptId} (${data.deploymentId}) crashed: ${(error as Error).message}`
      );
      try {
        const app = await this.prisma.aiApp.findUnique({ where: { uid: data.appUid } });
        if (app) {
          await this.failDeploy(
            app,
            data.actorUid,
            { appUid: app.uid, appId: app.appId, deploymentId: data.deploymentId },
            `Deploy failed: ${(error as Error).message}`,
            null,
            data.environment,
            data.attemptId
          );
        }
      } catch (settleError) {
        this.logger.error(`Could not settle crashed deploy job ${data.attemptId}: ${(settleError as Error).message}`);
      }
    }
  }

  /**
   * Runs the pipeline for a queued attempt, or resumes it after a restart:
   * returns without touching anything when the row no longer belongs to this
   * attempt or the attempt already settled; past `building`, the runner build
   * already went out, so the outcome comes from the orchestrator's record
   * instead of a second `/deploy` call. Throws the pipeline's HTTP errors.
   */
  async executeDeployJob(job: AiAppDeployJob): Promise<ApiAiApp<AiApp> | null> {
    const { data } = job;
    const app = await this.prisma.aiApp.findUnique({ where: { uid: data.appUid } });
    if (!app) {
      return null;
    }
    const row =
      data.environment === 'preview'
        ? await this.targetTable()?.findUnique({
            where: { appUid_environment: { appUid: app.uid, environment: 'preview' } },
          })
        : app;
    if (!row || row.deployAttemptId !== data.attemptId) {
      this.logger.warn(`AI App deploy job ${data.attemptId} for ${app.appId} no longer owns the row — skipping`);
      return null;
    }
    if (row.deployPhase === 'done' || row.deployPhase === 'failed') {
      return null;
    }
    const resumeFromRecord =
      (row.deployPhase === 'building' || row.deployPhase === 'injecting_runtime_config') &&
      typeof data.attemptStartedAt === 'number';
    if (resumeFromRecord) {
      this.logger.log(`Resuming AI App deploy ${data.deploymentId} for ${app.appId} from phase ${row.deployPhase}`);
    }
    return this.proxyDeploy(
      data.actorUid,
      data.environment === 'preview' ? { ...app, database: row.database } : app,
      data.deploymentId,
      data.s3Key,
      data.secretNames,
      data.environment,
      {
        attemptId: data.attemptId,
        previous: data.previous,
        resumeFromRecord,
        attemptStartedAt: data.attemptStartedAt,
        recordStart: async (startedAt) => {
          data.attemptStartedAt = startedAt;
          await job.update?.(data);
        },
      }
    );
  }

  /**
   * Checkpoints the attempt's phase. Raw SQL on purpose: `updatedAt` must stay
   * the deploy start (stuck window). Never throws — a missed checkpoint only
   * weakens resume, it must not fail the deploy.
   */
  private async setDeployPhase(
    appUid: string,
    environment: AiAppTargetEnvironment,
    attemptId: string,
    phase: DeployPhase
  ): Promise<void> {
    try {
      if (environment === 'preview') {
        await this.prisma.$executeRaw`
          UPDATE "AiAppTarget" SET "deployPhase" = ${phase}
          WHERE "appUid" = ${appUid} AND "environment" = 'preview' AND "deployAttemptId" = ${attemptId}`;
      } else {
        await this.prisma.$executeRaw`
          UPDATE "AiApp" SET "deployPhase" = ${phase}
          WHERE "uid" = ${appUid} AND "deployAttemptId" = ${attemptId}`;
      }
    } catch (error) {
      this.logger.warn(`Could not record deploy phase ${phase} for ${appUid}: ${(error as Error).message}`);
    }
  }

  /**
   * The deploy pipeline of one attempt (run by the background job): asks the
   * runner to build and start the bundle at `s3Key`, then settles READY/ERROR.
   * When the `/deploy` call ends without an answer (gateway timeout / no
   * response / our request timeout) — or a resumed job already sent it — the
   * outcome comes from the orchestrator's own deployment record for this
   * attempt, never from the app URL answering, which the previous version does
   * on a redeploy. After a successful build, apps with stored secrets or a
   * database get the secret-aware redeploy only when the build did not already
   * attach all of them. Every write is scoped to `attempt.attemptId`.
   */
  private async proxyDeploy(
    memberUid: string,
    app: Pick<AiApp, 'uid' | 'appId' | 'name' | 'memberUid' | 'database' | 'lastDeployedAt'>,
    deploymentId: string,
    s3Key: string,
    secretNames: string[],
    environment: AiAppTargetEnvironment,
    attempt: DeployAttempt
  ): Promise<ApiAiApp<AiApp> | null> {
    const host = buildAppHost(app.appId, environment);
    const url = buildAppUrl(app.appId, environment);
    const httpUrl = buildAppHttpUrl(app.appId, environment);
    const requestedDatabase = app.database as AiAppDatabaseInfo | null;
    const { attemptId } = attempt;

    const eventContext = { appUid: app.uid, appId: app.appId, deploymentId };

    const markReady = async (port: number | null, databaseInfo?: RunnerDeployDatabaseInfo) => {
      const readyData = {
        status: 'READY' as const,
        url,
        httpUrl,
        host,
        port,
        notes: null,
        failureStream: null,
        deployPhase: 'done',
        lastDeployedAt: new Date(),
        directLinkGateReady: true,
        publicPathsGateReady: true,
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
      };
      if (environment === 'preview') {
        const claimed = await this.targetTable()?.updateMany?.({
          where: { appUid: app.uid, environment: 'preview', deployAttemptId: attemptId },
          data: readyData,
        });
        if (!claimed?.count) {
          this.logger.warn(
            `AI App ${app.appId} preview deploy ${deploymentId} succeeded after another attempt took over`
          );
          return null;
        }
        await this.recordEvent('DEPLOY_SUCCEEDED', memberUid, { ...eventContext, message: url });
        const fresh = (await this.prisma.aiApp.findUnique({ where: { uid: app.uid } })) ?? (app as AiApp);
        const targets = (await this.loadTargetRows([app.uid])).get(app.uid) ?? [];
        return this.toApiApp((await this.withMember([fresh]))[0], true, 0, targets);
      }
      // The ONLY writer of lastDeployedAt on the app row — prod's "last successful ship".
      const claimed = await this.prisma.aiApp.updateMany({
        where: { uid: app.uid, deployAttemptId: attemptId },
        data: readyData,
      });
      const updated = claimed.count ? await this.prisma.aiApp.findUnique({ where: { uid: app.uid } }) : null;
      if (!updated) {
        this.logger.warn(`AI App ${app.appId} deploy ${deploymentId} succeeded after another attempt took over`);
        return null;
      }
      await this.mirrorProdTarget(updated);
      await this.recordEvent('DEPLOY_SUCCEEDED', memberUid, { ...eventContext, message: url });
      await this.announceIfEligible(updated);
      await this.notifyAllowedMembers(updated);
      const targets = (await this.loadTargetRows([app.uid])).get(app.uid) ?? [];
      return this.toApiApp((await this.withMember([updated]))[0], true, 0, targets);
    };

    /** Another operation holds the Helm release: this attempt never took the lock. */
    const rejectLockedAttempt = async () => {
      if (environment === 'prod') {
        await this.releaseLockedDeploy(attempt.previous, app, memberUid, eventContext, attemptId);
      } else {
        await this.failDeployIfCurrent(
          app,
          memberUid,
          eventContext,
          DEPLOY_IN_PROGRESS_MESSAGE,
          null,
          environment,
          attemptId
        );
      }
      throw new BadGatewayException('Another deploy of this app is still in progress');
    };

    let port: number | null = null;
    let databaseInfo: RunnerDeployDatabaseInfo | undefined;
    let authGateVersion: number | undefined;
    // Secret keys the build's own deployment attached (undefined = none / unknown).
    let attachedKeys: string[] | undefined;

    /**
     * The `/deploy` call gave no answer (or went out before a restart): the
     * orchestrator's deployment record for this attempt decides the outcome.
     */
    const settleFromOrchestratorRecord = async (attemptStartedAt: number, reason: string) => {
      const result = await this.waitForOrchestratorDeployment(app.appId, environment, deploymentId, attemptStartedAt);
      if (result.outcome !== 'success') {
        let failureMessage: string;
        let failureStream: 'build' | 'runtime' | null = null;
        if (result.outcome === 'failed') {
          const failure = await this.classifyOrchestratorFailure(app.appId, result.record);
          if (failure === 'conflict') {
            this.logger.warn(`AI App deploy for ${app.appId} lost the Helm lock to another operation`);
            await rejectLockedAttempt();
          }
          failureMessage = `Runner error: ${result.record.error ?? 'deployment failed'}`;
          failureStream = failure === 'conflict' ? null : failure;
        } else {
          // The build may have hung, or the request never reached the build — genuinely unknown.
          failureMessage =
            result.outcome === 'unregistered'
              ? `Deploy outcome could not be confirmed: the runner has no record of this deploy. (${reason})`
              : `Deploy outcome could not be confirmed: the runner still reports this deploy as running. (${reason})`;
        }
        this.logger.error(`AI App deploy failed for ${app.appId}: ${failureMessage}`);
        await this.failDeploy(app, memberUid, eventContext, failureMessage, failureStream, environment, attemptId);
        throw new BadGatewayException('Failed to deploy app to the sandbox runner');
      }
      this.logger.log(`AI App ${app.appId}: orchestrator reports deployment ${deploymentId} succeeded — continuing`);
      attachedKeys = attachedRuntimeSecretKeys(result.record.values);
      // The runner's response (which reports the gate version) never arrived: ask the
      // live gate, now served by the new release.
      authGateVersion = await this.gateVersionServed(url);
    };

    if (attempt.resumeFromRecord && attempt.attemptStartedAt !== undefined) {
      await settleFromOrchestratorRecord(attempt.attemptStartedAt, 'resumed after a restart');
    } else {
      const attemptStartedAt = Date.now();
      await attempt.recordStart(attemptStartedAt);
      await this.setDeployPhase(app.uid, environment, attemptId, 'building');
      try {
        this.logger.log(
          `Runner deploy request for ${app.appId}: POST ${AI_APPS_RUNNER_URL}/deploy ` +
            `(deploymentId=${deploymentId}, s3Key=${s3Key}${
              requestedDatabase?.enabled ? `, database=${requestedDatabase.type}` : ''
            })`
        );
        const response = await axios.post<RunnerDeployResponse>(
          `${AI_APPS_RUNNER_URL}/deploy`,
          { appId: app.appId, deploymentId, s3Key, environment },
          {
            headers: { 'Content-Type': 'application/json', 'x-runner-token': AI_APPS_RUNNER_TOKEN },
            timeout: AI_APPS_RUNNER_DEPLOY_TIMEOUT_MS,
          }
        );
        this.logRunnerResponse('deploy', app.appId, response.status, response.data);
        // The runner sometimes reports failure inside a 2xx body (see
        // logRunnerResponse) — treating that as success would mark a dead deploy
        // READY and corrupt lastDeployedAt/serving.
        if (typeof response.data?.status === 'string' && response.data.status.toLowerCase() === 'failed') {
          const message = `Runner reported failure: ${this.safeStringify(response.data)}`;
          this.logger.error(`AI App deploy failed for ${app.appId}: ${message}`);
          await this.failDeploy(app, memberUid, eventContext, message, 'build', environment, attemptId);
          throw new BadGatewayException('Failed to deploy app to the sandbox runner');
        }
        port = response.data.port ?? null;
        authGateVersion = typeof response.data.authGateVersion === 'number' ? response.data.authGateVersion : undefined;
        attachedKeys = attachedRuntimeSecretKeys(response.data.deployment?.values);
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

        // Another operation (typically an earlier deploy's build) holds the release:
        // this attempt never started — not a build failure. Don't stamp ERROR if a
        // concurrent attempt already moved the row off DEPLOYING.
        if (this.isHelmReleaseLocked(error) || message.includes(HELM_RELEASE_LOCKED_TEXT)) {
          this.logger.warn(`AI App deploy rejected for ${app.appId}: release locked by another deploy (${message})`);
          await rejectLockedAttempt();
        }

        if (!this.isUncertainRunnerError(error)) {
          this.logger.error(`AI App deploy failed for ${app.appId}: ${message}`);
          await this.failDeploy(app, memberUid, eventContext, message, 'build', environment, attemptId);
          throw new BadGatewayException('Failed to deploy app to the sandbox runner');
        }

        // A gateway timeout (Cloudflare 504/524, etc.) or no response doesn't mean the
        // deploy failed — the build keeps running on the orchestrator.
        this.logger.warn(
          `Runner /deploy gave no answer for ${app.appId}; waiting for the orchestrator's deployment record. (${message})`
        );
        await settleFromOrchestratorRecord(attemptStartedAt, message);
      }
    }

    // The build mounts every secret currently in SSM, including keys saved
    // after the last secret-aware deploy. A follow-up upgrade runs only for
    // something that build did not attach (a database that still has to be
    // provisioned). A secrets/database app that can't get its values must
    // fail loudly rather than go READY in a broken state.
    const needsRuntimeConfig = secretNames.length > 0 || !!requestedDatabase?.enabled;
    if (needsRuntimeConfig && runtimeConfigAlreadyAttached(secretNames, requestedDatabase, attachedKeys)) {
      this.logger.log(
        `Runtime config for ${app.appId} already attached by the build (${attachedKeys?.length ?? 0} keys) — ` +
          `skipping secrets deploy`
      );
    } else if (needsRuntimeConfig) {
      const attached = new Set(attachedKeys ?? []);
      const missing = [
        ...secretNames.filter((name) => !attached.has(name)),
        ...(requestedDatabase?.enabled && !attached.has(DATABASE_CREDENTIALS_KEY) ? ['database'] : []),
      ];
      this.logger.log(`Runtime config for ${app.appId} not attached by the build (missing: ${missing.join(', ')})`);
      await this.setDeployPhase(app.uid, environment, attemptId, 'injecting_runtime_config');
      try {
        databaseInfo = await this.deployImageWithRuntimeConfig(
          app.appId,
          secretNames,
          url,
          requestedDatabase,
          environment
        );
      } catch (error) {
        if ((error as Error).message?.includes(HELM_RELEASE_LOCKED_TEXT)) {
          this.logger.warn(
            `Runtime config for ${app.appId} stayed locked after retries; not overwriting a settled deploy`
          );
          await this.failDeployIfCurrent(
            app,
            memberUid,
            eventContext,
            DEPLOY_IN_PROGRESS_MESSAGE,
            null,
            environment,
            attemptId
          );
          throw new BadGatewayException('Another deploy of this app is still in progress');
        }
        const message = `Runtime config injection failed: ${(error as Error).message}`;
        this.logger.error(`AI App deploy failed for ${app.appId}: ${message}`);
        // The image already built — injecting/starting it is a runtime story.
        await this.failDeploy(app, memberUid, eventContext, message, 'runtime', environment, attemptId);
        throw new BadGatewayException('Failed to inject secrets/database on the sandbox runner');
      }
    }

    await this.recordAuthGateVersion(app.uid, environment, authGateVersion);
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
    database?: Pick<AiAppDatabaseInfo, 'enabled' | 'type'> | null,
    environment: AiAppTargetEnvironment = 'prod'
  ): Promise<RunnerDeployDatabaseInfo | undefined> {
    const headers = { 'Content-Type': 'application/json', 'x-runner-token': AI_APPS_RUNNER_TOKEN };

    const registry = await axios.get<{ apps?: Array<{ app_id?: string; image?: string; release_name?: string }> }>(
      `${AI_APPS_RUNNER_URL}/apps`,
      { headers: { 'x-runner-token': AI_APPS_RUNNER_TOKEN } }
    );
    const releaseName = releaseNameForTarget(appId, environment);
    const apps = registry.data?.apps ?? [];
    const image =
      apps.find((entry) => entry.app_id === appId && entry.release_name === releaseName)?.image ??
      (environment === 'prod'
        ? apps.find((entry) => entry.app_id === appId && (!entry.release_name || entry.release_name === appId))?.image
        : undefined);
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
            environment,
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
        // 409 helm_release_locked: another Helm operation (e.g. an auth-gate
        // refresh) holds the release. The lock clears when it completes — wait
        // and retry.
        if (this.isHelmReleaseLocked(error) && attempt < AI_APPS_HELM_LOCK_RETRIES) {
          this.logger.warn(
            `Helm release locked for ${appId}; retrying secrets deploy in ${AI_APPS_HELM_LOCK_RETRY_INTERVAL_MS}ms ` +
              `(attempt ${attempt + 1}/${AI_APPS_HELM_LOCK_RETRIES})`
          );
          await new Promise((resolve) => setTimeout(resolve, AI_APPS_HELM_LOCK_RETRY_INTERVAL_MS));
          continue;
        }
        if (this.isHelmReleaseLocked(error)) {
          throw new Error(HELM_RELEASE_LOCKED_TEXT);
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
    if (!axios.isAxiosError(error) || error.response == null) {
      return false;
    }
    const body = this.safeStringify(error.response.data);
    return body.includes('helm_release_locked') || body.includes(HELM_RELEASE_LOCKED_TEXT);
  }

  /**
   * Waits for the orchestrator's deployment record of this `/deploy` attempt to
   * finish. The orchestrator records every attempt under the caller's
   * `deploymentId`; the same id can be redeployed, so only a record for the
   * target's release created during this attempt counts. Poll errors are
   * transient — logged and retried until the deadline, never an outcome.
   */
  private async waitForOrchestratorDeployment(
    appId: string,
    environment: AiAppTargetEnvironment,
    deploymentId: string,
    attemptStartedAt: number
  ): Promise<OrchestratorDeployOutcome> {
    const releaseName = releaseNameForTarget(appId, environment);
    const notBefore = attemptStartedAt - DEPLOYMENT_RECORD_CLOCK_SKEW_MS;
    const registerBy = attemptStartedAt + AI_APPS_DEPLOY_REGISTER_GRACE_MS;
    const deadline = attemptStartedAt + AI_APPS_DEPLOY_POLL_DEADLINE_MS;
    let record: RunnerDeploymentRecord | undefined;
    for (;;) {
      try {
        const response = await axios.get<{ deployments?: RunnerDeploymentRecord[] }>(buildRunnerDeploymentsUrl(), {
          params: { appId, limit: 20 },
          headers: { 'x-runner-token': AI_APPS_RUNNER_TOKEN },
          timeout: 15000,
        });
        record = (response.data?.deployments ?? [])
          .filter(
            (row) =>
              row.deployment_id === deploymentId &&
              row.release_name === releaseName &&
              Date.parse(row.created_at ?? '') >= notBefore
          )
          .sort((a, b) => Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? ''))[0];
        if (record?.status === 'success' || record?.status === 'failed') {
          this.logger.log(
            `Orchestrator deployment ${record.id ?? '?'} for ${appId} (${deploymentId}) finished: ${record.status}`
          );
          return { outcome: record.status, record };
        }
      } catch (error) {
        this.logRunnerError('deployment-status', appId, error);
      }
      const now = Date.now();
      if (!record && now >= registerBy) {
        return { outcome: 'unregistered' };
      }
      if (now >= deadline) {
        return { outcome: 'timeout', record };
      }
      await new Promise((resolve) => setTimeout(resolve, AI_APPS_DEPLOY_POLL_INTERVAL_MS));
    }
  }

  /**
   * Classifies a failed orchestrator deployment record: a release-lock failure
   * is a concurrent deploy (`conflict`); otherwise the record's events tell
   * whether the image built (`runtime`) or not (`build`). An unreadable record
   * counts as a build failure.
   */
  private async classifyOrchestratorFailure(
    appId: string,
    record: RunnerDeploymentRecord
  ): Promise<'conflict' | 'build' | 'runtime'> {
    if ((record.error ?? '').includes(HELM_RELEASE_LOCKED_TEXT)) {
      return 'conflict';
    }
    if (!record.id) {
      return 'build';
    }
    try {
      const response = await axios.get<{ events?: Array<{ type?: string }> }>(buildRunnerDeploymentUrl(record.id), {
        headers: { 'x-runner-token': AI_APPS_RUNNER_TOKEN },
        timeout: 15000,
      });
      return (response.data?.events ?? []).some((event) => event.type === 'build.success') ? 'runtime' : 'build';
    } catch (error) {
      this.logRunnerError('deployment-events', appId, error);
      return 'build';
    }
  }

  /**
   * This attempt never took the Helm lock, so put the row back to what it was
   * before the attempt's DEPLOYING write, and record the rejected attempt as
   * DEPLOY_FAILED (no bell notification — nothing the owner has to act on).
   * The where-clause gives up when a concurrent attempt already settled or
   * took over the row. Without a prior state (first-ever deploy) the attempt
   * is failed instead.
   */
  private async releaseLockedDeploy(
    previous: DeployRowSnapshot | null,
    app: Pick<AiApp, 'uid' | 'name' | 'memberUid'>,
    actorUid: string,
    eventContext: { appUid: string; appId: string; deploymentId: string },
    attemptId: string
  ): Promise<void> {
    if (!previous) {
      await this.failDeployIfCurrent(app, actorUid, eventContext, DEPLOY_IN_PROGRESS_MESSAGE, null, 'prod', attemptId);
      return;
    }
    const claimed = await this.prisma.aiApp.updateMany({
      where: { uid: app.uid, deploymentId: eventContext.deploymentId, status: 'DEPLOYING', deployAttemptId: attemptId },
      data: {
        status: previous.status,
        deploymentId: previous.deploymentId,
        s3Key: previous.s3Key,
        url: previous.url,
        httpUrl: previous.httpUrl,
        host: previous.host,
        notes: previous.notes,
        failureStream: previous.failureStream,
        deployPhase: previous.deployPhase,
      },
    });
    if (!claimed.count) return;
    const updated = await this.prisma.aiApp.findUnique({ where: { uid: app.uid } });
    if (updated) await this.mirrorProdTarget(updated);
    await this.recordEvent('DEPLOY_FAILED', actorUid, { ...eventContext, message: DEPLOY_IN_PROGRESS_MESSAGE });
  }

  /**
   * Records a lock conflict only while this attempt still owns the DEPLOYING row.
   * A holder that already reached READY (or a newer attempt) keeps its status.
   * Returns false when the row was left untouched.
   */
  private async failDeployIfCurrent(
    app: Pick<AiApp, 'uid' | 'name' | 'memberUid'>,
    actorUid: string,
    eventContext: { appUid: string; appId: string; deploymentId: string },
    message: string,
    failureStream: 'build' | 'runtime' | null,
    environment: AiAppTargetEnvironment,
    attemptId: string
  ): Promise<boolean> {
    const notes = message.slice(0, 2000);
    const data = { status: 'ERROR' as const, notes, failureStream, deployPhase: 'failed' };
    if (environment === 'preview') {
      const table = this.targetTable();
      if (!table?.updateMany) {
        return this.failDeploy(app, actorUid, eventContext, message, failureStream, environment, attemptId);
      }
      const claimed = await table.updateMany({
        where: {
          appUid: app.uid,
          environment: 'preview',
          deploymentId: eventContext.deploymentId,
          status: 'DEPLOYING',
          deployAttemptId: attemptId,
        },
        data,
      });
      if (!claimed.count) {
        this.logger.warn(`AI App ${eventContext.appId} lock conflict ignored; preview attempt no longer owns the row`);
        return false;
      }
    } else {
      const claimed = await this.prisma.aiApp.updateMany({
        where: {
          uid: app.uid,
          deploymentId: eventContext.deploymentId,
          status: 'DEPLOYING',
          deployAttemptId: attemptId,
        },
        data,
      });
      if (!claimed.count) {
        this.logger.warn(
          `AI App ${eventContext.appId} lock conflict ignored; attempt ${eventContext.deploymentId} no longer owns the row`
        );
        return false;
      }
      const updated = await this.prisma.aiApp.findUnique({ where: { uid: app.uid } });
      if (updated) await this.mirrorProdTarget(updated);
    }
    await this.recordEvent('DEPLOY_FAILED', actorUid, {
      ...eventContext,
      message: environment === 'preview' ? `preview: ${notes}` : notes,
    });
    await this.notifyDeployFailed(app);
    return true;
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
   * With `attemptId` (the background job) the write applies only while that
   * attempt owns the row; returns false when it was left untouched.
   */
  private async failDeploy(
    app: Pick<AiApp, 'uid' | 'name' | 'memberUid'>,
    actorUid: string,
    eventContext: { appUid: string; appId: string; deploymentId: string },
    message: string,
    failureStream: 'build' | 'runtime' | null = null,
    environment: AiAppTargetEnvironment = 'prod',
    attemptId?: string
  ): Promise<boolean> {
    const notes = message.slice(0, 2000);
    const data = { status: 'ERROR' as const, notes, failureStream, ...(attemptId ? { deployPhase: 'failed' } : {}) };
    if (environment === 'preview') {
      const table = this.targetTable();
      if (attemptId && table?.updateMany) {
        const claimed = await table.updateMany({
          where: { appUid: app.uid, environment: 'preview', deployAttemptId: attemptId },
          data,
        });
        if (!claimed.count) {
          this.logger.warn(`AI App ${eventContext.appId} preview failure ignored; attempt no longer owns the row`);
          return false;
        }
      } else {
        await table?.update({
          where: { appUid_environment: { appUid: app.uid, environment: 'preview' } },
          data,
        });
      }
    } else if (attemptId) {
      const claimed = await this.prisma.aiApp.updateMany({ where: { uid: app.uid, deployAttemptId: attemptId }, data });
      if (!claimed.count) {
        this.logger.warn(`AI App ${eventContext.appId} failure ignored; attempt ${attemptId} no longer owns the row`);
        return false;
      }
      const updated = await this.prisma.aiApp.findUnique({ where: { uid: app.uid } });
      if (updated) await this.mirrorProdTarget(updated);
    } else {
      const updated = await this.prisma.aiApp.update({ where: { uid: app.uid }, data });
      await this.mirrorProdTarget(updated);
    }
    await this.recordEvent('DEPLOY_FAILED', actorUid, {
      ...eventContext,
      message: environment === 'preview' ? `preview: ${notes}` : notes,
    });
    await this.notifyDeployFailed(app);
    return true;
  }

  /**
   * Broadcasts that a new app just went live, to everyone with AI Apps access
   * (read or write — either grants dashboard visibility). Sent at most once per
   * app and only while it is OPEN — see `announceIfEligible`.
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
  private async notifyAccessGranted(
    app: Pick<AiApp, 'uid' | 'name'>,
    recipientUid: string,
    ownerName: string | null
  ): Promise<void> {
    try {
      await this.pushNotifications.create({
        category: PushNotificationCategory.AI_APP,
        ...AI_APPS_NOTIFICATION_MESSAGES.accessGranted(app.name, ownerName),
        link: aiAppDetailPath(app.uid),
        recipientUid,
        isPublic: false,
        metadata: {
          eventType: 'ai_app_access',
          appUid: app.uid,
          trigger: AI_APPS_NOTIFICATION_TRIGGERS.ACCESS_GRANTED,
        },
      });
    } catch (error) {
      this.logger.warn(
        `AI App access-granted notification failed for ${app.uid} → ${recipientUid}: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }

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
  /** Auth gate version a live target reports on `/_pln/gate`; undefined for gate v1 (no such route) or no answer. */
  private async gateVersionServed(url: string): Promise<number | undefined> {
    try {
      const res = await axios.get(`${url}/_pln/gate`, { timeout: 10000, validateStatus: () => true, maxRedirects: 0 });
      return res.status === 200 && typeof res.data?.version === 'number' ? res.data.version : undefined;
    } catch {
      return undefined;
    }
  }

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
  private deployKeyTable(): {
    findMany: (args: any) => Promise<any[]>;
    findUnique: (args: any) => Promise<any | null>;
    create: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  } | null {
    const table = (this.prisma as any).aiAppDeployKey;
    return table?.create ? table : null;
  }

  async createDeployKey(memberUid: string, uid: string, environment: AiAppTargetEnvironment) {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app || app.status === 'DELETED') throw new NotFoundException(`AI App not found: ${uid}`);
    if (!(await this.isCreatorOrDirectoryAdmin(memberUid, app))) {
      throw new ForbiddenException('Only the app creator or a directory admin can create a deployment key');
    }
    const table = this.deployKeyTable();
    if (!table) throw new InternalServerErrorException('Deployment keys are not available');
    const token = `plndeploy_${randomBytes(24).toString('hex')}`;
    const created = await table.create({
      data: {
        appUid: app.uid,
        environment,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        tokenPrefix: token.slice(0, 16),
        createdByUid: memberUid,
      },
    });
    return {
      uid: created.uid,
      environment,
      tokenPrefix: created.tokenPrefix,
      token,
      createdAt: created.createdAt,
    };
  }

  async listDeployKeys(memberUid: string, uid: string) {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app || app.status === 'DELETED') throw new NotFoundException(`AI App not found: ${uid}`);
    if (!(await this.isCreatorOrDirectoryAdmin(memberUid, app))) {
      throw new ForbiddenException('Only the app creator or a directory admin can list deployment keys');
    }
    const rows =
      (await this.deployKeyTable()?.findMany({
        where: { appUid: app.uid, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      })) ?? [];
    return {
      keys: rows.map((row) => ({
        uid: row.uid,
        environment: row.environment,
        tokenPrefix: row.tokenPrefix,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
      })),
    };
  }

  async revokeDeployKey(memberUid: string, uid: string, keyUid: string) {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app || app.status === 'DELETED') throw new NotFoundException(`AI App not found: ${uid}`);
    if (!(await this.isCreatorOrDirectoryAdmin(memberUid, app))) {
      throw new ForbiddenException('Only the app creator or a directory admin can revoke a deployment key');
    }
    const table = this.deployKeyTable();
    const key = table ? await table.findUnique({ where: { uid: keyUid } }) : null;
    if (!key || key.appUid !== app.uid || key.revokedAt) {
      throw new NotFoundException('Deployment key not found');
    }
    await table!.update({ where: { uid: keyUid }, data: { revokedAt: new Date() } });
    return { uid: keyUid, revoked: true };
  }

  async deleteTarget(memberUid: string, uid: string, environment: AiAppTargetEnvironment): Promise<ApiAiApp<AiApp>> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    if (!(await this.isCreatorOrDirectoryAdmin(memberUid, app))) {
      throw new ForbiddenException('Only the app creator or a directory admin can tear down a deployment');
    }
    const table = this.targetTable();
    if (environment === 'preview') {
      const target = table
        ? await table.findUnique({ where: { appUid_environment: { appUid: app.uid, environment: 'preview' } } })
        : null;
      if (!target?.url && !target?.s3Key && !target?.lastDeployedAt) {
        throw new NotFoundException('This environment is not deployed');
      }
    } else if (!app.url && !app.s3Key && !app.lastDeployedAt) {
      throw new NotFoundException('This environment is not deployed');
    }

    const eventContext = { appUid: app.uid, appId: app.appId, message: `environment=${environment}` };
    await this.recordEvent('DELETE_STARTED', memberUid, eventContext);
    try {
      const response = await axios.delete(`${AI_APPS_RUNNER_URL}/apps/${encodeURIComponent(app.appId)}`, {
        headers: { 'x-runner-token': AI_APPS_RUNNER_TOKEN },
        params: { environment },
        validateStatus: (status) => status < 500,
      });
      if (response.status >= 400 && response.status !== 404) {
        throw new BadGatewayException('Failed to tear down the deployment');
      }
    } catch (error) {
      if (!(error instanceof BadGatewayException)) {
        this.logRunnerError('delete-target', app.appId, error);
      }
      await this.recordEvent('DELETE_FAILED', memberUid, eventContext);
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('Failed to tear down the deployment');
    }

    if (environment === 'preview') {
      await table?.deleteMany({ where: { appUid: app.uid, environment: 'preview' } });
    } else {
      const cleared = await this.prisma.aiApp.update({
        where: { uid: app.uid },
        data: {
          status: 'IN_DEVELOPMENT',
          notes: null,
          url: null,
          httpUrl: null,
          host: null,
          port: null,
          deploymentId: null,
          s3Key: null,
          requiredEnvVars: [],
          providedEnvVars: [],
          lastDeployedAt: null,
          failureStream: null,
          database: Prisma.DbNull,
          directLinkGateReady: false,
          publicPathsGateReady: false,
        },
      });
      await this.mirrorProdTarget(cleared);
    }
    await this.recordEvent('DELETE_SUCCEEDED', memberUid, eventContext);
    return this.getApp(uid, memberUid);
  }

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
    await this.targetTable()?.deleteMany({ where: { appUid: uid } });
    await this.recordEvent('DELETE_SUCCEEDED', memberUid, eventContext);
    return this.toApiApp((await this.withMember([updated]))[0], true);
  }
}
