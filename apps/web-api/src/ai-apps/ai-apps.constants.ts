/**
 * AI Apps (PL Infra) — POC constants.
 *
 * The starter kit no longer ships a long-lived token. Instead the member's AI
 * agent starts a short-lived "connect" session, the member approves it in LabOS
 * (proving `ai_apps.write`), and we mint a short-lived deploy token bound to that
 * session. The agent uploads the app ZIP to us with that token; our backend
 * stores it in S3 and proxies the deploy to the sandbox runner using the
 * server-side runner token — so neither AWS credentials nor the runner secret
 * ever leave our infrastructure.
 */

/** Starter kit version shown in the README, ZIP filename, and LabOS UI. Bump when the kit contents or flow change. */
export const AI_APPS_STARTER_KIT_VERSION = '1.14';

/** Max members on one private app's whitelist (the owner and directory admins never count). */
export const AI_APPS_MAX_ALLOWED_MEMBERS = 200;

/** Max results of the whitelist member search. */
export const AI_APPS_ACCESS_CANDIDATES_LIMIT = 10;

/**
 * Per-IP limit for the sidecar hot paths (`GET /access-check`, `GET /me`).
 * The app-wide limiter is 10/s, and a single navigation (page, API, RSC
 * prefetch) already exceeds that — the calls come from the pod, so they share
 * one egress IP. ttl is seconds, matching `@nestjs/throttler` v3.
 */
export const AI_APPS_SIDECAR_THROTTLE_LIMIT = 300;
export const AI_APPS_SIDECAR_THROTTLE_TTL_SECONDS = 1;

/** Header the AI agent sends with its short-lived deploy token. */
export const AI_APP_TOKEN_HEADER = 'x-app-token';

/** Prefix for minted short-lived deploy tokens (for easy identification). */
export const AI_APP_DEPLOY_TOKEN_PREFIX = 'plndeploy_';

/**
 * How long a PENDING connect session stays open for the member to log in and
 * approve it before it expires (10 minutes).
 */
export const AI_APPS_CONNECT_SESSION_TTL_MS = 10 * 60 * 1000;

/** Rolling window for weekly-active-users on app tiles. */
export const AI_APPS_WAU_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Lifetime of the deploy token minted on approval (60 minutes). The agent may
 * deploy repeatedly within this window; after it the member must reconnect.
 */
export const AI_APPS_DEPLOY_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * App-scoped member sessions (LAB-2695). Deployed apps get a signed token bound to their appId instead of the LabOS
 * token. `AI_APPS_SESSION_SECRET` signs it; without one, sessions are disabled and the auth gate keeps its v1
 * behavior.
 */
export const AI_APPS_SESSION_SECRET = process.env.AI_APPS_SESSION_SECRET || '';
/** Header the auth gate uses to present an app session to access-check. */
export const AI_APP_SESSION_HEADER = 'x-ai-app-session';
/** `iss` of an app session token; how every guard tells it apart from a LabOS token. */
export const AI_APPS_SESSION_ISSUER = 'pln-ai-apps-session';
const positiveNumberFromEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
/** A session unused (through the auth gate) for this long expires. */
export const AI_APPS_SESSION_IDLE_MS = positiveNumberFromEnv('AI_APPS_SESSION_IDLE_HOURS', 24) * 60 * 60 * 1000;
/** Hard upper bound of a session, whatever its use. */
export const AI_APPS_SESSION_MAX_MS = positiveNumberFromEnv('AI_APPS_SESSION_MAX_DAYS', 30) * 24 * 60 * 60 * 1000;
/** Sliding the idle expiry writes at most this often per session. */
export const AI_APPS_SESSION_TOUCH_MS = 5 * 60 * 1000;
/** A sign-in code must be redeemed within this window, once. */
export const AI_APPS_SESSION_CODE_TTL_MS = 60 * 1000;

/** Auth gate (sidecar) version the fleet rollout migrates every app to. */
export const AI_APPS_AUTH_GATE_CURRENT_VERSION = 2;

/** Suggested poll interval (seconds) the agent waits between connect polls. */
export const AI_APPS_CONNECT_POLL_INTERVAL_SEC = 3;

/** Max app ZIP size accepted by the deploy endpoint (50 MB). */
export const AI_APPS_MAX_ZIP_BYTES = 50 * 1024 * 1024;

/** Max Markdown/HTML one-pager PRD upload size (1 MB). */
export const AI_APPS_MAX_PRD_BYTES = 1 * 1024 * 1024;

/**
 * Liveness verification after the secret-aware runtime-config deployment ends
 * in a gateway timeout: the deploy flow polls the app URL before deciding
 * READY vs ERROR. (The `/deploy` build's outcome comes from the orchestrator's
 * deployment record instead — see AI_APPS_DEPLOY_POLL_*.) 24 attempts every 8s
 * (plus up to 10s per probe) covers ~6 minutes worst case.
 */
export const AI_APPS_VERIFY_ATTEMPTS = Number(process.env.AI_APPS_VERIFY_ATTEMPTS) || 24;
export const AI_APPS_VERIFY_INTERVAL_MS = Number(process.env.AI_APPS_VERIFY_INTERVAL_MS) || 8000;

/**
 * Secrets-injection retry while the Helm release is locked: the injection only
 * starts after the build's own deployment has finished, but another Helm
 * operation on the release (e.g. an auth-gate refresh) can still hold the lock,
 * and the runner then 409s with `helm_release_locked`. Such operations are
 * short, so wait and retry instead of failing the deploy. 8 retries every 15s
 * covers ~2 minutes.
 */
export const AI_APPS_HELM_LOCK_RETRIES = Number(process.env.AI_APPS_HELM_LOCK_RETRIES) || 8;
export const AI_APPS_HELM_LOCK_RETRY_INTERVAL_MS = Number(process.env.AI_APPS_HELM_LOCK_RETRY_INTERVAL_MS) || 15000;

/**
 * How long an app may sit in DEPLOYING before the deploy counts as STUCK.
 * Deploys run synchronously inside the API process (runner build, waiting for
 * the orchestrator's deployment record, secrets injection), and the record
 * wait below is capped under this window — a DEPLOYING row older than this
 * means the process died mid-deploy or the runner hung, and the row would
 * otherwise stay DEPLOYING forever. Stuck rows are settled to ERROR lazily on read.
 */
export const AI_APPS_DEPLOY_STUCK_MINUTES = Number(process.env.AI_APPS_DEPLOY_STUCK_MINUTES) || 15;
export const AI_APPS_DEPLOY_STUCK_MS = AI_APPS_DEPLOY_STUCK_MINUTES * 60 * 1000;

/**
 * Waiting for the orchestrator's own deployment record when the `/deploy` call
 * ends without an answer (gateway timeout / no response). The build keeps
 * running on the orchestrator, which records every attempt under the caller's
 * `deploymentId` and finishes it as `success` or `failed`; the deploy flow
 * polls that record instead of trusting that the app URL answers (on a
 * redeploy the previous version keeps answering).
 * - interval: time between polls;
 * - register grace: no record for this attempt by then means the request never
 *   reached the orchestrator's deploy workflow;
 * - deadline: overall wait from the start of the attempt, kept 2 minutes under
 *   the stuck window so a still-waiting deploy is never settled as stuck.
 */
export const AI_APPS_DEPLOY_POLL_INTERVAL_MS = Number(process.env.AI_APPS_DEPLOY_POLL_INTERVAL_MS) || 10000;
export const AI_APPS_DEPLOY_REGISTER_GRACE_MS = Number(process.env.AI_APPS_DEPLOY_REGISTER_GRACE_MS) || 2 * 60 * 1000;
export const AI_APPS_DEPLOY_POLL_DEADLINE_MS =
  Number(process.env.AI_APPS_DEPLOY_POLL_DEADLINE_MS) || Math.max(AI_APPS_DEPLOY_STUCK_MS - 2 * 60 * 1000, 60 * 1000);

/** Sandbox runner base URL (override via env for other environments). */
export const AI_APPS_RUNNER_URL = process.env.AI_APPS_RUNNER_URL || 'https://sandbox-runner.plnetwork.io';

/** Server-side token used to call the sandbox runner `/deploy` endpoint. */
export const AI_APPS_RUNNER_TOKEN = process.env.AI_APPS_RUNNER_TOKEN || '';

/** S3 bucket the sandbox runner reads app bundles from. */
export const AI_APPS_S3_BUCKET = process.env.AI_APPS_S3_BUCKET || '';

/**
 * Bucket for uploaded AI App PRDs. By default this reuses the image bucket
 * already used for member images, so no new bucket policy/IAM permission is
 * required. AI_APPS_PRD_S3_BUCKET remains an optional override.
 */
export const AI_APPS_PRD_S3_BUCKET = process.env.AI_APPS_PRD_S3_BUCKET || AI_APPS_S3_BUCKET;

/** Optional CDN/public base URL for PRDs, without a trailing slash. */
export const AI_APPS_PRD_PUBLIC_BASE_URL = process.env.AI_APPS_PRD_PUBLIC_BASE_URL || '';

/** Build a unique key while keeping the original Markdown/HTML extension. */
export const buildPrdS3Key = (appId: string, extension: string, uniqueId: string): string =>
  `ai-app-prds/${appId}/${uniqueId}${extension}`;

/** Convert a stored PRD key to the URL returned under the existing `prd` field. */
export const buildPrdPublicUrl = (key: string): string => {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  if (AI_APPS_PRD_PUBLIC_BASE_URL) {
    return `${AI_APPS_PRD_PUBLIC_BASE_URL.replace(/\/$/, '')}/${encodedKey}`;
  }
  const region = process.env.AWS_REGION || 'us-east-1';
  return `https://${AI_APPS_PRD_S3_BUCKET}.s3.${region}.amazonaws.com/${encodedKey}`;
};

/** Project scope for the runner's secrets/deployments API (`/v1/projects/<project>/…`). */
export const AI_APPS_RUNNER_PROJECT = process.env.AI_APPS_RUNNER_PROJECT || 'default';

/** Environment label the runner stores secrets under (e.g. `dev` on Dev, `prod` on Prod). */
export const AI_APPS_RUNNER_ENVIRONMENT = process.env.AI_APPS_RUNNER_ENVIRONMENT || 'prod';

/** Runner endpoint that saves (merge/upsert) an app's runtime secrets. */
export const buildRunnerSecretsUrl = (): string =>
  `${AI_APPS_RUNNER_URL}/v1/projects/${AI_APPS_RUNNER_PROJECT}/secrets`;

/**
 * Runner deployments collection: `POST` (re)deploys an already-built image with
 * the named stored secrets (and/or a provisioned database) injected; `GET`
 * (`?appId=…`) lists deployment records, including `/deploy` build attempts
 * keyed by the caller's `deploymentId`. The `/deploy` build only re-attaches
 * the secret keys an earlier successful secret-aware deployment recorded, so a
 * secret or database it did not attach still needs the `POST` after the build.
 */
export const buildRunnerDeploymentsUrl = (): string =>
  `${AI_APPS_RUNNER_URL}/v1/projects/${AI_APPS_RUNNER_PROJECT}/deployments`;

/** Runner endpoint returning one deployment record with its events (`GET /v1/deployments/:id`). */
export const buildRunnerDeploymentUrl = (id: string): string =>
  `${AI_APPS_RUNNER_URL}/v1/deployments/${encodeURIComponent(id)}`;

/** Log phases the runner serves from CloudWatch: the image build (Kaniko) vs the running app pod. */
export type AiAppLogPhase = 'build' | 'runtime';

/**
 * Query forwarded to the runner's log endpoints. Without `deploymentId` the
 * time window is the scope: every deployment of the app that logged inside it
 * is returned, so a redeploy never hides the previous pods' output.
 * `deploymentId` narrows the result to one deployment's pods.
 */
export type AiAppTargetEnvironment = 'prod' | 'preview';

/** Maps the agent field onto a target. `dev` is the old name for preview. */
export function coerceAppTarget(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const raw = value.trim().toLowerCase();
  if (!raw) return undefined;
  return raw === 'dev' ? 'preview' : raw;
}

export function normalizeAppTarget(value: string | undefined | null): AiAppTargetEnvironment {
  return coerceAppTarget(value) === 'preview' ? 'preview' : 'prod';
}

export type AiAppLogsQuery = {
  limit?: number;
  sinceMinutes?: number;
  nextToken?: string;
  deploymentId?: string;
  environment?: AiAppTargetEnvironment;
};

/** Shape of a runner deploymentId — the API's ids on `/deploy` and the runner's `deploy-<ts>-<rand>` ids. */
export const AI_APPS_LOG_DEPLOYMENT_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Runner endpoint serving an app's CloudWatch logs for one phase
 * (`GET /v1/apps/<appId>/build/logs` or `…/runtime/logs`). Both span every
 * deployment that logged inside the requested window unless `deploymentId`
 * narrows them to one; the response's `latestDeploymentId` names the latest
 * successful deployment for the phase. Availability is bounded by the
 * CloudWatch retention policy of the environment's log group.
 */
export const buildRunnerLogsUrl = (appId: string, phase: AiAppLogPhase): string =>
  `${AI_APPS_RUNNER_URL}/v1/apps/${encodeURIComponent(appId)}/${phase}/logs`;

/**
 * Runner endpoint serving a live (no history) CPU/memory snapshot for an
 * app's pod alongside the configured resource limits (`GET
 * /v1/apps/<appId>/metrics`). Admin-only on our side — see
 * `AiAppsService.getMetrics`.
 */
export const buildRunnerMetricsUrl = (appId: string): string =>
  `${AI_APPS_RUNNER_URL}/v1/apps/${encodeURIComponent(appId)}/metrics`;

/**
 * `order=desc` member log reads. The runner (and CloudWatch behind it) pages
 * FORWARD from the window start, so the newest-first view the dashboard wants
 * is assembled here: walk the runner's pages server-side, retain only the
 * newest lines, and serve descending slices with an offset cursor. These
 * bounds cap one walk; if a window can't be walked within them the service
 * narrows the window (the tail survives narrowing — it's the end of any
 * window that reaches "now") before giving up.
 */
export const AI_APPS_LOGS_DESC_RETAIN = 5000;
export const AI_APPS_LOGS_DESC_RUNNER_LIMIT = 2000;
export const AI_APPS_LOGS_DESC_MAX_RUNNER_CALLS = 30;
export const AI_APPS_LOGS_DESC_TIME_BUDGET_MS = 20_000;
/** Divisors applied to the requested window when a walk blows the budget. */
export const AI_APPS_LOGS_DESC_NARROWINGS = [4, 16];
/** Fallback page size / hard cap for one desc response. */
export const AI_APPS_LOGS_DESC_DEFAULT_LIMIT = 500;
export const AI_APPS_LOGS_DESC_MAX_LIMIT = 2000;
/**
 * Completed walks are cached per instance so a reader scrolling through
 * history doesn't re-walk the runner for every page. An entry is FRESH for the
 * short TTL (logs move), then serve-stale up to the stale bound: a stale read
 * answers instantly from the cached walk while ONE background walk revalidates
 * — so the multi-second cold walk is paid once per window, not on every modal
 * open. Deploys drop the app's entries (see dropLogsTailCache) so a stale copy
 * never outlives the deployment it captured.
 */
export const AI_APPS_LOGS_DESC_CACHE_TTL_MS = 15_000;
export const AI_APPS_LOGS_DESC_CACHE_STALE_TTL_MS = 120_000;
export const AI_APPS_LOGS_DESC_CACHE_MAX_ENTRIES = 30;

/** Build the S3 key for an app bundle: apps/<appId>/<deploymentId>/app.zip */
export const buildAppS3Key = (appId: string, deploymentId: string): string => `apps/${appId}/${deploymentId}/app.zip`;

/**
 * Base domain apps are served under (app URL = https://<appId>.<domain>).
 * Set per environment; must match the runner's DEFAULT_DOMAIN_SUFFIX.
 */
export const AI_APPS_APP_DOMAIN = process.env.AI_APPS_APP_DOMAIN || 'os.pl.xyz';

/**
 * appIds that would give an app a platform hostname (`<appId>.<AI_APPS_APP_DOMAIN>`). Prod AI Apps share an ALB
 * ingress group with the Directory API, auth, forum and the orchestrator, so an app holding one of these hosts
 * could add a competing ALB rule for it. Built from the non-app Ingress hosts in both clusters plus generic
 * infrastructure names; `AI_APPS_RESERVED_APP_IDS_EXTRA` (comma list) adds more without a release.
 */
const AI_APPS_BUILTIN_RESERVED_APP_IDS = [
  // Platform hosts on os.pl.xyz (prod) and their dev counterparts.
  'api-directory',
  'api-events',
  'api-plaa',
  'api-data-enrichment',
  'auth',
  'forum',
  'notification-processor',
  'notification-receiver',
  'deployment-orchestrator-runner',
  'dev-directory',
  'dev-events',
  'dev-plaa',
  'dev-data-enrichment',
  'dev-auth',
  'dev-forum',
  'dev-notification-processor',
  'dev-notification-receiver',
  'dev-deployment-orchestrator-runner',
  // LabOS portal labels.
  'directoryv2',
  'os',
  // Generic infrastructure names.
  'www',
  'api',
  'app',
  'admin',
  'mail',
  'status',
  'docs',
  'grafana',
  'static',
  'cdn',
  'assets',
  'login',
  'sso',
  'id',
];

export const AI_APPS_RESERVED_APP_IDS: ReadonlySet<string> = new Set([
  ...AI_APPS_BUILTIN_RESERVED_APP_IDS,
  ...(process.env.AI_APPS_RESERVED_APP_IDS_EXTRA ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
]);

export const isReservedAppId = (appId: string): boolean => AI_APPS_RESERVED_APP_IDS.has(appId.toLowerCase());

function safeAppLabel(value: string) {
  const name = value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
  return name || 'app';
}

/**
 * Prod release name stays `appId`. Preview is `{appId}-preview`, with the suffix kept
 * inside Helm's 53-character release-name limit. Must match the orchestrator.
 */
export const releaseNameForTarget = (appId: string, environment: AiAppTargetEnvironment = 'prod'): string => {
  const base = safeAppLabel(appId);
  if (environment !== 'preview') return base.slice(0, 53).replace(/-+$/g, '');
  const suffix = '-preview';
  return `${base.slice(0, 53 - suffix.length).replace(/-+$/g, '')}${suffix}`;
};

/**
 * The sandbox host/URL for an app is deterministic from its appId, so we can
 * compute it up front (before the runner responds).
 * Prod: <appId>.<domain>. Preview: <appId>-preview.<domain>.
 */
export const buildAppHost = (appId: string, environment: AiAppTargetEnvironment = 'prod'): string => {
  const suffix = environment === 'preview' ? '-preview' : '';
  const label = `${safeAppLabel(appId)}${suffix}`.slice(0, 63).replace(/-+$/g, '');
  return `${label}.${AI_APPS_APP_DOMAIN}`;
};
export const buildAppUrl = (appId: string, environment: AiAppTargetEnvironment = 'prod'): string =>
  `https://${buildAppHost(appId, environment)}`;
export const buildAppHttpUrl = (appId: string, environment: AiAppTargetEnvironment = 'prod'): string =>
  `http://${buildAppHost(appId, environment)}`;

/**
 * Public base URL of THIS API. The agent-facing endpoint URLs written into the
 * starter kit are all derived from it (`<base>/v1/ai-apps/…`), so adding a new
 * endpoint needs no new env var. The per-endpoint vars below remain as optional
 * overrides for environments that already set them.
 */
export const AI_APPS_BASE_URL = process.env.AI_APPS_BASE_URL;

/** Public URL of THIS API's deploy endpoint, written into the starter kit so the agent knows where to POST. */
export const AI_APPS_DEPLOY_ENDPOINT = process.env.AI_APPS_DEPLOY_ENDPOINT || `${AI_APPS_BASE_URL}/v1/ai-apps/deploy`;

/** Public URL of THIS API's connect-session endpoint, written into the starter kit. */
export const AI_APPS_CONNECT_ENDPOINT =
  process.env.AI_APPS_CONNECT_ENDPOINT || `${AI_APPS_BASE_URL}/v1/ai-apps/connect`;

/**
 * Public URL of THIS API's draft-registration endpoint (apps that need runtime
 * secrets), written into the starter kit.
 */
export const AI_APPS_DRAFT_ENDPOINT = process.env.AI_APPS_DRAFT_ENDPOINT || `${AI_APPS_BASE_URL}/v1/ai-apps/draft`;

/**
 * Public URL of THIS API's member-context endpoint (`GET /v1/ai-apps/me`),
 * written into the starter kit so deployed apps know where to fetch the
 * signed-in member's identity from.
 */
export const AI_APPS_ME_ENDPOINT = process.env.AI_APPS_ME_ENDPOINT || `${AI_APPS_BASE_URL}/v1/ai-apps/me`;

/**
 * Public URL TEMPLATE of THIS API's agent metadata endpoint
 * (`PATCH /v1/ai-apps/:uid/agent`), written into the starter kit. The agent
 * replaces the literal `{appUid}` placeholder with the app's `uid` (returned by
 * the deploy/draft response and saved in `pln-app.config.json`).
 */
export const AI_APPS_METADATA_ENDPOINT =
  process.env.AI_APPS_METADATA_ENDPOINT || `${AI_APPS_BASE_URL}/v1/ai-apps/{appUid}/agent`;

/** Public (no auth) controlled tag vocabulary, so any kit version can read the live list. */
export const AI_APPS_TAGS_ENDPOINT = `${AI_APPS_BASE_URL}/v1/ai-apps/tags`;

/**
 * Public URL TEMPLATES of THIS API's agent log endpoints
 * (`GET /v1/ai-apps/:uid/logs/build` and `…/logs/runtime`), written into the
 * starter kit. The agent replaces the literal `{appUid}` placeholder with the
 * app's `uid` (saved as `appUid` in `pln-app.config.json`).
 */
export const AI_APPS_BUILD_LOGS_ENDPOINT =
  process.env.AI_APPS_BUILD_LOGS_ENDPOINT || `${AI_APPS_BASE_URL}/v1/ai-apps/{appUid}/logs/build`;
export const AI_APPS_RUNTIME_LOGS_ENDPOINT =
  process.env.AI_APPS_RUNTIME_LOGS_ENDPOINT || `${AI_APPS_BASE_URL}/v1/ai-apps/{appUid}/logs/runtime`;

/**
 * Public URL of THIS API's custom-event analytics endpoint
 * (`POST /v1/ai-apps/track`), written into the starter kit as
 * `analyticsEndpoint` so a deployed app can emit product events that land in
 * the Directory PostHog project with server-enforced attribution.
 */
export const AI_APPS_ANALYTICS_ENDPOINT =
  process.env.AI_APPS_ANALYTICS_ENDPOINT || `${AI_APPS_BASE_URL}/v1/ai-apps/track`;

/**
 * Event-name hygiene for `POST /v1/ai-apps/track`: every event lands in the
 * shared Directory PostHog project, so names are snake_case-normalized and
 * forced under one prefix server-side — a vibe-coded app cannot pollute the
 * shared namespace no matter what it sends.
 */
export const AI_APP_TRACK_EVENT_PREFIX = 'ai_app_';

/** Lowercase, underscore-separated, and prefixed with `AI_APP_TRACK_EVENT_PREFIX` if not already. */
export const normalizeAiAppEventName = (raw: string): string => {
  const snake = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base = snake || 'event';
  return base.startsWith(AI_APP_TRACK_EVENT_PREFIX) ? base : `${AI_APP_TRACK_EVENT_PREFIX}${base}`;
};

/**
 * Shape enforced for the anonymous distinct ID a guest app instance generates
 * and persists in localStorage (see the `app-analytics` kit skill). Anything
 * else is treated as malformed and dropped rather than forwarded as-is.
 */
export const AI_APP_ANON_ID_REGEX = /^anon:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Abuse/noise caps on `POST /v1/ai-apps/track`. Violating either one silently
 * drops the request (still 204) rather than 400ing — an open, unauthenticated
 * endpoint shouldn't give a scripted caller a signal about which check it hit.
 */
export const AI_APPS_TRACK_MAX_PROPERTIES_BYTES = 10 * 1024;
export const AI_APPS_TRACK_MAX_BATCH_EVENTS = 20;

/**
 * Base URL of the LabOS portal that hosts the connect page the member opens to
 * approve a session. Combined with the session uid to build the connect link.
 */
export const AI_APPS_PORTAL_URL = process.env.AI_APPS_PORTAL_URL;

/**
 * Origin (scheme + host) of the LabOS portal that iframes deployed apps. The
 * starter kit quotes it in its framing guidance (`frame-ancestors`).
 */
export const AI_APPS_PORTAL_ORIGIN: string = (() => {
  try {
    return new URL(AI_APPS_PORTAL_URL ?? '').origin;
  } catch {
    return 'https://os.pl.xyz';
  }
})();

/** The LabOS connect page URL a member opens to approve an agent's session. */
export const buildConnectUrl = (sessionUid: string): string =>
  `${AI_APPS_PORTAL_URL}/pl-infra/ai-apps/connect?session=${encodeURIComponent(sessionUid)}`;

/**
 * The LabOS app detail page for one AI App — for a draft this is where the
 * member enters secret values and clicks Deploy. The agent hands this link to
 * the member after registering a draft.
 */
export const buildAppPageUrl = (appUid: string): string =>
  `${AI_APPS_PORTAL_URL}/pl-infra/ai-apps/${encodeURIComponent(appUid)}`;

/**
 * The LabOS "Deployment settings" deep link for one AI App — opens the
 * update-secrets-and-redeploy modal directly on the app page. Shared with the
 * member when they want to change a stored secret (or redeploy) later.
 */
export const buildAppSettingsUrl = (appUid: string): string => `${buildAppPageUrl(appUid)}?settings=deployment`;

/**
 * Public URL TEMPLATE of the LabOS "Deployment settings" deep link, written
 * into the starter kit. The agent replaces the literal `{appUid}` placeholder
 * with the app's `uid` (saved as `appUid` in `pln-app.config.json`) to hand the
 * member a link that opens the update-secrets-and-redeploy modal.
 */
export const AI_APPS_APP_SETTINGS_ENDPOINT =
  process.env.AI_APPS_APP_SETTINGS_ENDPOINT || `${AI_APPS_PORTAL_URL}/pl-infra/ai-apps/{appUid}?settings=deployment`;

// ── Deploy lifecycle bell notifications ───────────────────────────────────

// Relative route — the notification bell resolves links against the frontend
// origin (not AI_APPS_PORTAL_URL) and breaks on absolute URLs.
export function aiAppDetailPath(appUid: string): string {
  return `/pl-infra/ai-apps/${appUid}`;
}

/**
 * `metadata.trigger` values stamped on each AI Apps bell notification —
 * mirrors the roadmap module's convention for one category covering several
 * distinct events.
 */
export const AI_APPS_NOTIFICATION_TRIGGERS = {
  DEPLOY_SUCCEEDED: 'deploy_succeeded',
  DEPLOY_FAILED: 'deploy_failed',
  ACCESS_GRANTED: 'access_granted',
} as const;

/**
 * All user-facing AI Apps deploy notification copy lives here so a wording
 * change is a one-file swap.
 */
export const AI_APPS_NOTIFICATION_MESSAGES = {
  deploySucceeded: (appName: string) => ({
    title: `New app deployed: ${appName}`,
    description: `${appName} just went live in AI Apps — check it out.`,
  }),
  deployFailed: (appName: string) => ({
    title: `Deploy failed: ${appName}`,
    // Deliberately generic: the runner's raw failure text can carry stack
    // fragments/internal hostnames, which are manager-only (see
    // AiAppDeploymentInfo.failureReason) — the owner sees the real reason on
    // the app page this notification links to, not in the notification body.
    description: 'Your app failed to deploy — open the app page for details and to retry.',
  }),
  accessGranted: (appName: string, ownerName: string | null) => ({
    title: `${appName} was shared with you`,
    description: `${ownerName ?? 'Its owner'} gave you access to this private AI App.`,
  }),
} as const;
