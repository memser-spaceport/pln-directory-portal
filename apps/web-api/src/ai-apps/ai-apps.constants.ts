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
export const AI_APPS_STARTER_KIT_VERSION = '1.4';

/** Header the AI agent sends with its short-lived deploy token. */
export const AI_APP_TOKEN_HEADER = 'x-app-token';

/** Prefix for minted short-lived deploy tokens (for easy identification). */
export const AI_APP_DEPLOY_TOKEN_PREFIX = 'plndeploy_';

/**
 * How long a PENDING connect session stays open for the member to log in and
 * approve it before it expires (10 minutes).
 */
export const AI_APPS_CONNECT_SESSION_TTL_MS = 10 * 60 * 1000;

/**
 * Lifetime of the deploy token minted on approval (60 minutes). The agent may
 * deploy repeatedly within this window; after it the member must reconnect.
 */
export const AI_APPS_DEPLOY_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Suggested poll interval (seconds) the agent waits between connect polls. */
export const AI_APPS_CONNECT_POLL_INTERVAL_SEC = 3;

/** Max app ZIP size accepted by the deploy endpoint (50 MB). */
export const AI_APPS_MAX_ZIP_BYTES = 50 * 1024 * 1024;

/** Max Markdown/HTML one-pager PRD upload size (1 MB). */
export const AI_APPS_MAX_PRD_BYTES = 1 * 1024 * 1024;

/**
 * Post-deploy liveness verification: when the runner call ends in a gateway
 * timeout, the deploy flow polls the app URL before deciding READY vs ERROR.
 * The window must cover the pod-up → domain-registration gap, which has been
 * observed to take 1–5 minutes — 24 attempts every 8s (plus up to 10s per
 * probe) covers ~6 minutes worst case.
 */
export const AI_APPS_VERIFY_ATTEMPTS = Number(process.env.AI_APPS_VERIFY_ATTEMPTS) || 24;
export const AI_APPS_VERIFY_INTERVAL_MS = Number(process.env.AI_APPS_VERIFY_INTERVAL_MS) || 8000;

/**
 * Secrets-injection retry while the Helm release is locked: when the runner's
 * `/deploy` build outlives the gateway timeout, its Helm upgrade is often still
 * running when the injection deployment fires, and the runner 409s with
 * `helm_release_locked`. The lock clears as soon as that upgrade finishes
 * (observed under ~2 minutes), so wait and retry instead of failing the deploy.
 * 8 retries every 15s covers ~2 minutes.
 */
export const AI_APPS_HELM_LOCK_RETRIES = Number(process.env.AI_APPS_HELM_LOCK_RETRIES) || 8;
export const AI_APPS_HELM_LOCK_RETRY_INTERVAL_MS = Number(process.env.AI_APPS_HELM_LOCK_RETRY_INTERVAL_MS) || 15000;

/**
 * How long an app may sit in DEPLOYING before the deploy counts as STUCK.
 * Deploys run synchronously inside the API process (runner build + liveness
 * verification + secrets injection), so a legitimate one settles to READY or
 * ERROR within ~10 minutes worst case (edge timeout + the verify window and
 * helm-lock retry budget above) — a DEPLOYING row older than this window means the
 * process died mid-deploy or the runner hung, and the row would otherwise stay
 * DEPLOYING forever. Stuck rows are settled to ERROR lazily on read.
 */
export const AI_APPS_DEPLOY_STUCK_MINUTES = Number(process.env.AI_APPS_DEPLOY_STUCK_MINUTES) || 15;
export const AI_APPS_DEPLOY_STUCK_MS = AI_APPS_DEPLOY_STUCK_MINUTES * 60 * 1000;

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
 * Runner endpoint that (re)deploys an already-built image with the named stored
 * secrets injected. The legacy `/deploy` (s3Key build) does NOT inject secrets,
 * so secret-bearing apps need this second call after the build.
 */
export const buildRunnerDeploymentsUrl = (): string =>
  `${AI_APPS_RUNNER_URL}/v1/projects/${AI_APPS_RUNNER_PROJECT}/deployments`;

/** Build the S3 key for an app bundle: apps/<appId>/<deploymentId>/app.zip */
export const buildAppS3Key = (appId: string, deploymentId: string): string => `apps/${appId}/${deploymentId}/app.zip`;

/**
 * Base domain apps are served under, per environment:
 * dev → dev.plnetwork.io, prod → prod.plnetwork.io.
 */
export const AI_APPS_APP_DOMAIN = process.env.AI_APPS_APP_DOMAIN || 'prod.plnetwork.io';

/**
 * The sandbox host/URL for an app is deterministic from its appId, so we can
 * compute it up front (before the runner responds): <appId>.<AI_APPS_APP_DOMAIN>
 */
export const buildAppHost = (appId: string): string => `${appId}.${AI_APPS_APP_DOMAIN}`;
export const buildAppUrl = (appId: string): string => `https://${buildAppHost(appId)}`;
export const buildAppHttpUrl = (appId: string): string => `http://${buildAppHost(appId)}`;

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

/**
 * Base URL of the LabOS portal that hosts the connect page the member opens to
 * approve a session. Combined with the session uid to build the connect link.
 */
export const AI_APPS_PORTAL_URL = process.env.AI_APPS_PORTAL_URL;

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
